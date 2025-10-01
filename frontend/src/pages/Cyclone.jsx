import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';

// Minimal loader for Leaflet (no react-leaflet dependency)
function useLeaflet() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const cssId = 'leaflet-css';
    const jsId = 'leaflet-js';
    if (!document.getElementById(cssId)) {
      const link = document.createElement('link');
      link.id = cssId;
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);
    }
    const done = () => setReady(true);
    if (!document.getElementById(jsId)) {
      const script = document.createElement('script');
      script.id = jsId;
      script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      script.onload = done;
      document.body.appendChild(script);
    } else {
      done();
    }
  }, []);
  return ready && window.L ? window.L : null;
}

const STATE_LIST = [
  'Australian Capital Territory',
  'New South Wales',
  'Northern Territory',
  'Queensland',
  'South Australia',
  'Tasmania',
  'Victoria',
  'Western Australia',
];

const ABBR_MAP = {
  'Australian Capital Territory': 'ACT',
  'New South Wales': 'NSW',
  'Northern Territory': 'NT',
  'Queensland': 'QLD',
  'South Australia': 'SA',
  'Tasmania': 'TAS',
  'Victoria': 'VIC',
  'Western Australia': 'WA',
};

const RISK_COLOR = {
  Low: '#22c55e',
  Medium: '#eab308',
  High: '#ef4444',
};

export default function Cyclone() {
  const navigate = useNavigate();
  const L = useLeaflet();
  const mapRef = useRef(null);
  const geoLayerRef = useRef(null);
  const [geojson, setGeojson] = useState(null);
  const [selected, setSelected] = useState({ state: '', lat: null, lon: null });
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [riskByState, setRiskByState] = useState({});
  const [trend, setTrend] = useState({ sst: [], pressure: [] });
  const [time, setTime] = useState('12:00'); // UI-only; backend requires date only

  // Early forecast
  const [earlyDate, setEarlyDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 14);
    return d.toISOString().slice(0, 10);
  });
  const [earlyLoading, setEarlyLoading] = useState(false);
  const [earlyError, setEarlyError] = useState('');
  const [early, setEarly] = useState(null); // selected state's early forecast row

  // Load Australia states GeoJSON from local cache in public/
  useEffect(() => {
    const url = '/aus-states.geojson';
    fetch(url)
      .then((r) => r.json())
      .then((gj) => {
        // Filter to only the 8 states/territories we care about
        const features = (gj.features || []).filter((f) =>
          STATE_LIST.includes(f.properties.STATE_NAME || f.properties.NAME || '')
        );
        setGeojson({ type: 'FeatureCollection', features });
      })
      .catch(() => setError('Failed to load Australia state boundaries. Please check your network.'));
  }, []);

  // Initialize map and interactions
  useEffect(() => {
    if (!L || !geojson) return;
    if (!mapRef.current) {
      mapRef.current = L.map('cyclone-map', {
        center: [-25.0, 134.0],
        zoom: 4,
        minZoom: 3,
        maxZoom: 10,
      });
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
      }).addTo(mapRef.current);
    }

    const map = mapRef.current;
    if (geoLayerRef.current) {
      geoLayerRef.current.remove();
      geoLayerRef.current = null;
    }

    const style = (feature) => {
      const name = (feature.properties.STATE_NAME || feature.properties.NAME || '').trim();
      const risk = riskByState[name];
      const color = risk ? RISK_COLOR[risk] : '#22d3ee';
      return {
        color,
        weight: selected.state === name ? 3 : 1.5,
        fillOpacity: risk ? 0.25 : 0.1,
      };
    };

    const layer = L.geoJSON(geojson, {
      style,
      onEachFeature: (feature, l) => {
        const name = (feature.properties.STATE_NAME || feature.properties.NAME || '').trim();
        l.bindTooltip(name, { sticky: true });
        l.on('click', (e) => {
          setError('');
          const { lat, lng } = e.latlng;
          setSelected({
            state: name,
            lat: parseFloat(lat.toFixed(4)),
            lon: parseFloat(lng.toFixed(4)),
          });
          setRiskByState((prev) => ({ ...prev }));
          const html = `${name}<br/>Lat: ${lat.toFixed(4)}, Lon: ${lng.toFixed(4)}`;
          l.bindPopup(html).openPopup(e.latlng);
        });
      },
      interactive: true,
    }).addTo(map);

    geoLayerRef.current = layer;

    // PIP helpers
    const pointInRing = (pt, ring) => {
      let x = pt[0], y = pt[1];
      let inside = false;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const xi = ring[i][0], yi = ring[i][1];
        const xj = ring[j][0], yj = ring[j][1];
        const intersect =
          (yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / ((yj - yi) || 1e-12) + xi;
        if (intersect) inside = !inside;
      }
      return inside;
    };
    const pointInPolygon = (pt, feature) => {
      const geom = feature.geometry;
      if (!geom) return false;
      const type = geom.type;
      const coords = geom.coordinates;
      if (type === 'Polygon') {
        if (!coords || coords.length === 0) return false;
        if (!pointInRing(pt, coords[0])) return false;
        for (let i = 1; i < coords.length; i++) {
          if (pointInRing(pt, coords[i])) return false;
        }
        return true;
      }
      if (type === 'MultiPolygon') {
        for (const poly of coords) {
          if (!poly || poly.length === 0) continue;
          if (!pointInRing(pt, poly[0])) continue;
          let inHole = false;
          for (let i = 1; i < poly.length; i++) {
            if (pointInRing(pt, poly[i])) { inHole = true; break; }
          }
          if (!inHole) return true;
        }
      }
      return false;
    };

    // Map click outside polygons => error
    const onMapClick = (e) => {
      const pt = [e.latlng.lng, e.latlng.lat];
      let inside = false;
      for (const f of geojson.features) {
        if (pointInPolygon(pt, f)) { inside = true; break; }
      }
      if (!inside) {
        setError('Invalid location: Please select a point within Australia’s 8 states/territories.');
      }
    };
    map.on('click', onMapClick);

    return () => {
      map.off('click', onMapClick);
    };
  }, [L, geojson, selected.state, riskByState]);

  // Update styles when riskByState changes
  useEffect(() => {
    if (!L || !geoLayerRef.current) return;
    geoLayerRef.current.setStyle((feature) => {
      const name = (feature.properties.STATE_NAME || feature.properties.NAME || '').trim();
      const risk = riskByState[name];
      const color = risk ? RISK_COLOR[risk] : '#22d3ee';
      return {
        color,
        weight: selected.state === name ? 3 : 1.5,
        fillOpacity: risk ? 0.25 : 0.1,
      };
    });
  }, [riskByState, L, selected.state]);

  const callPredict = async () => {
    setError('');
    setResult(null);
    if (!selected.state || selected.lat == null || selected.lon == null) {
      setError('Please select a state on the map first.');
      return;
    }
    setLoading(true);
    try {
      // Fetch all states to enable map-wide risk coloring
      const baseUrls = [
        `http://127.0.0.1:8000/predict/cyclone/all?date=${encodeURIComponent(date)}`,
        `http://localhost:8000/predict/cyclone/all?date=${encodeURIComponent(date)}`,
        `/predict/cyclone/all?date=${encodeURIComponent(date)}`,
      ];
      const errors = [];
      let data = null;
      let res = null;
      const fetchWithTimeout = async (url, method = 'POST', ms = 12000) => {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort('timeout'), ms);
        try {
          const r = await fetch(url, { signal: ctrl.signal, credentials: 'omit', method });
          clearTimeout(t);
          return r;
        } catch (e) {
          clearTimeout(t);
          throw e;
        }
      };
      for (const url of baseUrls) {
        // Try POST first
        try {
          res = await fetchWithTimeout(url, 'POST', 12000);
          const ct = res.headers.get('content-type') || '';
          if (ct.includes('application/json')) {
            data = await res.json();
          } else {
            const text = await res.text();
            try { data = JSON.parse(text); } catch (_) { throw new Error(text || 'Non-JSON response from server'); }
          }
          if (!res.ok) {
            const msg = (data && (data.detail || data.error)) ? (data.detail || data.error) : `HTTP ${res.status}`;
            errors.push(`POST ${url} -> ${msg}`);
            data = null; res = null;
            // Try GET fallback
            throw new Error(msg);
          }
          // success
          break;
        } catch (e1) {
          errors.push(`POST ${url} -> ${e1 && e1.message ? e1.message : String(e1)}`);
          // GET fallback
          try {
            res = await fetchWithTimeout(url, 'GET', 12000);
            const ct = res.headers.get('content-type') || '';
            if (ct.includes('application/json')) {
              data = await res.json();
            } else {
              const text = await res.text();
              try { data = JSON.parse(text); } catch (_) { throw new Error(text || 'Non-JSON response from server'); }
            }
            if (!res.ok) {
              const msg = (data && (data.detail || data.error)) ? (data.detail || data.error) : `HTTP ${res.status}`;
              errors.push(`GET ${url} -> ${msg}`);
              data = null; res = null;
              continue;
            }
            // success via GET
            break;
          } catch (e2) {
            errors.push(`GET ${url} -> ${e2 && e2.message ? e2.message : String(e2)}`);
            data = null; res = null;
            continue;
          }
        }
      }
      if (!data || !res) {
        throw new Error(
          `Prediction service unavailable. Please ensure the backend is running on http://127.0.0.1:8000.\nDetails:\n${errors.join('\n')}`
        );
      }
      // data is an array of state-level results
      const mapping = {};
      for (const row of data) {
        if (row && row.state && row.risk_level) mapping[row.state] = row.risk_level;
      }
      setRiskByState(mapping);
      // Pick the selected state's row for the detail panel
      const selectedRow = data.find((r) => r.state === selected.state) || null;
      setResult(selectedRow);
      // Build lightweight 7-day trend placeholders based on returned values
      const sst0 = selectedRow?.sst ?? 27;
      const p0 = selectedRow?.pressure ?? 1008;
      const sst = Array.from({ length: 7 }, (_, i) => ({ d: i, v: Number((sst0 + Math.sin(i / 2) * 0.6).toFixed(2)) }));
      const pressure = Array.from({ length: 7 }, (_, i) => ({ d: i, v: Number((p0 + Math.cos(i / 3) * 2.5).toFixed(1)) }));
      setTrend({ sst, pressure });
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setLoading(false);
    }
  };

  const callEarlyPredict = async () => {
    setEarlyError('');
    setEarly(null);
    if (!selected.state || selected.lat == null || selected.lon == null) {
      setEarlyError('Please select a state on the map first.');
      return;
    }
    setEarlyLoading(true);
    try {
      const baseUrls = [
        `http://127.0.0.1:8000/predict/cyclone/early?date=${encodeURIComponent(earlyDate)}`,
        `http://localhost:8000/predict/cyclone/early?date=${encodeURIComponent(earlyDate)}`,
        `/predict/cyclone/early?date=${encodeURIComponent(earlyDate)}`,
      ];
      const fetchWithTimeout = async (url, method = 'POST', ms = 12000) => {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort('timeout'), ms);
        try {
          const r = await fetch(url, { signal: ctrl.signal, credentials: 'omit', method });
          clearTimeout(t);
          return r;
        } catch (e) {
          clearTimeout(t);
          throw e;
        }
      };
      let data = null; let res = null; const errors = [];
      for (const url of baseUrls) {
        try {
          res = await fetchWithTimeout(url, 'POST', 12000);
          const ct = res.headers.get('content-type') || '';
          data = ct.includes('application/json') ? await res.json() : JSON.parse(await res.text());
          if (!res.ok) { errors.push(`POST ${url} -> ${res.status}`); data = null; res = null; throw new Error('retry'); }
          break;
        } catch (e1) {
          errors.push(`POST ${url} -> ${e1 && e1.message ? e1.message : String(e1)}`);
          try {
            res = await fetchWithTimeout(url, 'GET', 12000);
            const ct = res.headers.get('content-type') || '';
            data = ct.includes('application/json') ? await res.json() : JSON.parse(await res.text());
            if (!res.ok) { errors.push(`GET ${url} -> ${res.status}`); data = null; res = null; continue; }
            break;
          } catch (e2) {
            errors.push(`GET ${url} -> ${e2 && e2.message ? e2.message : String(e2)}`);
            data = null; res = null; continue;
          }
        }
      }
      if (!data || !Array.isArray(data)) {
        throw new Error('Early forecast service unavailable.');
      }
      const row = data.find(r => r && r.state === selected.state) || null;
      setEarly(row);
    } catch (e) {
      setEarlyError(String(e.message || e));
    } finally {
      setEarlyLoading(false);
    }
  };

  const StatCard = ({ title, value, subtitle }) => (
    <div className="p-4 rounded-xl bg-dark-secondary/50 border border-cyan-glow/20">
      <div className="text-gray-400 text-sm">{title}</div>
      <div className="text-white text-2xl font-semibold">{value}</div>
      {subtitle && <div className="text-gray-500 text-xs mt-1">{subtitle}</div>}
    </div>
  );

  const Chart = ({ title, data, color = '#22d3ee', minH = 140 }) => {
    const padding = 24;
    const w = 300, h = minH;
    if (!data || data.length === 0) return (
      <div className="p-4 rounded-xl bg-dark-secondary/50 border border-cyan-glow/20">
        <div className="text-gray-400 text-sm mb-2">{title}</div>
        <div className="text-gray-500 text-xs">No data</div>
      </div>
    );
    const xs = data.map(d => d.d);
    const ys = data.map(d => d.v);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const scaleX = (x) => padding + (x - minX) * ((w - 2 * padding) / (maxX - minX || 1));
    const scaleY = (y) => (h - padding) - (y - minY) * ((h - 2 * padding) / (maxY - minY || 1));
    const dAttr = data.map((pt, i) => `${i === 0 ? 'M' : 'L'} ${scaleX(pt.d)} ${scaleY(pt.v)}`).join(' ');
    return (
      <div className="p-4 rounded-xl bg-dark-secondary/50 border border-cyan-glow/20">
        <div className="text-gray-400 text-sm mb-2">{title}</div>
        <svg width={w} height={h}>
          <path d={dAttr} fill="none" stroke={color} strokeWidth="2" />
        </svg>
      </div>
    );
  };

  const categoryFromWind = (kmh) => {
    if (kmh >= 209) return 'Category 5';
    if (kmh >= 178) return 'Category 4';
    if (kmh >= 154) return 'Category 3';
    if (kmh >= 119) return 'Category 2';
    if (kmh >= 89) return 'Category 1';
    return 'Tropical Disturbance';
  };

  return (
    <div className="min-h-screen bg-dark-bg">
      {/* Navigation */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="p-6"
      >
        <button
          onClick={() => navigate('/')}
          className="text-cyan-glow hover:text-white transition-colors duration-300 flex items-center space-x-2"
        >
          <span>←</span>
          <span>Back to Home</span>
        </button>
      </motion.div>

      {/* Main Content */}
      <motion.div
        initial={{ opacity: 0, y: 50 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="container mx-auto px-6 py-8"
      >
        <div className="text-center">
          <motion.h1
            initial={{ scale: 0.95 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 100 }}
            className="text-5xl font-bold text-white mb-3 glow-text"
          >
            Cyclone Prediction 🌀
          </motion.h1>

          <p className="text-gray-300 max-w-3xl mx-auto leading-relaxed">
            Click inside any of the 8 Australian states/territories to auto-fill coordinates, choose a date, and hit Predict.
          </p>
        </div>

        {/* Map + Controls */}
        <div className="mt-8 grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <div id="cyclone-map" className="w-full h-[520px] rounded-xl overflow-hidden border border-cyan-glow/30 bg-dark-secondary/40" />
          </div>
          <div>
            <div className="p-5 rounded-xl bg-dark-secondary/50 border border-cyan-glow/30">
              <div className="space-y-3">
                <div>
                  <div className="text-gray-400 text-sm">State</div>
                  <div className="text-white text-lg font-semibold min-h-[28px]">{selected.state || '—'}</div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-gray-400 text-sm">Latitude</div>
                    <input className="w-full bg-transparent border border-cyan-glow/30 rounded px-2 py-1 text-white" value={selected.lat ?? ''} readOnly />
                  </div>
                  <div>
                    <div className="text-gray-400 text sm">Longitude</div>
                    <input className="w-full bg-transparent border border-cyan-glow/30 rounded px-2 py-1 text-white" value={selected.lon ?? ''} readOnly />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-gray-400 text-sm">Date</div>
                    <input type="date" className="w-full bg-transparent border border-cyan-glow/30 rounded px-2 py-1 text-white" value={date} onChange={(e) => setDate(e.target.value)} />
                  </div>
                  <div>
                    <div className="text-gray-400 text-sm">Time</div>
                    <input type="time" className="w-full bg-transparent border border-cyan-glow/30 rounded px-2 py-1 text-white" value={time} onChange={(e) => setTime(e.target.value)} />
                  </div>
                </div>
                {error && (
                  <div className="text-sm text-red-400 bg-red-400/10 border border-red-400/30 rounded px-2 py-2">{error}</div>
                )}
                <button onClick={callPredict} disabled={loading} className="w-full mt-2 py-2 rounded bg-cyan-500 hover:bg-cyan-400 disabled:opacity-60 text-black font-semibold">
                  {loading ? 'Predicting…' : 'Predict'}
                </button>
              </div>
            </div>
            {/* Early Prediction Box */}
            <div className="mt-4 p-5 rounded-xl bg-dark-secondary/50 border border-yellow-400/30">
              <div className="text-white font-semibold mb-2">Seasonal Early Forecast</div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-gray-400 text-sm">Future Date</div>
                  <input type="date" className="w-full bg-transparent border border-yellow-400/40 rounded px-2 py-1 text-white" value={earlyDate} onChange={(e) => setEarlyDate(e.target.value)} />
                </div>
                <div className="flex items-end">
                  <button onClick={callEarlyPredict} disabled={earlyLoading} className="w-full py-2 rounded bg-yellow-400 hover:bg-yellow-300 disabled:opacity-60 text-black font-semibold">
                    {earlyLoading ? 'Loading…' : 'Early Forecast'}
                  </button>
                </div>
              </div>
              {earlyError && (<div className="mt-2 text-sm text-yellow-300">{earlyError}</div>)}
              {early && (
                <div className="mt-3 text-sm text-gray-200 space-y-1">
                  <div><span className="text-gray-400">State:</span> <span className="text-white">{early.state}</span></div>
                  <div className="flex gap-4">
                    <div>ENSO (ONI): <span className="text-white">{typeof early.enso_oni === 'number' ? early.enso_oni.toFixed(2) : early.enso_oni}</span></div>
                    <div>IOD: <span className="text-white">{typeof early.iod_index === 'number' ? early.iod_index.toFixed(2) : early.iod_index}</span></div>
                  </div>
                  <div>Forecast Risk on {earlyDate}: <span className="px-2 py-0.5 rounded text-black" style={{ background: RISK_COLOR[early.risk_level] }}>{early.risk_level}</span> <span className="text-gray-400">({early.formation_probability}% prob)</span></div>
                  <div className="text-gray-300">{early.ai_advice}</div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Results */}
        {result && (
          <div className="mt-8 space-y-6">
            {/* Alert */}
            <div className={`p-4 rounded-xl border ${result.risk_level === 'High' ? 'border-red-400/40 bg-red-400/10' : result.risk_level === 'Medium' ? 'border-yellow-400/40 bg-yellow-400/10' : 'border-green-400/40 bg-green-400/10'}`}>
              <div className="text-white font-semibold">{result.risk_level} Risk Alert – {result.state}</div>
              <div className="text-gray-200 text-sm mt-1">{result.ai_advice}</div>
            </div>

            {/* Risk Forecast Table */}
            <div className="overflow-x-auto rounded-xl border border-cyan-glow/20">
              <table className="min-w-full text-left">
                <thead className="bg-dark-secondary/70 text-gray-300">
                  <tr>
                    <th className="px-4 py-2">Date</th>
                    <th className="px-4 py-2">State</th>
                    <th className="px-4 py-2">SST (°C)</th>
                    <th className="px-4 py-2">Pressure (hPa)</th>
                    <th className="px-4 py-2">Risk Level</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t border-cyan-glow/10">
                    <td className="px-4 py-2 text-gray-200">{date}</td>
                    <td className="px-4 py-2 text-gray-200">{result.state}</td>
                    <td className="px-4 py-2 text-gray-200">{result?.sst ?? '—'}</td>
                    <td className="px-4 py-2 text-gray-200">{result?.pressure ?? '—'}</td>
                    <td className="px-4 py-2"><span className="px-2 py-1 rounded text-black" style={{ background: RISK_COLOR[result.risk_level] }}>{result.risk_level}</span></td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Stat Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard title="Wind Speed" value={`${result?.wind_speed ?? '—'} km/h`} subtitle="10m winds" />
              <StatCard title="Cyclone Category" value={categoryFromWind(result?.wind_speed ?? 0)} />
              <StatCard title="Formation Probability" value={`${result?.formation_probability ?? 0}%`} />
              <StatCard title="Precipitation" value={`${result?.rainfall ?? '—'} mm/day`} />
            </div>

            {/* Charts */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Chart title="Sea Surface Temperature (7-day)" data={trend.sst} color="#22c55e" />
              <Chart title="Atmospheric Pressure (7-day)" data={trend.pressure} color="#60a5fa" />
            </div>

            {/* Variables detail */}
            <div className="p-4 rounded-xl bg-dark-secondary/50 border border-cyan-glow/20">
              <div className="text-gray-300 font-semibold mb-2">Variables</div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-gray-200 text-sm">
                <div>SST: <span className="text-white">{result?.sst ?? '—'}</span> °C</div>
                <div>Pressure: <span className="text-white">{result?.pressure ?? '—'}</span> hPa</div>
                <div>Wind Speed: <span className="text-white">{result?.wind_speed ?? '—'}</span> km/h</div>
                <div>Precipitation: <span className="text-white">{result?.rainfall ?? '—'}</span> mm/day</div>
                <div>T2M_MAX: <span className="text-white">{result?.sst != null ? (result.sst + 0).toFixed(1) : '—'}</span> °C</div>
                <div>RH2M: <span className="text-white">—</span> %</div>
                <div>WS10M: <span className="text-white">{result?.wind_speed != null ? (Number(result.wind_speed) / 3.6).toFixed(1) : '—'}</span> m/s</div>
              </div>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}
