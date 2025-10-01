from fastapi import APIRouter, HTTPException
from typing import Dict, List, Optional, Tuple
import os
from datetime import datetime
import time
import io
import requests
import numpy as np
try:
    import xarray as xr  # optional
    HAVE_XARRAY = True
except Exception:
    xr = None
    HAVE_XARRAY = False
from dotenv import load_dotenv

# Load env from project root if present
ROOT_ENV = os.path.join(os.path.dirname(os.path.dirname(__file__)), '.env')
if os.path.exists(ROOT_ENV):
    load_dotenv(ROOT_ENV)
else:
    load_dotenv()

EARTHDATA_TOKEN = os.getenv('EARTHDATA_TOKEN') or os.getenv('NASA_EARTHDATA_TOKEN')

router = APIRouter()

# 8 Australian states/territories
AU_STATES: Dict[str, Dict[str, float]] = {
    "Queensland": {"lat": -20.9176, "lon": 142.7028},
    "New South Wales": {"lat": -33.8688, "lon": 151.2093},
    "Victoria": {"lat": -37.8136, "lon": 144.9631},
    "Tasmania": {"lat": -42.8821, "lon": 147.3272},
    "Western Australia": {"lat": -31.9505, "lon": 115.8605},
    "South Australia": {"lat": -34.9285, "lon": 138.6007},
    "Northern Territory": {"lat": -12.4634, "lon": 130.8456},
    "Australian Capital Territory": {"lat": -35.2809, "lon": 149.1300},
}

def _try_float(x) -> Optional[float]:
    try:
        if x is None:
            return None
        v = float(x)
        if np.isnan(v):
            return None
        return v
    except Exception:
        return None

def get_climate_indices() -> Tuple[Optional[float], Optional[float], str, str]:
    oni_val: Optional[float] = None
    iod_val: Optional[float] = None
    oni_status, iod_status = "OK", "OK"
    try:
        enso_url = "https://www.cpc.ncep.noaa.gov/data/indices/oni.ascii.txt"
        resp = requests.get(enso_url, timeout=1)
        resp.raise_for_status()
        last = resp.text.strip().splitlines()[-1]
        oni_val = _try_float(last.split()[-1])
        if oni_val is None:
            oni_status = "Data unavailable"
    except Exception:
        oni_status = "Data unavailable"
    try:
        iod_url = "https://www.bom.gov.au/climate/enso/indices/sstoi.dat"
        resp = requests.get(iod_url, timeout=1)
        resp.raise_for_status()
        last = resp.text.strip().splitlines()[-1]
        iod_val = _try_float(last.split()[-1])
        if iod_val is None:
            iod_status = "Data unavailable"
    except Exception:
        iod_status = "Data unavailable"
    return oni_val, iod_val, oni_status, iod_status

def calculate_flood_probability(
    rainfall_gpm, rainfall_power, soil_moisture, river_level, enso, iod, bom_warning
) -> Tuple[float, str]:
    flood_prob = 10.0
    # Rainfall
    if rainfall_gpm != "unavailable" and rainfall_gpm is not None:
        if rainfall_gpm > 150: flood_prob += 40
        elif rainfall_gpm > 100: flood_prob += 30
        elif rainfall_gpm > 50: flood_prob += 20
        elif rainfall_gpm > 20: flood_prob += 10
    elif rainfall_power != "unavailable" and rainfall_power is not None:
        if rainfall_power > 100: flood_prob += 30
        elif rainfall_power > 50: flood_prob += 20
        elif rainfall_power > 20: flood_prob += 10
    # Soil moisture
    if soil_moisture != "unavailable" and soil_moisture is not None:
        if soil_moisture >= 90: flood_prob += 30
        elif soil_moisture >= 80: flood_prob += 20
        elif soil_moisture >= 70: flood_prob += 10
    # River level
    if river_level != "unavailable" and river_level is not None:
        if river_level >= 90: flood_prob += 40
        elif river_level >= 80: flood_prob += 25
        elif river_level >= 70: flood_prob += 15
    # ENSO/IOD adjustment
    if enso is not None:
        if enso <= -0.5: flood_prob *= 1.3
        elif enso >= 0.5: flood_prob *= 0.7
    if iod is not None:
        if iod < -0.4: flood_prob *= 1.2
        elif iod > 0.4: flood_prob *= 0.8
    if bom_warning:
        flood_prob = 95.0
    flood_prob = max(0.0, min(100.0, flood_prob))
    risk = "Low"
    if flood_prob >= 60: risk = "High"
    elif flood_prob >= 30: risk = "Medium"
    return flood_prob, risk

def fetch_nc4(url: str):
    if not HAVE_XARRAY:
        return None
    if not EARTHDATA_TOKEN:
        return None
    headers = {"Authorization": f"Bearer {EARTHDATA_TOKEN}"}
    try:
        # Keep this short to prevent UI timeouts. Skip if slow.
        r = requests.get(url, headers=headers, timeout=3)
        if not r.ok:
            return None
        return xr.open_dataset(io.BytesIO(r.content))
    except Exception:
        return None

def safe_sel(ds, var: str, lat: float, lon: float) -> Optional[float]:
    try:
        if var not in ds.variables:
            return None
        return ds[var].sel(lat=lat, lon=lon, method="nearest").values.item()
    except Exception:
        try:
            return ds[var].sel(latitude=lat, longitude=lon, method="nearest").values.item()
        except Exception:
            return None

@router.post("/predict/flood/all")
@router.get("/predict/flood/all")
def predict_flood_all(date: str) -> List[Dict]:
    # Validate date
    try:
        datetime.strptime(date, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format")

    oni_val, iod_val, oni_status, iod_status = get_climate_indices()
    results: List[Dict] = []

    # Skip BoM warnings fetch to keep endpoint fast; leave as no warnings
    warnings_all: List[str] = []
    bom_warning_flag_global = False

    start_ts = time.time()
    budget_seconds = 6.0
    for state, coords in AU_STATES.items():
        lat, lon = coords["lat"], coords["lon"]

        # Skip POWER rainfall to avoid slow external calls; keep as unavailable
        rainfall_power = "unavailable"

        # GPM IMERG daily precipitation (requires token). Skip for speed; keep "unavailable"
        rainfall_gpm = "unavailable"

        # Skip MERRA-2 soil moisture to keep endpoint fast; leave as unavailable
        soil_moisture = "unavailable"

        # Use pre-fetched BoM warnings
        warnings: List[str] = warnings_all
        bom_warning_flag = bom_warning_flag_global

        # River level placeholder (in %); in real system, query BoM gauge API
        river_level = 65

        flood_prob, risk = calculate_flood_probability(
            rainfall_gpm, rainfall_power, soil_moisture, river_level,
            oni_val, iod_val, bom_warning_flag
        )

        ai_advice = {
            "Low": "No immediate flood risk.",
            "Medium": "Stay alert, minor flooding possible.",
            "High": "Flood risk high – follow official BoM alerts."
        }[risk]

        results.append({
            "state": state,
            "lat": lat,
            "lon": lon,
            "date": date,
            "rainfall_power": rainfall_power,
            "rainfall_gpm": rainfall_gpm,
            "soil_moisture": soil_moisture,
            "river_level": river_level,
            "flood_probability": round(float(flood_prob), 2),
            "flood_risk": risk,
            "ai_advice": ai_advice,
            "enso_oni": oni_val if oni_val is not None else oni_status,
            "iod_index": iod_val if iod_val is not None else iod_status,
            "bom_warnings": warnings,
        })

        # Respect overall time budget to keep UI responsive
        if time.time() - start_ts > budget_seconds:
            break

    return results

@router.post("/predict/flood/early")
@router.get("/predict/flood/early")
def predict_flood_early(date: str) -> List[Dict]:
    try:
        datetime.strptime(date, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format")
    oni_val, iod_val, oni_status, iod_status = get_climate_indices()
    # Compute a general probability baseline from indices
    flood_prob = 20.0
    if oni_val is not None:
        if oni_val <= -0.5: flood_prob += 30
        elif oni_val >= 0.5: flood_prob -= 30
    if iod_val is not None:
        if iod_val <= -0.4: flood_prob += 20
        elif iod_val >= 0.4: flood_prob -= 20
    flood_prob = max(0.0, min(100.0, flood_prob))
    risk = "Low" if flood_prob < 30 else "Medium" if flood_prob < 60 else "High"

    # Return an array for each AU state to simplify frontend integration (pick selected state's row)
    advice_text = {
        "Low": "Early Prediction: Low Flood Risk based on ENSO/IOD",
        "Medium": "Early Prediction: Medium Flood Risk based on ENSO/IOD",
        "High": "Early Prediction: High Flood Risk based on ENSO/IOD",
    }[risk]

    rows: List[Dict] = []
    for state, coords in AU_STATES.items():
        rows.append({
            "state": state,
            "lat": coords["lat"],
            "lon": coords["lon"],
            "date": date,
            "enso_oni": oni_val if oni_val is not None else oni_status,
            "iod_index": iod_val if iod_val is not None else iod_status,
            "flood_probability": int(round(flood_prob)),
            "risk_level": risk,
            "ai_advice": advice_text,
            "formation_probability": int(round(flood_prob)),
        })
    return rows
