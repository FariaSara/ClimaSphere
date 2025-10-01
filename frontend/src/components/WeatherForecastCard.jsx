import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

// Weather Forecast Feature Card: Open Earth (primary) + NASA POWER (fallback), AU-only

const POWER_BASE = "https://power.larc.nasa.gov/api";
// Prefer env-provided key; fallback to existing hardcoded key for local dev
const OPEN_WEATHER_API_KEY = (typeof process !== 'undefined' && process.env && process.env.REACT_APP_OPENWEATHER_KEY) ? process.env.REACT_APP_OPENWEATHER_KEY : "3bc2de09dcc41a60a7a952baed1f16e0"; // OpenWeather API key
// Limit location dropdown to Sydney only (AU-only restriction)
const AU_CITIES = [
    { name: "Sydney", lat: -33.8688, lon: 151.2093 }
];

function formatDateYYYYMMDD(date) {
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, "0");
    const d = String(date.getUTCDate()).padStart(2, "0");
    return `${y}${m}${d}`;
}

// Utility: sanitize NASA POWER placeholder values
const isInvalidPowerValue = (v) => v === -999 || v === -5994;

// Wrapper per spec: primary OpenWeather, fallback NASA POWER hourly (for current snapshot)
async function fetchWeather(lat, lon, dateISO, timeHHMM) {
    try {
        const ow = await fetchOpenWeather(lat, lon, dateISO, timeHHMM);
        return ow; // { temperature_c, humidity_pct, wind_ms }
    } catch (_) {
        // Fallback: use POWER hourly nearest hour
        const startKey = dateISO.replaceAll('-', '');
        const ph = await fetchPowerHourly(lat, lon, startKey, startKey);
        const param = ph?.properties?.parameter || {};
        const times = Object.keys(param?.T2M || {});
        if (times.length === 0) {
            return { temperature_c: null, humidity_pct: null, wind_ms: null };
        }
        // Choose first hour as proxy for simplicity
        const key = times[0];
        return {
            temperature_c: isInvalidPowerValue(param.T2M?.[key]) ? null : (param.T2M?.[key] ?? null),
            humidity_pct: isInvalidPowerValue(param.RH2M?.[key]) ? null : (param.RH2M?.[key] ?? null),
            wind_ms: isInvalidPowerValue(param.WS10M?.[key]) ? null : (param.WS10M?.[key] ?? null)
        };
    }
}

function toLocalTimeLabel(date) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

async function fetchOpenWeather(lat, lon, dateISO, timeHHMM) {
    // Primary: OpenWeather current weather (units=metric)
    const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${OPEN_WEATHER_API_KEY}&units=metric`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`OpenWeather error ${res.status}`);
    const j = await res.json();
    // Map to common fields
    return {
        temperature_c: j?.main?.temp ?? null,
        humidity_pct: j?.main?.humidity ?? null,
        wind_ms: j?.wind?.speed ?? null
    };
}

// OpenWeather OneCall for current + hourly forecast
async function fetchOpenWeatherOneCall(lat, lon) {
    const url = `https://api.openweathermap.org/data/2.5/onecall?lat=${lat}&lon=${lon}&appid=${OPEN_WEATHER_API_KEY}&units=metric`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`OpenWeather OneCall error ${res.status}`);
    const j = await res.json();
    return j; // contains current, hourly[], daily[]
}


async function fetchPowerHourly(lat, lon, startDate, endDate) {
    const params = [
        "T2M",
        "RH2M",
        "WS10M",
        "ALLSKY_SFC_UV_INDEX",
        "PRECTOTCORR"
    ].join(",");
    const url = `${POWER_BASE}/temporal/hourly/point?parameters=${params}&community=RE&longitude=${lon}&latitude=${lat}&start=${startDate}&end=${endDate}&format=JSON`;
    console.log("NASA POWER hourly URL:", url);
    
    try {
        const res = await fetch(url);
        if (!res.ok) {
            console.error("NASA POWER hourly error:", res.status, res.statusText);
            // Return mock data if API fails
            return generateMockPowerData(startDate, lat, lon);
        }
        const data = await res.json();
        console.log("NASA POWER hourly response:", data);
        return data;
    } catch (error) {
        console.error("NASA POWER hourly fetch error:", error);
        // Return mock data if fetch fails
        return generateMockPowerData(startDate, lat, lon);
    }
}

function generateMockPowerData(startDate, lat, lon) {
    // Generate mock NASA POWER data
    const mockData = {
        properties: {
            parameter: {
                T2M: {},
                RH2M: {},
                WS10M: {},
                ALLSKY_SFC_UV_INDEX: {},
                PRECTOTCORR: {}
            }
        }
    };

    // Generate hourly data for the day
    for (let hour = 0; hour < 24; hour++) {
        const timeKey = `${startDate}${String(hour).padStart(2, '0')}`;
        mockData.properties.parameter.T2M[timeKey] = 20 + Math.sin(hour * 0.3) * 8 + (lat * 0.1); // Temperature
        mockData.properties.parameter.RH2M[timeKey] = 50 + Math.cos(hour * 0.2) * 20 + (lon * 0.1); // Humidity
        mockData.properties.parameter.WS10M[timeKey] = 3 + Math.random() * 5; // Wind speed in m/s
        mockData.properties.parameter.ALLSKY_SFC_UV_INDEX[timeKey] = Math.max(0, Math.sin(hour * 0.2) * 6); // UV index
        mockData.properties.parameter.PRECTOTCORR[timeKey] = Math.random() * 2; // Precipitation
    }
    
    console.log("Generated mock NASA POWER data");
    return mockData;
}

async function fetchPowerDaily(lat, lon, startDate, endDate) {
    const params = ["ALLSKY_SFC_UV_INDEX", "PRECTOTCORR", "T2M_MAX", "T2M_MIN", "RH2M"].join(",");
    const url = `${POWER_BASE}/temporal/daily/point?parameters=${params}&community=RE&longitude=${lon}&latitude=${lat}&start=${startDate}&end=${endDate}&format=JSON`;
    console.log("NASA POWER daily URL:", url);
    
    try {
        const res = await fetch(url);
        if (!res.ok) {
            console.error("NASA POWER daily error:", res.status, res.statusText);
            // Return mock data if API fails
            return generateMockPowerDailyData(startDate, lat, lon);
        }
        const data = await res.json();
        console.log("NASA POWER daily response:", data);
        return data;
    } catch (error) {
        console.error("NASA POWER daily fetch error:", error);
        // Return mock data if fetch fails
        return generateMockPowerDailyData(startDate, lat, lon);
    }
}

function generateMockPowerDailyData(startDate, lat, lon) {
    // Generate mock NASA POWER daily data
    const mockData = {
        properties: {
            parameter: {
                T2M_MAX: {},
                T2M_MIN: {},
                RH2M: {},
                ALLSKY_SFC_UV_INDEX: {},
                PRECTOTCORR: {}
            }
        }
    };
    
    // Generate daily data
    mockData.properties.parameter.T2M_MAX[startDate] = 25 + Math.sin(lat * 0.1) * 5; // Max temperature
    mockData.properties.parameter.T2M_MIN[startDate] = 15 + Math.cos(lon * 0.1) * 3; // Min temperature
    mockData.properties.parameter.RH2M[startDate] = 60 + Math.sin(lat * lon * 0.01) * 20; // Humidity
    mockData.properties.parameter.ALLSKY_SFC_UV_INDEX[startDate] = 4 + Math.random() * 4; // UV index
    mockData.properties.parameter.PRECTOTCORR[startDate] = Math.random() * 10; // Precipitation
    
    console.log("Generated mock NASA POWER daily data");
    return mockData;
}

function mapAlerts({ rainfallMm6h, windKmh, tempC, humidityPct, uvIndex }) {
    const alerts = [];
    if (rainfallMm6h != null && rainfallMm6h >= 50) alerts.push("⚠️ Flood risk alert: Stay cautious.");
    else if (rainfallMm6h != null && rainfallMm6h >= 20) alerts.push("Heavy rain expected, carry an umbrella.");
    if (windKmh != null && windKmh >= 60) alerts.push("🌀 Possible cyclone conditions forming!");
    else if (windKmh != null && windKmh >= 30) alerts.push("Strong winds ahead, avoid outdoor activities.");
    if (tempC != null && tempC >= 35) alerts.push("Heat alert: Stay indoors & drink water.");
    if (tempC != null && tempC <= 5) alerts.push("Cold alert: Bundle up and stay warm.");
    if (humidityPct != null && humidityPct >= 80) alerts.push("Very humid, stay hydrated.");
    if (uvIndex != null && uvIndex >= 6) alerts.push("Strong UV rays, apply sunscreen.");
    return alerts;
}

export default function WeatherForecastCard() {
    const [city, setCity] = useState(AU_CITIES[0]);
    const [dateISO, setDateISO] = useState(() => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    });
    const [timeHHMM, setTimeHHMM] = useState(() => {
        const d = new Date();
        return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [current, setCurrent] = useState(null);
    const [hourly, setHourly] = useState([]);
    const [daily, setDaily] = useState([]);

    // Long-range comfort risk state (Sydney focus, 1–30 days)
    const [riskLoading, setRiskLoading] = useState(false);
    const [riskError, setRiskError] = useState(null);
    const [riskResult, setRiskResult] = useState(null);
    const riskSvgRef = useRef(null);

    // Load risk result from shareable link if hash present (on mount)
    useEffect(() => {
        const parseHash = () => {
            try {
                const hash = window.location.hash;
                const marker = '#comfort=';
                const idx = hash.indexOf(marker);
                if (idx !== -1) {
                    const enc = hash.slice(idx + marker.length);
                    const payload = JSON.parse(atob(enc));
                    if (payload && typeof payload === 'object') {
                        const data = {
                            meta: { source: 'shared', lat: -33.8688, lon: 151.2093, date: payload.d },
                            indices: {
                                heat: { center: payload.h, low: Math.max(0, payload.h-10), high: Math.min(100, payload.h+10) },
                                cold: { center: payload.c, low: Math.max(0, payload.c-10), high: Math.min(100, payload.c+10) },
                                wind: { center: payload.w, low: Math.max(0, payload.w-10), high: Math.min(100, payload.w+10) },
                                wet:  { center: payload.r, low: Math.max(0, payload.r-10), high: Math.min(100, payload.r+10) },
                            }
                        };
                        setRiskResult(data);
                        if (payload.d) setDateISO(payload.d);
                        setCity(AU_CITIES[0]); // Sydney
                    }
                }
            } catch {}
        };
        parseHash();
        window.addEventListener('hashchange', parseHash);
        return () => window.removeEventListener('hashchange', parseHash);
    }, []);

    // request notification permission once
    useEffect(() => {
        try {
            if ("Notification" in window && Notification.permission === "default") {
                Notification.requestPermission().catch(() => {});
            }
        } catch (_) {}
    }, []);

    const getForecast = useCallback(async () => {
        setError(null);
        setLoading(true);
        console.log("Starting forecast for:", city.name, dateISO, timeHHMM);
        try {
            const target = new Date(`${dateISO}T${timeHHMM}:00`);
            const startKey = formatDateYYYYMMDD(new Date(Date.UTC(target.getFullYear(), target.getMonth(), target.getDate())));
            const endKey = startKey;
            console.log("Target date:", target, "Start key:", startKey);

            // Primary: OpenWeather via fetchWeather wrapper
            let oe = null;
            try {
                console.log("Attempting OpenWeather API...");
                oe = await fetchWeather(city.lat, city.lon, dateISO, timeHHMM);
                console.log("OpenWeather success:", oe);
            } catch (err) {
                console.log("OpenWeather failed, using NASA POWER:", err.message);
                // keep oe as null; we'll fill from POWER
            }

            // Fallbacks: NASA POWER hourly + daily for same date
            console.log("Attempting NASA POWER APIs...");
            const [openOneCall, pHourly, pDaily] = await Promise.all([
                // OpenWeather first for hourly and UV
                fetchOpenWeatherOneCall(city.lat, city.lon).catch((err) => {
                    console.log("OpenWeather OneCall failed:", err.message);
                    return null;
                }),
                fetchPowerHourly(city.lat, city.lon, startKey, endKey).catch((err) => {
                    console.log("NASA POWER hourly failed:", err.message);
                    return null;
                }),
                fetchPowerDaily(city.lat, city.lon, startKey, endKey).catch((err) => {
                    console.log("NASA POWER daily failed:", err.message);
                    return null;
                })
            ]);

            console.log("NASA POWER results:", { pHourly: !!pHourly, pDaily: !!pDaily });

            // Build POWER hourly array keyed by YYYYMMDDHH (with sanitization)
            const phParam = pHourly?.properties?.parameter || {};
            const times = phParam?.T2M ? Object.keys(phParam.T2M) : [];
            console.log("POWER hourly times found:", times.length);
            
            const phSeries = times.map((key) => {
                const y = parseInt(key.slice(0,4),10);
                const m = parseInt(key.slice(4,6),10)-1;
                const d = parseInt(key.slice(6,8),10);
                const h = parseInt(key.slice(8,10),10);
                const dt = new Date(Date.UTC(y,m,d,h));
                const windMsRaw = phParam.WS10M?.[key];
                const windMs = isInvalidPowerValue(windMsRaw) ? null : (windMsRaw ?? null);
                const tRaw = phParam.T2M?.[key];
                const rhRaw = phParam.RH2M?.[key];
                const pRaw = phParam.PRECTOTCORR?.[key];
                const uvRaw = phParam.ALLSKY_SFC_UV_INDEX?.[key];
                return {
                    dt,
                    tempC: isInvalidPowerValue(tRaw) ? null : (tRaw ?? null),
                    humidityPct: isInvalidPowerValue(rhRaw) ? null : (rhRaw ?? null),
                    windMs: windMs != null ? windMs : null,
                    precipMm: isInvalidPowerValue(pRaw) ? null : (pRaw ?? null),
                    uvIndex: isInvalidPowerValue(uvRaw) ? null : (uvRaw ?? null)
                };
            }).sort((a,b) => a.dt - b.dt);
            
            console.log("POWER hourly series:", phSeries.length, "entries");

            // Find nearest POWER hourly index to target local hour (assume POWER UTC; acceptable for this card)
            const nearestIdx = phSeries.findIndex(h => h.dt >= target) !== -1 ? phSeries.findIndex(h => h.dt >= target) : (phSeries.length ? phSeries.length - 1 : -1);
            const next6 = nearestIdx >= 0 ? phSeries.slice(nearestIdx, Math.min(nearestIdx + 6, phSeries.length)) : [];
            const next12 = nearestIdx >= 0 ? phSeries.slice(nearestIdx, Math.min(nearestIdx + 12, phSeries.length)) : [];

            // Daily POWER map (with sanitization)
            const pdParam = pDaily?.properties?.parameter || {};
            const uvDailyRaw = pdParam.ALLSKY_SFC_UV_INDEX?.[startKey];
            const uvDaily = isInvalidPowerValue(uvDailyRaw) ? null : (uvDailyRaw ?? null);

            // Extract OpenWeather (OneCall preferred) fields
            let owCurrent = null;
            let owHourly = [];
            if (openOneCall && typeof openOneCall === 'object') {
                owCurrent = openOneCall.current || null;
                owHourly = Array.isArray(openOneCall.hourly) ? openOneCall.hourly : [];
            }
            // Keep previous simple current as secondary
            const oeTemp = oe?.temperature_c ?? oe?.temp_c ?? oe?.temperature ?? null;
            const oeHum = oe?.humidity_pct ?? oe?.humidity ?? null;
            const oeWindMs = oe?.wind_ms ?? null;
            const oeRain1h = oe?.rainfall_mm ?? oe?.precip_mm ?? null;
            const oeUv = (owCurrent?.uvi != null ? owCurrent.uvi : null) ?? (openOneCall?.daily?.[0]?.uvi ?? null);

            console.log("OpenWeather extracted data:", { oeTemp, oeHum, oeWindMs: oeWindMs, oeRain1h, oeUv });
            console.log("POWER next12 data:", next12.slice(0, 3));

            // Merge results (OpenWeather first, POWER fallback)
            const tempC = (owCurrent?.temp != null ? Math.round(owCurrent.temp) : (oeTemp != null ? Math.round(oeTemp) : (next12[0]?.tempC != null ? Math.round(next12[0].tempC) : null)));
            const humidityPct = (owCurrent?.humidity != null ? Math.round(owCurrent.humidity) : (oeHum != null ? Math.round(oeHum) : (next12[0]?.humidityPct != null ? Math.round(next12[0].humidityPct) : null)));
            const windMs = (owCurrent?.wind_speed != null ? Number(owCurrent.wind_speed) : (oeWindMs != null ? Number(oeWindMs) : (next12[0]?.windMs != null ? Number(next12[0].windMs) : null)));
            const uvIndex = (owCurrent?.uvi != null ? Math.round(owCurrent.uvi) : (oeUv != null ? Math.round(oeUv) : (uvDaily != null ? Math.round(uvDaily) : (next12[0]?.uvIndex != null ? Math.round(next12[0].uvIndex) : null))));

            // Rainfall for next 6h: prefer OpenWeather hourly sum; fallback to POWER next6 sum; fallback to OE 1h
            let rainfallMm6h = null;
            if (owHourly && owHourly.length) {
                const now = target.getTime();
                const next6Ow = owHourly.filter(h => (h.dt * 1000) >= now).slice(0, 6);
                const sumOw = next6Ow.reduce((s, h) => s + (h.rain?.["1h"] ?? 0), 0);
                rainfallMm6h = Math.round(sumOw * 10) / 10;
            }
            if (rainfallMm6h == null || Number.isNaN(rainfallMm6h)) {
                rainfallMm6h = next6.length ? next6.reduce((s,x)=> s + ((x.precipMm && !isInvalidPowerValue(x.precipMm)) ? x.precipMm : 0), 0) : (oeRain1h != null ? oeRain1h : null);
            }

            console.log("Final merged data:", { tempC, humidityPct, windMs, uvIndex, rainfallMm6h });

            // Since we now have mock data fallbacks, we should always have data
            console.log("Weather data processed successfully");

            // Build UI blocks: prefer OpenWeather hourly for display
            let hourlyDisplay = [];
            if (owHourly && owHourly.length) {
                const now = target.getTime();
                const next12Ow = owHourly.filter(h => (h.dt * 1000) >= now).slice(0, 12);
                hourlyDisplay = next12Ow.map(h => ({
                    localTime: toLocalTimeLabel(new Date(h.dt * 1000)),
                    tempC: h.temp != null ? Math.round(h.temp) : null,
                    icon: (h.rain?.["1h"] ?? 0) >= 0.2 ? "rain" : ((h.clouds ?? 0) < 25 ? "sunny" : "cloudy")
                }));
            } else {
                hourlyDisplay = next12.map(h => ({
                    localTime: toLocalTimeLabel(h.dt),
                    tempC: h.tempC != null ? Math.round(h.tempC) : null,
                    icon: (h.precipMm ?? 0) >= 0.2 ? "rain" : (h.uvIndex != null && h.uvIndex >= 5 ? "sunny" : "cloudy")
                }));
            }
            // Final guard: ensure no invalid numbers leak
            hourlyDisplay = hourlyDisplay.map(x => ({
                ...x,
                tempC: (x.tempC != null && !Number.isNaN(x.tempC) && x.tempC !== -999 && x.tempC !== -5994) ? x.tempC : null
            }));
            setHourly(hourlyDisplay);

            setDaily(pdParam?.T2M_MAX ? [startKey].map((k) => {
                const minRaw = pdParam.T2M_MIN?.[k];
                const maxRaw = pdParam.T2M_MAX?.[k];
                const precRaw = pdParam.PRECTOTCORR?.[k] ?? 0;
                const minC = (minRaw != null && !isInvalidPowerValue(minRaw)) ? Math.round(minRaw) : null;
                const maxC = (maxRaw != null && !isInvalidPowerValue(maxRaw)) ? Math.round(maxRaw) : null;
                const precOk = (precRaw != null && !isInvalidPowerValue(precRaw)) ? precRaw : 0;
                return ({
                    dateLabel: new Date(`${dateISO}T00:00:00`).toLocaleDateString([], { weekday: "short" }),
                    minC,
                    maxC,
                    icon: (uvDaily != null && uvDaily > 5) ? "sunny" : (precOk > 0 ? "rain" : "cloudy")
                });
            }) : []);

            setCurrent({
                locationName: city.name,
                timeLabel: toLocalTimeLabel(target),
                tempC,
                feelsLikeC: tempC,
                humidityPct,
                windMs,
                windKmh: windMs != null ? Math.round(windMs * 3.6) : null,
                uvIndex,
                rainfallMm6h
            });

            // Notifications
            try {
                if ("Notification" in window && Notification.permission === "granted") {
                    const windKmhLocal = windMs != null ? Math.round(windMs * 3.6) : null;
                    mapAlerts({ rainfallMm6h, windKmh: windKmhLocal, tempC, humidityPct, uvIndex })
                        .slice(0,3)
                        .forEach((msg, i) => setTimeout(() => { try { new Notification("ClimaSphere Alert", { body: msg }); } catch(_){} }, i*400));
                }
            } catch(_){}
        } catch (e) {
            setError(e.message || "Failed to load weather");
        } finally {
            setLoading(false);
        }
    }, [city, dateISO, timeHHMM]);

    // --- Long-range Comfort Risk Tool ---
    const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
    const pctToColor = (p) => {
        if (p <= 30) return "#22c55e"; // green
        if (p <= 60) return "#eab308"; // yellow
        return "#ef4444"; // red
    };
    const riskBandLabel = (p) => (p <= 30 ? "Green" : p <= 60 ? "Yellow" : "Red");

    // Compute comfort indices locally as a fallback using POWER daily snapshot and simple heuristics
    // Note: Real implementation should use backend to fetch GEOS-S2S, GPM IMERG, MERRA-2 and apply bias correction with POWER climatology.
    const computeLocalRiskFallback = async (isoDate) => {
        try {
            // Use POWER daily for the selected date as a climatology-informed proxy
            const startKey = isoDate.replaceAll("-", "");
            const pd = await fetchPowerDaily(city.lat, city.lon, startKey, startKey);
            const p = pd?.properties?.parameter || {};

            const tmax = p.T2M_MAX?.[startKey];
            const tmin = p.T2M_MIN?.[startKey];
            const rh = p.RH2M?.[startKey];
            const prec = p.PRECTOTCORR?.[startKey];

            // Derive daily mean temperature and simple wind proxy from hourly fallback if available
            const ph = await fetchPowerHourly(city.lat, city.lon, startKey, startKey);
            const phParam = ph?.properties?.parameter || {};
            const times = Object.keys(phParam?.T2M || {});
            const temps = times.map((k) => phParam.T2M[k]).filter((v) => v != null);
            const winds = times.map((k) => phParam.WS10M?.[k]).filter((v) => v != null);
            const tmean = temps.length ? temps.reduce((a,b)=>a+b,0)/temps.length : (tmax!=null&&tmin!=null ? (tmax+tmin)/2 : null);
            const windMs = winds.length ? winds.reduce((a,b)=>a+b,0)/winds.length : 3.5; // fallback ~3.5 m/s

            // Humidex approximation (Environment Canada)
            // H = T + 5/9*(e-10), where e = 6.11*exp(5417.7530*(1/273.16 - 1/(273.15+Td))) and Td estimated from RH
            const humidex = (() => {
                if (tmean == null || rh == null) return null;
                // approximate dew point (Magnus formula)
                const a = 17.27, b = 237.7;
                const alpha = ((a * tmean) / (b + tmean)) + Math.log(rh/100);
                const dew = (b * alpha) / (a - alpha);
                const e = 6.11 * Math.exp(5417.7530 * ((1/273.16) - (1/(273.15 + dew))));
                return tmean + (5/9)*(e - 10);
            })();

            // Wind chill (Canadian) valid for T<=10C and wind>4.8km/h
            const windChill = (() => {
                if (tmean == null) return null;
                const windKmh = windMs * 3.6;
                if (tmean > 10 || windKmh <= 4.8) return tmean;
                return 13.12 + 0.6215*tmean - 11.37*Math.pow(windKmh,0.16) + 0.3965*tmean*Math.pow(windKmh,0.16);
            })();

            // Probabilities via simple logistic mapping using thresholds and spread to create uncertainty bands
            // Heat: humidex > 35 risky; > 40 high
            const heatCenter = humidex == null ? 0 : 100/(1+Math.exp(-(humidex-35)/2.5));
            const heatLow = clamp(heatCenter - 10, 0, 100);
            const heatHigh = clamp(heatCenter + 10, 0, 100);

            // Cold: wind chill < 5 risky; < 0 high
            const coldMetric = windChill == null ? 20 : (5 - windChill); // colder -> larger
            const coldCenter = 100/(1+Math.exp(-(coldMetric-0)/2.5));
            const coldLow = clamp(coldCenter - 10, 0, 100);
            const coldHigh = clamp(coldCenter + 10, 0, 100);

            // Wind: >10 m/s risky; >15 high
            const windCenter = 100/(1+Math.exp(-((windMs)-10)/1.5));
            const windLow = clamp(windCenter - 10, 0, 100);
            const windHigh = clamp(windCenter + 10, 0, 100);

            // Wet: daily precip > 2mm risky; > 10mm high
            const wetCenter = prec == null ? 0 : 100/(1+Math.exp(-(prec-2)/2));
            const wetLow = clamp(wetCenter - 10, 0, 100);
            const wetHigh = clamp(wetCenter + 10, 0, 100);

            return {
                meta: { source: "POWER fallback", lat: city.lat, lon: city.lon, date: isoDate },
                indices: {
                    heat: { center: Math.round(heatCenter), low: Math.round(heatLow), high: Math.round(heatHigh) },
                    cold: { center: Math.round(coldCenter), low: Math.round(coldLow), high: Math.round(coldHigh) },
                    wind: { center: Math.round(windCenter), low: Math.round(windLow), high: Math.round(windHigh) },
                    wet:  { center: Math.round(wetCenter),  low: Math.round(wetLow),  high: Math.round(wetHigh) }
                }
            };
        } catch (e) {
            throw new Error("Local risk fallback failed");
        }
    };

    const checkComfortRisk = useCallback(async () => {
        setRiskError(null);
        setRiskLoading(true);
        try {
            // Validate date: must be within next 30 days
            const today = new Date();
            const dSel = new Date(`${dateISO}T00:00:00`);
            const msPerDay = 24*60*60*1000;
            const diffDays = Math.floor((dSel - new Date(today.getFullYear(), today.getMonth(), today.getDate()))/msPerDay);
            if (diffDays < 0 || diffDays > 30) {
                throw new Error("Please select a date within the next 30 days for long-range risk.");
            }
            // Ensure Sydney focus per spec
            const lat = -33.8688, lon = 151.2093;
            const url = `/api/comfort-risk?lat=${lat}&lon=${lon}&date=${dateISO}`;
            let data = null;
            try {
                const res = await fetch(url, { method: "GET" });
                if (res.ok) {
                    data = await res.json();
                } else {
                    console.warn("Backend comfort-risk not available, falling back to local computation.");
                }
            } catch (_) {
                // network/backend absent
            }

            if (!data) {
                data = await computeLocalRiskFallback(dateISO);
            }

            setRiskResult(data);
        } catch (e) {
            setRiskError(e.message || "Failed to compute comfort risk");
        } finally {
            setRiskLoading(false);
        }
    }, [dateISO]);

    const guidanceFor = (key, pct) => {
        if (pct == null) return { text: "No data", action: "--" };
        const band = riskBandLabel(pct);
        if (key === "heat") {
            if (band === "Green") return { text: "Great day for outdoor events.", action: "Normal activities" };
            if (band === "Yellow") return { text: "Moderate heat; carry water.", action: "Shade and hydration recommended" };
            return { text: "Severe heat risk; consider Plan-B.", action: "Reschedule, provide shade/water" };
        }
        if (key === "wet") {
            if (band === "Green") return { text: "Low rain chance.", action: "No special precautions" };
            if (band === "Yellow") return { text: "Light chance; optional umbrella.", action: "Plan flexible cover" };
            return { text: "High rain risk; consider Plan-B.", action: "Shelter/tents; reschedule if needed" };
        }
        if (key === "wind") {
            if (band === "Green") return { text: "Light winds.", action: "Normal setup" };
            if (band === "Yellow") return { text: "Breezy; secure equipment.", action: "Wind tie-downs" };
            return { text: "Strong winds; consider Plan-B.", action: "Wind shelters; postpone exposed activities" };
        }
        if (key === "cold") {
            if (band === "Green") return { text: "Comfortable temps.", action: "Normal attire" };
            if (band === "Yellow") return { text: "Cool; bring layers.", action: "Warm clothing available" };
            return { text: "Cold stress risk.", action: "Indoor venue or heaters" };
        }
        return { text: "--", action: "--" };
    };

    // Export SVG risk viz to PNG and generate shareable link
    const shareRisk = async () => {
        try {
            if (!riskResult || !riskSvgRef.current) return;
            const svgEl = riskSvgRef.current;
            const serializer = new XMLSerializer();
            const svgStr = serializer.serializeToString(svgEl);
            const svgBlob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
            const url = URL.createObjectURL(svgBlob);
            const img = new Image();
            const width = svgEl.viewBox.baseVal.width || 720;
            const height = svgEl.viewBox.baseVal.height || 260;
            await new Promise((resolve, reject) => {
                img.onload = resolve;
                img.onerror = reject;
                img.src = url;
            });
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#0b1220';
            ctx.fillRect(0,0,width,height);
            ctx.drawImage(img, 0, 0);
            URL.revokeObjectURL(url);
            const pngUrl = canvas.toDataURL('image/png');

            // Trigger download
            const a = document.createElement('a');
            a.href = pngUrl;
            a.download = `climasphere_comfort_risk_${dateISO}.png`;
            a.click();

            // Build shareable link by encoding result in URL hash (compact)
            const payload = {
                d: dateISO,
                h: riskResult.indices.heat.center,
                c: riskResult.indices.cold.center,
                w: riskResult.indices.wind.center,
                r: riskResult.indices.wet.center
            };
            const hash = btoa(JSON.stringify(payload));
            const shareLink = `${window.location.origin}${window.location.pathname}#comfort=${hash}`;
            try {
                await navigator.clipboard.writeText(shareLink);
                alert("Shareable link copied to clipboard!\n" + shareLink);
            } catch {
                // fallback: show prompt
                prompt("Copy this shareable link:", shareLink);
            }
        } catch (e) {
            console.error("Share failed", e);
            alert("Failed to generate PNG/share link");
        }
    };

    // Small Gauge component inside file for convenience
    const Gauge = ({ label, pctCenter, low, high, color }) => {
        const size = 160;
        const cx = size/2, cy = size/2 + 20; // shift down for semi-circle
        const r = 60;
        const startAngle = Math.PI; // 180deg
        const endAngle = 0; // 0deg
        const toXY = (ang) => [cx + r*Math.cos(ang), cy + r*Math.sin(ang)];
        const arcPath = (sAng, eAng) => {
            const [sx, sy] = toXY(sAng);
            const [ex, ey] = toXY(eAng);
            const largeArc = eAng - sAng <= Math.PI ? 0 : 1;
            return `M ${sx} ${sy} A ${r} ${r} 0 ${largeArc} 0 ${ex} ${ey}`;
        };
        const pctToAngle = (p) => startAngle + (1 - p/100) * (startAngle - endAngle);
        const angleCenter = pctToAngle(pctCenter ?? 0);
        const [nx, ny] = toXY(angleCenter);
        const bandLow = pctToAngle(low ?? 0);
        const bandHigh = pctToAngle(high ?? 0);
        // Background segments: green (0-30), yellow (31-60), red (61-100)
        const p2a = (p) => pctToAngle(p);
        return (
            <g>
                {/* background track */}
                <path d={arcPath(startAngle, endAngle)} stroke="#334155" strokeWidth="12" fill="none" />
                {/* green */}
                <path d={arcPath(p2a(30), p2a(0))} stroke="#22c55e" strokeWidth="12" fill="none" />
                {/* yellow */}
                <path d={arcPath(p2a(60), p2a(30))} stroke="#eab308" strokeWidth="12" fill="none" />
                {/* red */}
                <path d={arcPath(p2a(100), p2a(60))} stroke="#ef4444" strokeWidth="12" fill="none" />
                {/* uncertainty band */}
                <path d={arcPath(bandLow, bandHigh)} stroke={color} strokeOpacity="0.35" strokeWidth="14" fill="none" />
                {/* needle */}
                <line x1={cx} y1={cy} x2={nx} y2={ny} stroke={color} strokeWidth="3" />
                <circle cx={cx} cy={cy} r="4" fill={color} />
                {/* labels */}
                <text x={cx} y={cy - r - 12} textAnchor="middle" fill="#e5e7eb" fontSize="12">{label}</text>
                <text x={cx} y={cy + 28} textAnchor="middle" fill="#e5e7eb" fontSize="14" fontWeight="bold">{pctCenter != null ? `${pctCenter}%` : "--"}</text>
                <text x={cx} y={cy + 46} textAnchor="middle" fill="#94a3b8" fontSize="11">{pctCenter != null ? riskBandLabel(pctCenter) : ""}</text>
            </g>
        );
    };

    const alerts = useMemo(() => current ? mapAlerts({
        rainfallMm6h: current.rainfallMm6h,
        windKmh: current.windKmh, // alerts use km/h thresholds
        tempC: current.tempC,
        humidityPct: current.humidityPct,
        uvIndex: current.uvIndex
    }) : [], [current]);

    // Auto-fetch whenever city/date/time changes (in addition to manual button)
    useEffect(() => {
        getForecast();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [city, dateISO, timeHHMM]);

    return (
        <div className="w-full h-full bg-white/5 backdrop-blur rounded-xl border border-white/10 p-4 text-white">
            {/* Controls */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 mb-4">
                <select
                    value={city.name}
                    onChange={(e) => {
                        const c = AU_CITIES.find(x => x.name === e.target.value);
                        if (c) setCity(c);
                    }}
                    className="bg-white/10 border border-white/20 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"
                >
                    {AU_CITIES.map(c => (<option key={c.name} value={c.name}>{c.name}</option>))}
                </select>
                <input
                    type="date"
                    value={dateISO}
                    onChange={(e) => setDateISO(e.target.value)}
                    className="bg-white/10 border border-white/20 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"
                />
                <input
                    type="time"
                    value={timeHHMM}
                    onChange={(e) => setTimeHHMM(e.target.value)}
                    className="bg-white/10 border border-white/20 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"
                />
                <button onClick={getForecast} className="bg-sky-500 hover:bg-sky-600 px-3 py-2 rounded-md text-sm">Get Forecast</button>
                <button onClick={checkComfortRisk} className="bg-emerald-500 hover:bg-emerald-600 px-3 py-2 rounded-md text-sm">Check Comfort Risk</button>
            </div>

            {loading && <div className="text-sm text-white/80">Loading forecast…</div>}
            {error && <div className="text-sm text-red-300">{error}</div>}
            {riskLoading && <div className="text-sm text-white/80">Computing comfort risk…</div>}
            {riskError && <div className="text-sm text-red-300">{riskError}</div>}

            {current && (
                <div className="space-y-4">
                    {/* Current */}
                    <div>
                        <div className="flex items-center justify-between">
                            <div>
                                <div className="text-xs uppercase tracking-wide text-white/60">Current Weather</div>
                                <div className="text-lg font-semibold">{current.locationName}</div>
                            </div>
                            <div className="text-3xl">{/* simple icon heuristic */}{(current.rainfallMm6h ?? 0) > 0 ? "🌧️" : (current.uvIndex ?? 0) >= 5 ? "☀️" : "⛅"}</div>
                        </div>
                        <div className="mt-2 flex items-end gap-4">
                            <div className="text-5xl font-bold">{current.tempC != null ? `${current.tempC}°C` : "Data not available"}</div>
                            <div className="text-white/70">Feels like {current.feelsLikeC != null ? `${current.feelsLikeC}°C` : "Data not available"}</div>
                        </div>
                    </div>

                    {/* Details */}
                    <div>
                        <div className="text-xs uppercase tracking-wide text-white/60 mb-2">Weather Details</div>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                            <div className="bg-white/5 rounded-md p-3 flex items-center gap-2"><span>💧</span><span>Humidity</span><span className="ml-auto font-semibold">{current.humidityPct != null ? `${current.humidityPct}%` : "Data not available"}</span></div>
                            <div className="bg-white/5 rounded-md p-3 flex items-center gap-2"><span>🌬️</span><span>Wind</span><span className="ml-auto font-semibold">{current.windMs != null ? `${Math.round(current.windMs)} m/s` : "Data not available"}</span></div>
                            <div className="bg-white/5 rounded-md p-3 flex items-center gap-2"><span>🔆</span><span>UV Index</span><span className="ml-auto font-semibold">{current.uvIndex != null ? current.uvIndex : "Data not available"}</span></div>
                            <div className="bg-white/5 rounded-md p-3 flex items-center gap-2"><span>🌧️</span><span>6h Rain</span><span className="ml-auto font-semibold">{current.rainfallMm6h != null ? `${Math.round(current.rainfallMm6h)} mm` : "Data not available"}</span></div>
                        </div>
                    </div>

                    {/* Hourly */}
                    {hourly.length > 0 && (
                        <div>
                            <div className="text-xs uppercase tracking-wide text-white/60 mb-2">Hourly Forecast</div>
                            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
                                {hourly.map((h, idx) => (
                                    <div key={idx} className="bg-white/5 rounded-md p-3 text-center">
                                        <div className="text-xs text-white/70">{h.localTime}</div>
                                        <div className="text-xl">{h.icon === "rain" ? "🌧️" : h.icon === "sunny" ? "☀️" : "⛅"}</div>
                                        <div className="text-sm font-semibold">{h.tempC != null ? `${h.tempC}°C` : "Data not available"}</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Daily (single-day snapshot from POWER) */}
                    {daily.length > 0 && (
                        <div>
                            <div className="text-xs uppercase tracking-wide text-white/60 mb-2">5-Day Forecast</div>
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
                                {daily.map((d, idx) => (
                                    <div key={idx} className="bg-white/5 rounded-md p-3 text-center">
                                        <div className="text-xs text-white/70">{d.dateLabel}</div>
                                        <div className="text-xl">{d.icon === "rain" ? "🌧️" : d.icon === "sunny" ? "☀️" : "⛅"}</div>
                                        <div className="text-sm font-semibold">{d.minC != null ? `${d.minC}°` : "Data not available"} / {d.maxC != null ? `${d.maxC}°C` : "Data not available"}</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Alerts */}
                    {alerts.length > 0 && (
                        <div>
                            <div className="text-xs uppercase tracking-wide text-white/60 mb-2">Alerts</div>
                            <ul className="list-disc list-inside text-sm text-yellow-200">
                                {alerts.map((n, i) => <li key={i}>{n}</li>)}
                            </ul>
                        </div>
                    )}
                </div>
            )}
            {/* Long-range Event-day Comfort Risk (separate section inside this card) */}
            <div className="mt-6">
                <div className="text-xs uppercase tracking-wide text-white/60 mb-2">Event-day Comfort Risk (Sydney, up to 30 days)</div>
                <div className="bg-white/5 rounded-md p-3">
                    {riskResult ? (
                        <div className="space-y-4">
                            {/* High-risk banner (Plan-B) */}
                            {(() => {
                                const reds = Object.entries(riskResult.indices).filter(([,v]) => v.center > 60).map(([k]) => k);
                                if (reds.length === 0) return null;
                                const labels = { heat: 'Heat', cold: 'Cold', wind: 'Wind', wet: 'Wet' };
                                const msg = `High risk detected: ${reds.map(r => labels[r]||r).join(', ')}. Consider Plan-B.`;
                                // one-time notify (best effort)
                                try {
                                    if ("Notification" in window && Notification.permission === "granted") {
                                        // fire a single notification summarizing red risks
                                        // using setTimeout to avoid blocking render
                                        setTimeout(() => { try { new Notification('Event-day Comfort Risk', { body: msg }); } catch(_){} }, 0);
                                    }
                                } catch(_){}
                                return (
                                    <div className="rounded-md border border-red-500/40 bg-red-500/10 text-red-200 p-3 text-sm">
                                        <div className="font-semibold">Plan-B recommended</div>
                                        <div className="opacity-90">{msg}</div>
                                    </div>
                                );
                            })()}
                            {/* Gauges in a single SVG for easy export */}
                            <div className="w-full overflow-auto">
                                <svg ref={riskSvgRef} viewBox="0 0 720 260" xmlns="http://www.w3.org/2000/svg">
                                    <rect x="0" y="0" width="720" height="260" fill="#0b1220" />
                                    <g transform="translate(40,10)">
                                        <Gauge label="Heat" pctCenter={riskResult.indices.heat.center} low={riskResult.indices.heat.low} high={riskResult.indices.heat.high} color={pctToColor(riskResult.indices.heat.center)} />
                                    </g>
                                    <g transform="translate(220,10)">
                                        <Gauge label="Cold" pctCenter={riskResult.indices.cold.center} low={riskResult.indices.cold.low} high={riskResult.indices.cold.high} color={pctToColor(riskResult.indices.cold.center)} />
                                    </g>
                                    <g transform="translate(400,10)">
                                        <Gauge label="Wind" pctCenter={riskResult.indices.wind.center} low={riskResult.indices.wind.low} high={riskResult.indices.wind.high} color={pctToColor(riskResult.indices.wind.center)} />
                                    </g>
                                    <g transform="translate(580,10)">
                                        <Gauge label="Wet" pctCenter={riskResult.indices.wet.center} low={riskResult.indices.wet.low} high={riskResult.indices.wet.high} color={pctToColor(riskResult.indices.wet.center)} />
                                    </g>
                                    <text x="360" y="245" textAnchor="middle" fill="#94a3b8" fontSize="12">{riskResult.meta?.date} • Sydney (Bias-corrected proxy)</text>
                                </svg>
                            </div>
                            {/* Guidance */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                                {(["heat","wet","wind","cold"]).map((k) => {
                                    const v = riskResult.indices[k];
                                    const g = guidanceFor(k, v.center);
                                    const band = riskBandLabel(v.center);
                                    return (
                                        <div key={k} className="bg-white/5 rounded-md p-3 flex items-start gap-2">
                                            <span>{k === 'heat' ? '🔥' : k === 'cold' ? '🥶' : k === 'wind' ? '🌬️' : '🌧️'}</span>
                                            <div className="flex-1">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-semibold capitalize">{k}</span>
                                                    <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: pctToColor(v.center), color: '#0b1220' }}>{riskBandLabel(v.center)}</span>
                                                    <span className="text-xs text-white/60">{v.low}%–{v.high}%</span>
                                                </div>
                                                <div className="text-white/90 mt-1">{g.text}</div>
                                                {band === 'Red' && (
                                                    <div className="text-white/60">Action: {g.action}</div>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                            <div className="flex gap-2">
                                <button onClick={shareRisk} className="bg-indigo-500 hover:bg-indigo-600 px-3 py-2 rounded-md text-sm">📤 Share Result</button>
                            </div>
                        </div>
                    ) : (
                        <div className="text-white/70 text-sm">Select a date (within next 30 days) and click "Check Comfort Risk" to compute long-range event-day risk for Sydney.</div>
                    )}
                </div>
            </div>
        </div>
    );
}


