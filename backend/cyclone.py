from fastapi import APIRouter, Query, HTTPException
from fastapi.responses import JSONResponse
from typing import Optional, Dict, Tuple, Any, List
import os
from datetime import datetime
import math
import requests
import xml.etree.ElementTree as ET
try:
    import netCDF4 as nc  # optional for GPM IMERG parsing
    HAVE_NETCDF4 = True
except Exception:
    nc = None
    HAVE_NETCDF4 = False

# Router scoped to Cyclone Prediction feature only
router = APIRouter(tags=["cyclone"])

# State validation
STATE_ALIASES = {
    "ACT": "Australian Capital Territory",
    "NSW": "New South Wales",
    "NT": "Northern Territory",
    "QLD": "Queensland",
    "SA": "South Australia",
    "TAS": "Tasmania",
    "VIC": "Victoria",
    "WA": "Western Australia",
}
STATE_NAME_TO_ABBR = {v: k for k, v in STATE_ALIASES.items()}


def normalize_state(s: str) -> Tuple[str, str]:
    key = (s or "").strip()
    key_up = key.upper()
    if key_up in STATE_ALIASES:
        return STATE_ALIASES[key_up], key_up
    for full, ab in STATE_NAME_TO_ABBR.items():
        if key.lower() == full.lower():
            return full, ab
    raise HTTPException(status_code=400, detail="Invalid location. Please select from Australia’s 8 states/territories.")


POWER_BASE = "https://power.larc.nasa.gov/api"

def fetch_power_vars(lat: float, lon: float, ymd: str) -> Dict[str, Optional[float]]:
    params = [
        "T2M_MAX",
        "RH2M",
        "PRECTOTCORR",
        "WS10M",
        "WS2M",
        "PS",
        "PSL",
    ]
    url = (
        f"{POWER_BASE}/temporal/daily/point?parameters={','.join(params)}&community=RE&longitude={lon}"
        f"&latitude={lat}&start={ymd}&end={ymd}&format=JSON"
    )
    try:
        # Keep requests fast to avoid UI timeouts
        r = requests.get(url, timeout=2)
        if not r.ok:
            # graceful fallback
            p = {}
        else:
            data = r.json()
            p = (data.get("properties", {}) or {}).get("parameter", {})
    except Exception:
        p = {}

    def getv(name: str) -> Optional[float]:
        try:
            v = p.get(name, {}).get(ymd)
            return float(v) if v is not None else None
        except Exception:
            return None

    out: Dict[str, Optional[float]] = {
        "t2m_max": getv("T2M_MAX"),
        "rh2m": getv("RH2M"),
        "precip": getv("PRECTOTCORR"),
        "ws10m": getv("WS10M"),
        "ws2m": getv("WS2M"),
        "pressure": None,
    }
    pr = getv("PS")
    if pr is None:
        pr = getv("PSL")
    # Heuristic: POWER pressure often in kPa; convert to hPa if within kPa range
    if pr is not None and pr < 200:
        pr = pr * 10.0
    out["pressure"] = pr
    return out


def estimate_sst(lat: float, month: int) -> float:
    lat_abs = abs(lat)
    base = 30.0 - 0.25 * lat_abs
    seasonal = 3.0 * math.cos(((month - 2) / 12.0) * 2 * math.pi)
    return float(max(18.0, min(31.0, base + seasonal)))


def fetch_bom_warnings() -> List[str]:
    try:
        bom_url = "http://www.bom.gov.au/fwo/IDQ20065.xml"
        r = requests.get(bom_url, timeout=10)
        if r.status_code != 200:
            return []
        root = ET.fromstring(r.content)
        titles = [el.text for el in root.findall('.//item/title') if el is not None and el.text]
        return titles[:20]
    except Exception:
        return []


def fetch_gpm_imerg_daily(date_str: str, lat: float, lon: float, token: Optional[str]) -> Optional[float]:
    # Optional: attempt to fetch daily accumulated precipitation from GPM IMERG
    if not HAVE_NETCDF4 or not token:
        return None
    try:
        dt = datetime.strptime(date_str, "%Y-%m-%d")
        url = (
            f"https://gpm1.gesdisc.eosdis.nasa.gov/data/GPM_L3/GPM_3IMERGDF.07/"
            f"{dt.year:04d}/{dt.month:02d}/3B-DAY.MS.MRG.3IMERG.{dt.strftime('%Y%m%d')}-S000000-E235959.V07.nc4"
        )
        headers = {"Authorization": f"Bearer {token}"}
        r = requests.get(url, headers=headers, timeout=20)
        if not r.ok:
            return None
        # Read in-memory netCDF
        import io as _io
        ds = nc.Dataset('inmemory', memory=r.content)
        var = None
        for name in ["precipitationCal", "precipitation"]:
            if name in ds.variables:
                var = ds.variables[name]
                break
        if var is None:
            return None
        # Find nearest index by simple min diff (coordinates may be named lat/lon)
        lats = ds.variables.get('lat') or ds.variables.get('latitude')
        lons = ds.variables.get('lon') or ds.variables.get('longitude')
        if lats is None or lons is None:
            return None
        import numpy as _np
        lat_idx = int(_np.abs(_np.array(lats[:]) - lat).argmin())
        # Normalize lon to [0,360) if dataset uses that
        lon_vals = _np.array(lons[:])
        lon_norm = lon
        if lon_vals.max() > 180:
            lon_norm = (lon + 360.0) % 360.0
        lon_idx = int(_np.abs(lon_vals - lon_norm).argmin())
        # Time dimension first, then lat, lon
        val = var[0, lat_idx, lon_idx].item()
        return float(val)
    except Exception:
        return None


def get_climate_indices() -> Tuple[Optional[float], Optional[float], str, str]:
    """Fetch current ENSO ONI and IOD values with graceful fallbacks.
    Returns (oni_value, iod_value, oni_status, iod_status) where value may be None and status is either 'OK' or fallback message.
    """
    oni_val: Optional[float] = None
    iod_val: Optional[float] = None
    oni_status = "OK"
    iod_status = "OK"
    # ENSO (ONI)
    try:
        enso_url = "https://www.cpc.ncep.noaa.gov/data/indices/oni.ascii.txt"
        r = requests.get(enso_url, timeout=3)
        r.raise_for_status()
        lines = [ln for ln in r.text.strip().splitlines() if ln.strip()]
        # last numeric at end of last line
        oni_val = float(lines[-1].split()[-1])
    except Exception:
        oni_val = None
        oni_status = "Data temporarily unavailable"
    # IOD (BoM)
    try:
        iod_url = "https://www.bom.gov.au/climate/enso/indices/sstoi.dat"
        r = requests.get(iod_url, timeout=3)
        r.raise_for_status()
        lines = [ln for ln in r.text.strip().splitlines() if ln.strip()]
        iod_val = float(lines[-1].split()[-1])
    except Exception:
        iod_val = None
        iod_status = "Data temporarily unavailable"
    return oni_val, iod_val, oni_status, iod_status


def compute_risk_logic(temp_c: Optional[float], pressure_hpa: Optional[float], wind_kmh: Optional[float], warnings: List[str]) -> Tuple[str, int, str]:
    # Simple heuristic risk based on thresholds and official warnings
    risk = "Low"
    if temp_c is not None and pressure_hpa is not None and wind_kmh is not None:
        if any("Cyclone" in (w or "") for w in warnings) or (temp_c > 28 and pressure_hpa < 1000 and wind_kmh > 80):
            risk = "High"
        elif temp_c > 26 and pressure_hpa < 1010:
            risk = "Medium"
    formation_probability = 68 if risk == "High" else (45 if risk == "Medium" else 15)
    cyclone_category = "Category 3" if risk == "High" else ("Category 1" if risk == "Medium" else "None")
    return risk, formation_probability, cyclone_category


def craft_advice(state: str, sst: Optional[float], pressure: Optional[float], wind_kmh: Optional[float], risk: str) -> str:
    drivers = []
    if sst is not None and sst >= 28.0:
        drivers.append("warm SST")
    if pressure is not None and pressure < 1005:
        drivers.append("low surface pressure")
    if wind_kmh is not None and wind_kmh >= 90:
        drivers.append("strong winds")
    driver_txt = ", ".join(drivers) if drivers else "current atmospheric conditions"
    if risk == "High":
        return f"High Risk Alert – {state}: {driver_txt}. Prepare and monitor official guidance."
    if risk == "Medium":
        return f"Medium Risk Alert – {state}: {driver_txt}. Monitor the system closely."
    return f"Low Risk – {state}: Conditions are less favorable for cyclone formation."


# Australia States + central lat/lon
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


@router.get("/predict/cyclone")
def predict_cyclone(state: str = Query(...), lat: float = Query(...), lon: float = Query(...), date: str = Query(...)):
    # Validate state and date
    try:
        state_full, _ = normalize_state(state)
    except HTTPException:
        return JSONResponse(status_code=400, content={"error": "Invalid location. Please select from Australia’s 8 states/territories."})
    try:
        datetime.strptime(date, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format, expected YYYY-MM-DD")

    ymd = date.replace('-', '')
    met = fetch_power_vars(lat, lon, ymd)
    # Convert to display-friendly units
    t2m_max = met.get("t2m_max")
    pressure = met.get("pressure")
    wind_ms = met.get("ws10m") if met.get("ws10m") is not None else met.get("ws2m")
    wind_kmh = float(wind_ms * 3.6) if wind_ms is not None else None
    sst = estimate_sst(lat, datetime.strptime(date, "%Y-%m-%d").month)

    warnings = fetch_bom_warnings()
    # Optionally include GPM rainfall (may be None without token)
    token = os.getenv('EARTHDATA_TOKEN') or os.getenv('NASA_EARTHDATA_TOKEN')
    rainfall = fetch_gpm_imerg_daily(date, lat, lon, token)

    risk_level, formation_probability, cyclone_category = compute_risk_logic(t2m_max, pressure, wind_kmh, warnings)
    ai_advice = craft_advice(state_full, sst, pressure, wind_kmh, risk_level)

    return {
        "state": state_full,
        "lat": lat,
        "lon": lon,
        "date": date,
        "sst": round(sst, 2) if sst is not None else None,
        "pressure": round(float(pressure), 1) if pressure is not None else None,
        "wind_speed": round(float(wind_kmh), 1) if wind_kmh is not None else None,
        "rainfall": rainfall if rainfall is not None else "unavailable",
        "risk_level": risk_level,
        "formation_probability": formation_probability,
        "cyclone_category": cyclone_category,
        "ai_advice": ai_advice,
        "bom_warnings": warnings,
    }


def _predict_all_impl(date: str):
    # Date validation
    try:
        date_obj = datetime.strptime(date, "%Y-%m-%d")
        if date_obj.date() > datetime.utcnow().date():
            raise HTTPException(status_code=400, detail="Future dates not allowed")
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format, use YYYY-MM-DD")

    ymd = date.replace('-', '')
    warnings = fetch_bom_warnings()
    token = os.getenv('EARTHDATA_TOKEN') or os.getenv('NASA_EARTHDATA_TOKEN')
    oni_val, iod_val, oni_status, iod_status = get_climate_indices()

    results = []
    for state, coords in AU_STATES.items():
        lat, lon = coords["lat"], coords["lon"]
        try:
            met = fetch_power_vars(lat, lon, ymd)
        except HTTPException:
            met = {"t2m_max": None, "pressure": None, "ws10m": None, "ws2m": None, "precip": None, "rh2m": None}

        t2m_max = met.get("t2m_max")
        pressure = met.get("pressure")
        wind_ms = met.get("ws10m") if met.get("ws10m") is not None else met.get("ws2m")
        wind_kmh = float(wind_ms * 3.6) if wind_ms is not None else None
        sst = estimate_sst(lat, date_obj.month)
        rainfall = fetch_gpm_imerg_daily(date, lat, lon, token)

        risk_level, formation_probability, cyclone_category = compute_risk_logic(t2m_max, pressure, wind_kmh, warnings)
        ai_advice = craft_advice(state, sst, pressure, wind_kmh, risk_level)

        results.append({
            "state": state,
            "lat": lat,
            "lon": lon,
            "date": date,
            "sst": round(sst, 2) if sst is not None else None,
            "pressure": round(float(pressure), 1) if pressure is not None else None,
            "wind_speed": round(float(wind_kmh), 1) if wind_kmh is not None else None,
            "rainfall": rainfall if rainfall is not None else "unavailable",
            "risk_level": risk_level,
            "formation_probability": formation_probability,
            "cyclone_category": cyclone_category,
            "ai_advice": ai_advice,
            "bom_warnings": warnings,
            "enso_oni": oni_val if oni_val is not None else oni_status,
            "iod_index": iod_val if iod_val is not None else iod_status,
        })

    return results

@router.post("/predict/cyclone/all")
def predict_cyclone_all(date: str):
    return _predict_all_impl(date)

@router.get("/predict/cyclone/all")
def predict_cyclone_all_get(date: str):
    return _predict_all_impl(date)


def _early_forecast_impl(date: str):
    # Validate date format (future allowed)
    try:
        date_obj = datetime.strptime(date, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format, use YYYY-MM-DD")

    oni_val, iod_val, oni_status, iod_status = get_climate_indices()

    # Build risk based on climate drivers
    def baseline_from_indices(oni: Optional[float], iod: Optional[float]) -> int:
        base = 20
        if oni is not None:
            if oni <= -0.5:  # La Niña
                base += 30
            elif oni >= 0.5:  # El Niño
                base -= 20
        else:
            base += 0
        if iod is not None:
            if iod <= -0.4:  # negative IOD (wetter in Aus)
                base += 20
            elif iod >= 0.4:  # positive IOD (drier)
                base -= 15
        return max(0, min(100, base))

    base_prob = baseline_from_indices(oni_val, iod_val)

    results = []
    for state, coords in AU_STATES.items():
        lat, lon = coords["lat"], coords["lon"]
        sst = estimate_sst(lat, date_obj.month)
        # Map probability to qualitative level
        risk_level = "Low"
        if base_prob >= 60:
            risk_level = "High"
        elif base_prob >= 35:
            risk_level = "Medium"
        cyclone_category = "Category 3" if risk_level == "High" else ("Category 1" if risk_level == "Medium" else "None")
        ai_advice = (
            f"Seasonal outlook – {state}: ENSO/IOD suggest {risk_level.lower()} risk. Continue monitoring updates."
        )
        results.append({
            "state": state,
            "lat": lat,
            "lon": lon,
            "date": date,
            "sst": round(sst, 2) if sst is not None else None,
            "pressure": None,
            "wind_speed": None,
            "rainfall": "unavailable",
            "risk_level": risk_level,
            "formation_probability": base_prob,
            "cyclone_category": cyclone_category,
            "ai_advice": ai_advice,
            "enso_oni": oni_val if oni_val is not None else oni_status,
            "iod_index": iod_val if iod_val is not None else iod_status,
        })
    return results


@router.post("/predict/cyclone/early")
def predict_cyclone_early(date: str):
    return _early_forecast_impl(date)

@router.get("/predict/cyclone/early")
def predict_cyclone_early_get(date: str):
    return _early_forecast_impl(date)
