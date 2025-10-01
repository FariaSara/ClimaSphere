# ClimaSphere Comfort Risk Backend (FastAPI)

This FastAPI service provides `/api/comfort-risk` used by the Weather Forecast card's long-range event-day comfort risk tool.

It integrates NASA datasets (GEOS-S2S, GPM IMERG, MERRA-2) and NASA POWER to compute bias-corrected probabilities for heat/cold/wind/wet indices for Sydney, Australia.

## Endpoints

- `GET /api/comfort-risk?lat=-33.8688&lon=151.2093&date=YYYY-MM-DD`

Response schema:
```json
{
  "meta": {
    "source": "geos-s2s+gpm+merra2+power",
    "lat": "-33.8688",
    "lon": "151.2093",
    "date": "2025-10-17",
    "notes": "Bias-corrected using POWER climatology delta vs MERRA-2"
  },
  "indices": {
    "heat": { "center": 42, "low": 35, "high": 50 },
    "cold": { "center": 10, "low": 5, "high": 20 },
    "wind": { "center": 28, "low": 20, "high": 35 },
    "wet":  { "center": 55, "low": 45, "high": 65 }
  }
}
```

## Setup

1. Python 3.10+ recommended.
2. Install dependencies:
   ```bash
   pip install -r backend/requirements.txt
   ```
3. Configure environment in the project root `.env` (same directory as your frontend):
   ```env
   EARTHDATA_TOKEN=YOUR_NASA_EARTHDATA_BEARER_TOKEN
   ```
   - The backend will attempt to load this `.env` using `python-dotenv`.

## Run the API

```bash
uvicorn backend.app:app --reload --port 8000
```

The service will be available at `http://127.0.0.1:8000`.

## Testing

- Browser: `http://127.0.0.1:8000/api/comfort-risk?lat=-33.8688&lon=151.2093&date=2025-10-17`
- curl:
  ```bash
  curl "http://127.0.0.1:8000/api/comfort-risk?lat=-33.8688&lon=151.2093&date=2025-10-17"
  ```

## Frontend integration notes

- The frontend calls the API with a relative path (`/api/comfort-risk`). For local development, either:
  - Configure your frontend dev server to proxy `/api` to `http://127.0.0.1:8000` (recommended), or
  - Update the frontend to use a full base URL (e.g., `http://127.0.0.1:8000/api/comfort-risk`).
- CORS is enabled (`*`) in the backend for development convenience.

## Implementation details

- GEOS-S2S, GPM IMERG, MERRA-2 are fetched via Earthdata-protected endpoints using the `EARTHDATA_TOKEN`.
- POWER daily is fetched unauthenticated.
- A simple bias correction is applied: `T_bc = T_fore + (MERRA2_mean - POWER_mean)`.
- Probabilities are derived via logistic mappings with thresholds:
  - Heat (Humidex): 35 risk, 40 high
  - Cold (Wind Chill): 5°C risk, 0°C high
  - Wind: 10 m/s risk, 15 m/s high
  - Wet (precip): 2 mm/day risk, 10 mm/day high
- Uncertainty bands are ±15% if GEOS-S2S is available, else ±10%.

## Security

- Do not commit your Earthdata token. Keep it in the `.env` file locally or as a secret in your deployment environment.

---

# Bushfire Prediction Feature (API-driven)

This feature provides real-time and seasonal bushfire risk for Australia’s 8 states/territories. It is implemented as a standalone router and does not modify other features.

## New Endpoints

- `POST /predict/bushfire/all?date=YYYY-MM-DD` (also supports GET)
  - Returns an array of real-time bushfire risk for all 8 Australian states/territories using NASA POWER for temperature, humidity, and wind, and Earthdata (MERRA-2/NDVI if available) for vegetation dryness.

- `POST /predict/bushfire/early?date=YYYY-MM-DD` (also supports GET)
  - Returns a seasonal/early outlook per state using ENSO (ONI) and IOD indices only.

Example element from `/predict/bushfire/all`:
```json
{
  "state": "Queensland",
  "lat": -20.9176,
  "lon": 142.7028,
  "date": "2025-09-28",
  "temperature": 33.1,
  "humidity": 45.2,
  "wind_speed": 8.9,
  "vegetation_dryness": 62.3,
  "risk_score": 58.7,
  "risk_level": "Medium",
  "ai_advice": "Exercise caution; conditions may favor small fires.",
  "enso_oni": -0.21,
  "iod_index": 0.15
}
```

If any upstream dataset is unavailable, fields return the string `"unavailable"` instead of erroring.

## Environment

Add the following to your project root `.env`:

```env
# Shared (existing)
EARTHDATA_TOKEN=YOUR_NASA_EARTHDATA_BEARER_TOKEN

# Bushfire feature specific
BUSHFIRE_EARTHDATA_TOKEN=YOUR_SEPARATE_BUSHFIRE_BEARER_TOKEN
EARTHDATA_USERNAME=your_earthdata_username
EARTHDATA_PASSWORD=your_earthdata_password
```

- The bushfire feature uses `BUSHFIRE_EARTHDATA_TOKEN` for all Earthdata-protected requests.
- Username/password are loaded for potential future authenticated flows; current implementation prefers the token.

## Data Sources

- NASA POWER API: T2M (temp), RH2M (humidity), WS10M (wind)
- MERRA-2 (optional via Earthdata): soil moisture proxies (GWETTOP/GWETROOT/GWETPROF/SOILM)
- ENSO ONI (CPC) and IOD (BoM) indices

## Error Handling

- Robust try/except around all upstream fetches.
- Any missing metric is returned as `"unavailable"` and the API still responds with HTTP 200.

---

# Cyclone Prediction Feature (API-driven)

The Cyclone Prediction feature replaces all ML-based prediction with API-driven heuristics using open datasets.

## New Endpoints

- `GET /predict/cyclone?state=NSW&lat=-33.9&lon=151.2&date=YYYY-MM-DD`
  - Returns risk and variables for a single state/point.

- `POST /predict/cyclone/all?date=YYYY-MM-DD`
  - Returns an array of risk/variables for all 8 Australian states/territories.

Example response element (for a state):
```json
{
  "state": "Queensland",
  "lat": -20.9176,
  "lon": 142.7028,
  "date": "2025-09-26",
  "sst": 28.4,
  "pressure": 1006.3,
  "wind_speed": 52.1,
  "rainfall": 8.3,
  "risk_level": "Medium",
  "formation_probability": 45,
  "cyclone_category": "Category 1",
  "ai_advice": "Medium Risk Alert – Queensland: warm SST, low surface pressure. Monitor the system closely.",
  "bom_warnings": ["Cyclone Watch for Gulf of Carpentaria …"]
}
```

## Data Sources

- NASA POWER API (no token required): temperature (T2M_MAX), surface pressure (PS), wind speed (WS10M), precipitation (PRECTOTCORR)
- NASA GPM IMERG Daily (optional; requires Earthdata token): rainfall accumulation
- BoM (Bureau of Meteorology) public XML feeds: cyclone advisories and warnings

## Environment

Set an Earthdata token if you want GPM IMERG rainfall values (optional):

```env
EARTHDATA_TOKEN=YOUR_NASA_EARTHDATA_BEARER_TOKEN
```

If `EARTHDATA_TOKEN` is not set, rainfall returns as `"unavailable"` and risk is computed from POWER + BoM only.

## Notes

- All previous ML artifacts for this feature have been removed. Risk is computed via transparent thresholds and official warnings.
- CORS is enabled for local development.
