from fastapi import FastAPI, Query, HTTPException
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, Dict, Tuple, Any
import os
from datetime import datetime, timedelta
import math
import requests
import pickle
import numpy as np
try:
    import xarray as xr  # optional
    HAVE_XARRAY = True
except Exception:
    xr = None
    HAVE_XARRAY = False
import io
from dotenv import load_dotenv
from .cyclone import router as cyclone_router
from .flood import router as flood_router
from .bushfire import router as bushfire_router

# Load env from project root if present
ROOT_ENV = os.path.join(os.path.dirname(os.path.dirname(__file__)), '.env')
if os.path.exists(ROOT_ENV):
    load_dotenv(ROOT_ENV)
else:
    load_dotenv()

EARTHDATA_TOKEN = os.getenv('EARTHDATA_TOKEN') or os.getenv('NASA_EARTHDATA_TOKEN')

# Constants
SYDNEY_LAT = -33.8688
SYDNEY_LON = 151.2093
POWER_BASE = "https://power.larc.nasa.gov/api"

app = FastAPI(title="ClimaSphere Comfort Risk API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include Cyclone Prediction API router
app.include_router(cyclone_router)
app.include_router(flood_router)
app.include_router(bushfire_router)


class ComfortIndex(BaseModel):
    center: int
    low: int
    high: int

class ComfortRiskResponse(BaseModel):
    meta: Dict[str, Optional[str]]
    indices: Dict[str, ComfortIndex]


def fetch_nc4(url: str):
    if not HAVE_XARRAY:
        raise HTTPException(status_code=503, detail="xarray not available on server; advanced datasets disabled")
    if not EARTHDATA_TOKEN:
        raise HTTPException(status_code=500, detail="EARTHDATA_TOKEN not configured")
    headers = {"Authorization": f"Bearer {EARTHDATA_TOKEN}"}
    r = requests.get(url, headers=headers)
    if not r.ok:
        raise HTTPException(status_code=502, detail=f"Upstream error {r.status_code} for {url}")
    return xr.open_dataset(io.BytesIO(r.content))


def safe_sel(ds, var: str, lat: float, lon: float) -> Optional[float]:
    try:
        if var not in ds.variables:
            return None
        # attempt nearest selection on lat/lon
        return ds[var].sel(lat=lat, lon=lon, method="nearest").values.item()
    except Exception:
        try:
            # Alternative coordinate names
            return ds[var].sel(latitude=lat, longitude=lon, method="nearest").values.item()
        except Exception:
            return None


def fetch_geos_s2s(date_str: str):
    dt = datetime.strptime(date_str, "%Y-%m-%d")
    url = (
        f"https://portal.nccs.nasa.gov/datashare/gmao/s2s/"
        f"Y{dt.year}/M{dt.month:02d}/D{dt.day:02d}/"
        f"GEOS.s2s.tavg1_2d_slv_Nx.{dt.strftime('%Y%m%d')}_00.V01.nc4"
    )
    return fetch_nc4(url)


def fetch_gpm_imerg(date_str: str) -> Optional[float]:
    dt = datetime.strptime(date_str, "%Y-%m-%d")
    url = (
        f"https://gpm1.gesdisc.eosdis.nasa.gov/data/GPM_L3/GPM_3IMERGDF.07/"
        f"{dt.year:04d}/{dt.month:02d}/3B-DAY.MS.MRG.3IMERG.{dt.strftime('%Y%m%d')}-S000000-E235959.V07.nc4"
    )
    ds = fetch_nc4(url)
    return safe_sel(ds, "precipitationCal", SYDNEY_LAT, SYDNEY_LON)


def fetch_merra2(date_str: str) -> Dict[str, Optional[float]]:
    dt = datetime.strptime(date_str, "%Y-%m-%d")
    # Using collection 400 for 1980-present; adjust if index differs for current year
    url = (
        f"https://goldsmr4.gesdisc.eosdis.nasa.gov/data/MERRA2/M2SDNXSLV.5.12.4/"
        f"{dt.year:04d}/{dt.month:02d}/MERRA2_400.statD_2d_slv_Nx.{dt.strftime('%Y%m%d')}.nc4"
    )
    ds = fetch_nc4(url)
    t2m_k = safe_sel(ds, "T2M", SYDNEY_LAT, SYDNEY_LON)
    u10m = safe_sel(ds, "U10M", SYDNEY_LAT, SYDNEY_LON)
    v10m = safe_sel(ds, "V10M", SYDNEY_LAT, SYDNEY_LON)
    wind_ms = None
    if u10m is not None and v10m is not None:
        wind_ms = float((u10m**2 + v10m**2) ** 0.5)
    return {
        "t2m_c": (float(t2m_k) - 273.15) if t2m_k is not None else None,
        "wind_ms": wind_ms,
    }


def fetch_power_daily(lat: float, lon: float, date_str: str) -> Dict[str, Optional[float]]:
    ymd = date_str.replace("-", "")
    params = ",".join(["ALLSKY_SFC_UV_INDEX","PRECTOTCORR","T2M_MAX","T2M_MIN","RH2M"]) 
    url = (
        f"{POWER_BASE}/temporal/daily/point?parameters={params}&community=RE&longitude={lon}&latitude={lat}&start={ymd}&end={ymd}&format=JSON"
    )
    r = requests.get(url, timeout=8)
    if not r.ok:
        raise HTTPException(status_code=502, detail=f"POWER daily error {r.status_code}")
    data = r.json()
    p = (data.get("properties", {}) or {}).get("parameter", {})
    try:
        return {
            "tmax": float(p.get("T2M_MAX", {}).get(ymd)) if p.get("T2M_MAX", {}).get(ymd) is not None else None,
            "tmin": float(p.get("T2M_MIN", {}).get(ymd)) if p.get("T2M_MIN", {}).get(ymd) is not None else None,
            "rh": float(p.get("RH2M", {}).get(ymd)) if p.get("RH2M", {}).get(ymd) is not None else None,
            "prec": float(p.get("PRECTOTCORR", {}).get(ymd)) if p.get("PRECTOTCORR", {}).get(ymd) is not None else None,
        }
    except Exception:
        return {"tmax": None, "tmin": None, "rh": None, "prec": None}


def humidex(t_c: Optional[float], rh_pct: Optional[float]) -> Optional[float]:
    if t_c is None or rh_pct is None:
        return None
    a, b = 17.27, 237.7
    try:
        alpha = ((a * t_c) / (b + t_c)) + math.log(max(1e-6, rh_pct) / 100.0)
        dew = (b * alpha) / (a - alpha)
        e = 6.11 * math.exp(5417.7530 * ((1 / 273.16) - (1 / (273.15 + dew))))
        return t_c + (5.0 / 9.0) * (e - 10.0)
    except Exception:
        return None


def wind_chill(t_c: Optional[float], wind_ms: Optional[float]) -> Optional[float]:
    if t_c is None or wind_ms is None:
        return None
    wind_kmh = wind_ms * 3.6
    if t_c > 10 or wind_kmh <= 4.8:
        return t_c
    return 13.12 + 0.6215 * t_c - 11.37 * (wind_kmh ** 0.16) + 0.3965 * t_c * (wind_kmh ** 0.16)


def logistic_prob(x: float, x0: float, k: float) -> float:
    # 100/(1+exp(-(x-x0)/k))
    try:
        return 100.0 / (1.0 + math.exp(-((x - x0) / k)))
    except Exception:
        return 0.0


def clamp(v: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, v))


@app.get("/api/comfort-risk", response_model=ComfortRiskResponse)
def comfort_risk(lat: float = Query(SYDNEY_LAT), lon: float = Query(SYDNEY_LON), date: str = Query(...)):
    # Date validation: 1–30 days ahead window check is done on frontend, but re-check here
    try:
        dsel = datetime.strptime(date, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format, expected YYYY-MM-DD")

    today = datetime.utcnow().date()
    diff = (dsel.date() - today).days
    if diff < 0 or diff > 60:  # allow some slack on server
        raise HTTPException(status_code=400, detail="Date out of allowed range")

    # Fetch data sources
    try:
        s2s = fetch_geos_s2s(date)
    except HTTPException as e:
        # Non-fatal: proceed with others
        s2s = None
    try:
        gpm_prec = fetch_gpm_imerg(date)
    except HTTPException:
        gpm_prec = None
    try:
        merra = fetch_merra2(date)
    except HTTPException:
        merra = {"t2m_c": None, "wind_ms": None}
    try:
        power = fetch_power_daily(lat, lon, date)
    except HTTPException:
        power = {"tmax": None, "tmin": None, "rh": None, "prec": None}

    # Extract GEOS-S2S near-surface variables if available
    t2m_fore_c = None
    rh_fore = None
    wind_fore_ms = None
    if s2s is not None:
        # Common variable names attempt
        for v in ["T2M", "T2M_2m", "T2M_1"]:
            val = safe_sel(s2s, v, lat, lon)
            if val is not None:
                t2m_fore_c = float(val) - 273.15
                break
        for v in ["RH2M", "RH_2m"]:
            val = safe_sel(s2s, v, lat, lon)
            if val is not None:
                rh_fore = float(val)
                break
        # Winds at 10m: use U10M,V10M if present
        u = None; v = None
        for vn in ["U10M", "U10M_1"]:
            u = safe_sel(s2s, vn, lat, lon) if u is None else u
        for vn in ["V10M", "V10M_1"]:
            v = safe_sel(s2s, vn, lat, lon) if v is None else v
        if u is not None and v is not None:
            wind_fore_ms = float((u**2 + v**2) ** 0.5)

    # POWER daily derived means
    t_power_mean = None
    if power.get("tmax") is not None and power.get("tmin") is not None:
        t_power_mean = (power["tmax"] + power["tmin"]) / 2.0

    # Bias correction (simple): adjust forecast temperature using (MERRA2 - POWER) mean delta
    if t2m_fore_c is None:
        t2m_fore_c = t_power_mean  # fallback
    if merra.get("t2m_c") is not None and t_power_mean is not None and t2m_fore_c is not None:
        bias = merra["t2m_c"] - t_power_mean
        t2m_bc = t2m_fore_c + bias
    else:
        t2m_bc = t2m_fore_c

    # Wind bias: adjust forecast wind using MERRA mean (if available)
    wind_bc_ms = wind_fore_ms
    if merra.get("wind_ms") is not None and wind_bc_ms is None:
        wind_bc_ms = merra["wind_ms"]

    # Humidity: prefer GEOS-S2S, fallback POWER
    rh_used = rh_fore if rh_fore is not None else power.get("rh")

    # Precip: prefer GPM daily; fallback POWER
    prec_used = gpm_prec if gpm_prec is not None else power.get("prec")

    # Compute comfort metrics
    H = humidex(t2m_bc, rh_used) if t2m_bc is not None and rh_used is not None else None
    WC = wind_chill(t2m_bc, wind_bc_ms) if t2m_bc is not None and wind_bc_ms is not None else None

    # Probabilities via logistic mappings
    # Heat: humidex >35 risky; >40 high
    heat_center = 0.0 if H is None else logistic_prob(H, 35.0, 2.5)
    # Cold: wind chill <5 risky; <0 high (use 5 - WC)
    cold_metric = 20.0 if WC is None else (5.0 - WC)
    cold_center = logistic_prob(cold_metric, 0.0, 2.5)
    # Wind: >10 m/s risky; >15 m/s high
    wind_center = 0.0 if wind_bc_ms is None else logistic_prob(wind_bc_ms, 10.0, 1.5)
    # Wet: >2 mm/day risky; >10 high
    wet_center = 0.0 if prec_used is None else logistic_prob(prec_used, 2.0, 2.0)

    # Uncertainty bands: simple ±15% (models) or ±10% if mostly climatology fallbacks
    def band(center: float, model_based: bool) -> (int, int, int):
        pad = 15 if model_based else 10
        low = clamp(center - pad, 0.0, 100.0)
        high = clamp(center + pad, 0.0, 100.0)
        return int(round(center)), int(round(low)), int(round(high))

    model_based = s2s is not None  # if S2S was available

    hC, hL, hH = band(heat_center, model_based)
    cC, cL, cH = band(cold_center, model_based)
    wC, wL, wH = band(wind_center, model_based)
    rC, rL, rH = band(wet_center, model_based)

    return {
        "meta": {
            "source": "geos-s2s+gpm+merra2+power" if model_based else "power_climatology_fallback",
            "lat": f"{lat}",
            "lon": f"{lon}",
            "date": date,
            "notes": "Bias-corrected using POWER climatology delta vs MERRA-2"
        },
        "indices": {
            "heat": {"center": hC, "low": hL, "high": hH},
            "cold": {"center": cC, "low": cL, "high": cH},
            "wind": {"center": wC, "low": wL, "high": wH},
            "wet":  {"center": rC, "low": rL, "high": rH},
        }
    }

