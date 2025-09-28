from fastapi import APIRouter, HTTPException
from typing import Dict, List, Optional, Tuple
import os
from datetime import datetime
import time
import io
import requests
import numpy as np
try:
    import xarray as xr  # optional for Earthdata netCDF
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

# Separate Earthdata credentials for Bushfire feature
EARTHDATA_USERNAME = os.getenv("EARTHDATA_USERNAME")
EARTHDATA_PASSWORD = os.getenv("EARTHDATA_PASSWORD")
BUSHFIRE_EARTHDATA_TOKEN = os.getenv("BUSHFIRE_EARTHDATA_TOKEN")

router = APIRouter(tags=["bushfire"])

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

POWER_BASE = "https://power.larc.nasa.gov/api"

def _try_float(x) -> Optional[float]:
    try:
        if x is None:
            return None
        v = float(x)
        # Filter common sentinel/missing values
        if v in (-9999.0, -999.0, -99.0):
            return None
        if abs(v) > 1e6:
            return None
        if np.isnan(v):
            return None
        return v
    except Exception:
        return None

def _clamp_pct(v: Optional[float]) -> Optional[float]:
    if v is None:
        return None
    try:
        return max(0.0, min(100.0, float(v)))
    except Exception:
        return None

def _nonneg(v: Optional[float]) -> Optional[float]:
    if v is None:
        return None
    try:
        return max(0.0, float(v))
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

def fetch_power_vars(lat: float, lon: float, ymd: str) -> Dict[str, Optional[float]]:
    params = ["T2M", "RH2M", "WS10M", "PRECTOT"]
    url = (
        f"{POWER_BASE}/temporal/daily/point?parameters={','.join(params)}&community=RE&longitude={lon}"
        f"&latitude={lat}&start={ymd}&end={ymd}&format=JSON"
    )
    try:
        # Keep this fast to avoid frontend timeouts but allow typical network latency
        r = requests.get(url, timeout=2)
        p = (r.json().get("properties", {}) or {}).get("parameter", {}) if r.ok else {}
        return {
            "temp": _try_float((p.get("T2M", {}) or {}).get(ymd)),
            "humidity": _try_float((p.get("RH2M", {}) or {}).get(ymd)),
            "wind": _try_float((p.get("WS10M", {}) or {}).get(ymd)),
            "precip": _try_float((p.get("PRECTOT", {}) or {}).get(ymd)),
        }
    except Exception:
        return {"temp": None, "humidity": None, "wind": None, "precip": None}

def fetch_nc4(url: str):
    # Try Bearer token; if missing, skip to avoid long timeouts on protected endpoints
    if not HAVE_XARRAY:
        return None
    if not BUSHFIRE_EARTHDATA_TOKEN:
        return None
    headers = {"Authorization": f"Bearer {BUSHFIRE_EARTHDATA_TOKEN}"}
    try:
        # Use a very short timeout; skip if slow to keep API responsive
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

def fetch_merra_soil(date: str, lat: float, lon: float) -> Optional[float]:
    # Return soil moisture proxy as percent (0-100) if available
    try:
        dt = datetime.strptime(date, "%Y-%m-%d")
        url = (
            f"https://goldsmr4.gesdisc.eosdis.nasa.gov/data/MERRA2/M2SDNXSLV.5.12.4/"
            f"{dt.year:04d}/{dt.month:02d}/MERRA2_400.statD_2d_slv_Nx.{dt.strftime('%Y%m%d')}.nc4"
        )
        ds = fetch_nc4(url)
        if ds is None:
            return None
        for var in ["GWETTOP", "GWETROOT", "GWETPROF", "SOILM"]:
            v = safe_sel(ds, var, lat, lon)
            if v is not None:
                # GWET* are fraction (0-1). Convert to %.
                if var.startswith("GWET"):
                    return float(v) * 100.0
                return float(v)
        return None
    except Exception:
        return None

def estimate_veg_dryness(date: str, lat: float, lon: float) -> Optional[float]:
    # Prefer NDVI-based dryness if LAADS/LP DAAC was accessible. As a placeholder, invert soil moisture.
    # If token is missing, skip Earthdata calls to keep API responsive
    # To ensure snappy responses for UI, skip Earthdata-dependent calls by default.
    # If needed, re-enable by calling fetch_merra_soil with a short timeout.
    soil_pct = None
    if soil_pct is None:
        return None
    # Higher dryness when soil moisture is low
    dryness = max(0.0, min(100.0, 100.0 - soil_pct))
    return dryness

def calculate_bushfire_risk(
    temp: Optional[float], humidity: Optional[float], wind_speed: Optional[float], veg_dryness: Optional[float], enso: Optional[float], iod: Optional[float]
) -> Tuple[float, str]:
    risk_score = 10.0
    if temp is not None:
        if temp >= 40: risk_score += 40
        elif temp >= 35: risk_score += 30
        elif temp >= 30: risk_score += 20
        elif temp >= 25: risk_score += 10
    if humidity is not None:
        if humidity <= 20: risk_score += 40
        elif humidity <= 30: risk_score += 30
        elif humidity <= 40: risk_score += 20
        elif humidity <= 50: risk_score += 10
    if wind_speed is not None:
        if wind_speed >= 30: risk_score += 30
        elif wind_speed >= 20: risk_score += 20
        elif wind_speed >= 10: risk_score += 10
    if veg_dryness is not None:
        if veg_dryness >= 80: risk_score += 40
        elif veg_dryness >= 60: risk_score += 30
        elif veg_dryness >= 40: risk_score += 20
    # ENSO/IOD adjustments
    if enso is not None:
        if enso >= 0.5: risk_score *= 1.2
        elif enso <= -0.5: risk_score *= 0.8
    if iod is not None:
        if iod > 0.4: risk_score *= 1.1
        elif iod < -0.4: risk_score *= 0.9
    risk_score = max(0.0, min(100.0, risk_score))
    risk_level = "Low"
    if risk_score >= 60: risk_level = "High"
    elif risk_score >= 30: risk_level = "Medium"
    return risk_score, risk_level

@router.post("/predict/bushfire/all")
@router.get("/predict/bushfire/all")
def predict_bushfire_all(date: str) -> List[Dict]:
    # Validate date
    try:
        datetime.strptime(date, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format")

    oni_val, iod_val, oni_status, iod_status = get_climate_indices()
    results: List[Dict] = []
    ymd = date.replace('-', '')

    for state, coords in AU_STATES.items():
        lat, lon = coords["lat"], coords["lon"]

        # POWER daily vars
        met = fetch_power_vars(lat, lon, ymd)
        temp = met.get("temp")
        humidity = _clamp_pct(met.get("humidity"))
        wind = _nonneg(met.get("wind"))
        precip = _nonneg(met.get("precip"))

        # Skip slow Earthdata calls for the all-states endpoint; use fast heuristic fallback
        veg_dryness_opt = None
        # Heuristic dryness: d0 from humidity, adjusted by wind and rainfall
        try:
            d_candidates: List[float] = []
            if humidity is not None:
                d_candidates.append(max(0.0, min(100.0, 100.0 - float(humidity))))
            if precip is not None:
                # More rain reduces dryness (2 mm/day -> reduce ~4%)
                d_candidates.append(max(0.0, 100.0 - float(precip) * 2.0))
            dryness: Optional[float] = None
            if d_candidates:
                dryness = float(sum(d_candidates) / len(d_candidates))
                if wind is not None:
                    # Wind accelerates drying, small boost up to +12%
                    dryness = min(100.0, max(0.0, dryness) + min(12.0, float(wind) * 1.2))
                veg_dryness_opt = round(max(0.0, min(100.0, dryness)), 1)
        except Exception:
            veg_dryness_opt = None

        # Sanitize POWER values
        # Temperature can be negative in Celsius; keep as-is (already filtered for sentinels)
        temp = temp
        humidity = _clamp_pct(humidity)
        wind = _nonneg(wind)
        precip = _nonneg(precip)
        veg_dryness_opt = _clamp_pct(veg_dryness_opt)

        risk_score, risk_level = calculate_bushfire_risk(temp, humidity, wind, veg_dryness_opt, oni_val, iod_val)
        ai_advice = {
            "Low": "No immediate bushfire risk.",
            "Medium": "Exercise caution; conditions may favor small fires.",
            "High": "High bushfire risk – follow official warnings.",
        }.get(risk_level, "Unknown")

        results.append({
            "state": state,
            "lat": lat,
            "lon": lon,
            "date": date,
            "temperature": temp if temp is not None else "unavailable",
            "humidity": humidity if humidity is not None else "unavailable",
            "wind_speed": wind if wind is not None else "unavailable",
            "vegetation_dryness": veg_dryness_opt if veg_dryness_opt is not None else "unavailable",
            "risk_score": round(float(risk_score), 2),
            "risk_level": risk_level,
            "ai_advice": ai_advice,
            "enso_oni": oni_val if oni_val is not None else oni_status,
            "iod_index": iod_val if iod_val is not None else iod_status,
        })

        # No time budget break; always attempt to include all states

    return results

@router.post("/predict/bushfire/early")
@router.get("/predict/bushfire/early")
def predict_bushfire_early(date: str) -> List[Dict]:
    try:
        datetime.strptime(date, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format")

    oni_val, iod_val, oni_status, iod_status = get_climate_indices()
    # Seasonal baseline using indices only
    base = 20.0
    if oni_val is not None:
        if oni_val >= 0.5: base += 15  # El Niño tends to hotter/drier
        elif oni_val <= -0.5: base -= 5
    if iod_val is not None:
        if iod_val > 0.4: base += 10   # Positive IOD -> drier in AUS
        elif iod_val < -0.4: base -= 10
    base = max(0.0, min(100.0, base))
    risk_level = "Low"
    if base >= 60: risk_level = "High"
    elif base >= 30: risk_level = "Medium"
    advice_text = {
        "Low": "Seasonal outlook: Low bushfire risk based on ENSO/IOD.",
        "Medium": "Seasonal outlook: Elevated bushfire risk – prepare and stay informed.",
        "High": "Seasonal outlook: High bushfire risk – prepare for hotter and drier-than-normal conditions.",
    }[risk_level]

    rows: List[Dict] = []
    for state, coords in AU_STATES.items():
        rows.append({
            "state": state,
            "lat": coords["lat"],
            "lon": coords["lon"],
            "date": date,
            "enso_oni": oni_val if oni_val is not None else oni_status,
            "iod_index": iod_val if iod_val is not None else iod_status,
            "bushfire_probability": int(round(base)),
            "risk_level": risk_level,
            "ai_advice": advice_text,
        })
    return rows
