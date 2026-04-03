'use client';

// ConexionesTab — Mapa + dispositivos conectados + meteorología real

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';

const MapView = dynamic(() => import('./MapView'), { ssr: false });

const FARM_LAT = 39.9280;
const FARM_LON = -5.6530;

const C = {
  bg:         '#0a0e17',
  card:       '#111827',
  border:     '#1e293b',
  borderLg:   '#334155',
  text:       '#e2e8f0',
  muted:      '#94a3b8',
  dim:        '#64748b',
  accent:     '#0073E6',
  green:      '#10b981',
  greenGlow:  'rgba(16,185,129,0.15)',
  amber:      '#f59e0b',
  red:        '#ef4444',
  cyan:       '#06b6d4',
  font:       "'DM Sans', system-ui, sans-serif",
  mono:       "'DM Mono', 'Courier New', monospace",
};

interface Weather {
  temp: number; humidity: number; wind: number; windDir: number;
  code: number; precipitation: number; feelsLike: number; pressure: number;
}

function calcFireRisk(temp: number, hum: number, wind: number) {
  const tF = Math.max(0, Math.min(1, (temp - 15) / 25));
  const hF = Math.max(0, Math.min(1, (85 - hum) / 65));
  const wF = Math.max(0, Math.min(1, wind / 60));
  const score = Math.round((tF * 0.45 + hF * 0.40 + wF * 0.15) * 100);
  if (score >= 70) return { level: 'EXTREMO', color: C.red,   icon: '🔴', bg: 'rgba(239,68,68,0.12)',   border: 'rgba(239,68,68,0.3)',   score };
  if (score >= 50) return { level: 'ALTO',    color: C.amber, icon: '🟠', bg: 'rgba(245,158,11,0.12)',  border: 'rgba(245,158,11,0.3)',  score };
  if (score >= 25) return { level: 'MODERADO',color: C.amber, icon: '🟡', bg: 'rgba(245,158,11,0.08)',  border: 'rgba(245,158,11,0.25)', score };
  return               { level: 'BAJO',    color: C.green, icon: '🟢', bg: 'rgba(16,185,129,0.12)',  border: 'rgba(16,185,129,0.3)',  score };
}

function windDirection(deg: number) {
  const dirs = ['N','NE','E','SE','S','SO','O','NO'];
  return dirs[Math.round(deg / 45) % 8];
}

function weatherIcon(code: number) {
  if (code === 0)            return '☀️';
  if (code <= 2)             return '🌤️';
  if (code <= 48)            return '☁️';
  if (code <= 67)            return '🌧️';
  if (code <= 77)            return '🌨️';
  if (code <= 82)            return '🌦️';
  return '⛈️';
}

const DEVICES = [
  { icon: '🛩️', name: 'DJI Matrice 4TD',    type: 'Dron',           status: 'online',   detail: 'Batería 72% · En vuelo · Alt 120m' },
  { icon: '📡', name: 'Cámara SR7',          type: 'Cámara térmica', status: 'online',   detail: 'FLIR Lepton · 360° · 24/7' },
  { icon: '🏠', name: 'Dock A — Norte',      type: 'DJI Dock 2',     status: 'online',   detail: 'Energía OK · Puerta abierta' },
  { icon: '🏠', name: 'Dock B — Sur',        type: 'DJI Dock 2',     status: 'charging', detail: 'Cargando drone · ETA 9 min' },
  { icon: '🏠', name: 'Dock C — Este',       type: 'DJI Dock 2',     status: 'standby',  detail: 'En espera · Reserva' },
  { icon: '📶', name: 'Gateway 4G/LTE',      type: 'Red',            status: 'online',   detail: 'Ping 24ms · 98.3% uptime' },
];

const statusConfig: Record<string, { label: string; color: string; bg: string; border: string; dot: string }> = {
  online:   { label: 'Online',    color: C.green, bg: 'rgba(16,185,129,0.12)', border: 'rgba(16,185,129,0.3)', dot: C.green  },
  charging: { label: 'Cargando',  color: C.amber, bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.3)', dot: C.amber  },
  standby:  { label: 'Standby',   color: C.dim,   bg: 'rgba(100,116,139,0.12)',border: 'rgba(100,116,139,0.3)',dot: C.dim    },
  offline:  { label: 'Offline',   color: C.red,   bg: 'rgba(239,68,68,0.12)',  border: 'rgba(239,68,68,0.3)',  dot: C.red    },
};

export default function ConexionesTab() {
  const [weather, setWeather] = useState<Weather | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchWeather();
    const t = setInterval(fetchWeather, 15 * 60 * 1000);
    return () => clearInterval(t);
  }, []);

  const fetchWeather = async () => {
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${FARM_LAT}&longitude=${FARM_LON}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m,weather_code,precipitation,apparent_temperature,surface_pressure&timezone=Europe%2FMadrid&wind_speed_unit=kmh`;
      const res = await fetch(url);
      const d = await res.json();
      const c = d.current;
      setWeather({
        temp:          Math.round(c.temperature_2m),
        humidity:      Math.round(c.relative_humidity_2m),
        wind:          Math.round(c.wind_speed_10m),
        windDir:       Math.round(c.wind_direction_10m),
        code:          c.weather_code,
        precipitation: c.precipitation,
        feelsLike:     Math.round(c.apparent_temperature),
        pressure:      Math.round(c.surface_pressure),
      });
    } catch { /* ok */ }
    finally { setLoading(false); }
  };

  const fr = weather ? calcFireRisk(weather.temp, weather.humidity, weather.wind) : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* ── Row 1: Map + Devices ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20 }}>

        {/* Map */}
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="material-icons-round" style={{ fontSize: 18, color: C.accent }}>location_on</span>
            <div>
              <span style={{ fontSize: 14, fontWeight: 600, color: C.text }}>Dehesa Espadañal</span>
              <span style={{ fontSize: 11, color: C.dim, marginLeft: 8, fontFamily: C.mono }}>39.9280°N · -5.6530°O</span>
            </div>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 12, fontSize: 12, color: C.dim }}>
              <span>🛩️ <span style={{ color: C.accent }}>Drone</span> en vuelo</span>
              <span>📡 <span style={{ color: C.red }}>SR7</span> activa</span>
              <span style={{ color: C.green }}>🏠 2 Docks online</span>
            </div>
          </div>
          <div style={{ height: 480 }}>
            <MapView />
          </div>
          {/* Legend */}
          <div style={{ padding: '10px 18px', borderTop: `1px solid ${C.border}`, display: 'flex', gap: 20, fontSize: 11, color: C.dim }}>
            <span>🏠 DJI Dock 2</span>
            <span>🛩️ Drone en vuelo (animado)</span>
            <span>📡 Cámara 360° (cobertura en rojo)</span>
            <span style={{ color: 'rgba(0,115,230,0.7)' }}>— Límite finca</span>
          </div>
        </div>

        {/* Devices panel */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 18 }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 2, color: C.dim, marginBottom: 16 }}>
              Dispositivos conectados
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {DEVICES.map((d, i) => {
                const sc = statusConfig[d.status];
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 13px', background: 'rgba(255,255,255,0.02)', border: `1px solid ${C.border}`, borderRadius: 10 }}>
                    <div style={{ fontSize: 20, width: 36, height: 36, background: '#0f172a', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{d.icon}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: C.text, lineHeight: 1.3 }}>{d.name}</div>
                      <div style={{ fontSize: 11, color: C.dim, marginTop: 1 }}>{d.type}</div>
                      <div style={{ fontSize: 10, color: C.dim, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.detail}</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 20, background: sc.bg, border: `1px solid ${sc.border}`, fontSize: 11, fontWeight: 600, color: sc.color, flexShrink: 0 }}>
                      <span style={{ width: 5, height: 5, borderRadius: '50%', background: sc.dot, display: 'inline-block' }} />
                      {sc.label}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Summary counters */}
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 18 }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 2, color: C.dim, marginBottom: 14 }}>Red DLOS</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {[
                { label: 'Dispositivos', value: '6',     color: C.accent },
                { label: 'Online',       value: '4',     color: C.green  },
                { label: 'Uptime (30d)', value: '99.4%', color: C.cyan   },
                { label: 'Latencia red', value: '24ms',  color: C.muted  },
              ].map(s => (
                <div key={s.label} style={{ background: '#0f172a', borderRadius: 8, padding: '12px 14px' }}>
                  <div style={{ fontSize: 11, color: C.dim }}>{s.label}</div>
                  <div style={{ fontSize: 20, fontWeight: 700, fontFamily: C.mono, color: s.color, marginTop: 3 }}>{s.value}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Row 2: Weather ── */}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="material-icons-round" style={{ fontSize: 18, color: C.cyan }}>wb_sunny</span>
          <span style={{ fontSize: 14, fontWeight: 600, color: C.text }}>Condiciones meteorológicas en tiempo real</span>
          <span style={{ fontSize: 11, color: C.dim, marginLeft: 4, fontFamily: C.mono }}>39.9280°N · -5.6530°O · Open-Meteo API</span>
          {loading && <span style={{ marginLeft: 'auto', fontSize: 12, color: C.dim }}>Cargando...</span>}
        </div>

        {weather ? (
          <div style={{ padding: '18px 20px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 14, marginBottom: 16 }}>
              {[
                { icon: weatherIcon(weather.code), label: 'Temperatura',   value: `${weather.temp}°C`,          sub: `Sensación ${weather.feelsLike}°C` },
                { icon: '💧',                       label: 'Humedad',       value: `${weather.humidity}%`,        sub: 'Humedad relativa'                  },
                { icon: '💨',                       label: 'Viento',        value: `${weather.wind} km/h`,        sub: `Dirección ${windDirection(weather.windDir)}` },
                { icon: '🌧️',                      label: 'Precipitación', value: `${weather.precipitation} mm`, sub: 'Última hora'                       },
                { icon: '🔵',                       label: 'Presión',       value: `${weather.pressure} hPa`,     sub: 'Presión sup.'                      },
                { icon: fr?.icon ?? '🟢',           label: 'Riesgo fuego',  value: fr?.level ?? '—',              sub: `FWI ${fr?.score ?? 0}/100`, valueColor: fr?.color },
              ].map(stat => (
                <div key={stat.label} style={{ background: '#0f172a', borderRadius: 10, padding: '14px 16px' }}>
                  <div style={{ fontSize: 22, marginBottom: 6 }}>{stat.icon}</div>
                  <div style={{ fontSize: 11, color: C.dim, marginBottom: 3 }}>{stat.label}</div>
                  <div style={{ fontSize: 18, fontWeight: 700, fontFamily: C.mono, color: (stat as any).valueColor ?? C.text, lineHeight: 1 }}>{stat.value}</div>
                  <div style={{ fontSize: 10, color: C.dim, marginTop: 4 }}>{stat.sub}</div>
                </div>
              ))}
            </div>

            {/* Fire risk bar */}
            {fr && (
              <div style={{ background: fr.bg, border: `1px solid ${fr.border}`, borderRadius: 10, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 16 }}>
                <span style={{ fontSize: 20 }}>{fr.icon}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: fr.color, marginBottom: 6 }}>
                    Índice de riesgo de incendio: <span style={{ fontFamily: C.mono }}>{fr.level}</span> ({fr.score}/100)
                  </div>
                  <div style={{ height: 8, background: 'rgba(255,255,255,0.08)', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${fr.score}%`, background: `linear-gradient(90deg, ${C.green}, ${fr.color})`, borderRadius: 4, transition: 'width 1s ease' }} />
                  </div>
                </div>
                <div style={{ fontSize: 12, color: C.dim, textAlign: 'right', flexShrink: 0 }}>
                  Temp {weather.temp}°C · Hum {weather.humidity}% · Viento {weather.wind} km/h
                </div>
              </div>
            )}
          </div>
        ) : (
          <div style={{ padding: 24, display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 14 }}>
            {[...Array(6)].map((_, i) => (
              <div key={i} style={{ background: '#0f172a', borderRadius: 10, padding: 16, height: 90, opacity: 0.4 }} className="skeleton" />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
