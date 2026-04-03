'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState, useRef } from 'react';
import { ref, onValue } from 'firebase/database';
import { rtdb } from '@/lib/firebase';
import type { DronePoint } from '@/components/galisancho/DroneMap';

const DroneMap = dynamic(() => import('@/components/galisancho/DroneMap'), { ssr: false });

// ── Campos que guarda el backend en RTDB telemetry/{sn} ───────────────────────
interface RTDBTelemetry {
  sn:           string;
  latitude:     number;         // grados decimales (ya /1e7)
  longitude:    number;         // grados decimales (ya /1e7)
  altitude:     number;         // metros MSL (ya /10)
  height:       number;         // metros AGL (ya /10)
  gs:           number;         // ground speed m/s (ya /10)
  vs:           number;         // vertical speed m/s (ya /10)
  course:       number | null;  // grados 0-360 (ya /10), null si -999
  flightStatus: string;         // TakeOff | Inflight | Land
  uasModel:     string | null;
  uasId:        string | null;
  orderId:      string | null;
  timestamp:    string | null;  // yyyyMMddHHmmss UTC+8
  updatedAt:    number;         // Date.now() ms
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function compassLabel(deg: number) {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
  return dirs[Math.round(deg / 45) % 8];
}
function elapsed(ms: number) {
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 60)   return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
}
function statusColor(s: string) {
  if (s === 'Inflight') return 'bg-green-500';
  if (s === 'TakeOff' || s === 'Land') return 'bg-amber-400';
  return 'bg-slate-500';
}
function statusLabel(s: string) {
  const map: Record<string, string> = {
    Inflight: 'En vuelo', TakeOff: 'Despegando',
    Land: 'Aterrizando', Unknown: 'Sin señal',
  };
  return map[s] ?? s;
}
function toKmh(ms: number) { return ms * 3.6; }

// ── Mini gráfica SVG ──────────────────────────────────────────────────────────
function SparkLine({ values, color = '#f59e0b', unit = '' }: { values: number[]; color?: string; unit?: string }) {
  if (values.length < 2) return (
    <div className="flex items-center justify-center h-14 text-slate-600 text-xs">Sin datos aún</div>
  );
  const W = 220; const H = 56;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * W;
    const y = H - ((v - min) / range) * (H - 8) - 4;
    return `${x},${y}`;
  }).join(' ');
  const last = values[values.length - 1];
  const lx = W;
  const ly = H - ((last - min) / range) * (H - 8) - 4;
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-14" preserveAspectRatio="none">
        <defs>
          <linearGradient id={`g${color.replace('#','')}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor={color} stopOpacity="0.3" />
            <stop offset="100%" stopColor={color} stopOpacity="0"   />
          </linearGradient>
        </defs>
        <polygon points={`0,${H} ${pts} ${W},${H}`} fill={`url(#g${color.replace('#','')})`} />
        <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={lx} cy={ly} r="3" fill={color} />
      </svg>
      <div className="absolute top-0 right-0 text-[10px] text-slate-500">
        <span className="font-bold text-slate-300">{max.toFixed(1)}</span>{unit}
      </div>
      <div className="absolute bottom-0 right-0 text-[10px] text-slate-500">
        <span className="font-bold text-slate-500">{min.toFixed(1)}</span>{unit}
      </div>
    </div>
  );
}

// ── Constantes ────────────────────────────────────────────────────────────────
const MAX_TRAIL = 200;
const MAX_CHART = 40;

// ── Página ────────────────────────────────────────────────────────────────────
export default function TelemetriaPage() {
  const [drones, setDrones]     = useState<Record<string, RTDBTelemetry>>({});
  const [activeSN, setActiveSN] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [rtdbError, setRtdbError] = useState<string | null>(null);
  const [tick, setTick]         = useState(0);

  const rtdbUrl = process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL;

  // Historial en memoria para trail y gráficas (no necesitamos persistir)
  const histRef = useRef<Record<string, RTDBTelemetry[]>>({});
  const [histTick, setHistTick] = useState(0);

  // Tick cada segundo para actualizar "hace Xs"
  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  // Escuchar RTDB telemetry/ en tiempo real
  useEffect(() => {
    if (!rtdbUrl || rtdbUrl.includes('PENDIENTE')) {
      setRtdbError('NEXT_PUBLIC_FIREBASE_DATABASE_URL no configurada. Ve a Firebase Console → Realtime Database y copia la URL en .env.local');
      return;
    }
    setRtdbError(null);
    const telRef = ref(rtdb, 'telemetry');
    const unsub = onValue(
      telRef,
      snap => {
        const val = snap.val() as Record<string, RTDBTelemetry> | null;
        if (!val) { setConnected(false); return; }

        setDrones(val);
        setConnected(true);

        // Acumular historial en memoria
        Object.entries(val).forEach(([sn, data]) => {
          if (!histRef.current[sn]) histRef.current[sn] = [];
          const hist = histRef.current[sn];
          const prev = hist[hist.length - 1];
          if (!prev || prev.latitude !== data.latitude || prev.longitude !== data.longitude) {
            hist.push(data);
            if (hist.length > MAX_TRAIL) hist.shift();
          }
        });

        setActiveSN(prev => prev ?? Object.keys(val)[0] ?? null);
        setHistTick(n => n + 1);
      },
      (err) => {
        setConnected(false);
        setRtdbError(`Error RTDB: ${err.message}`);
      },
    );
    return () => unsub();
  }, [rtdbUrl]);

  const active  = activeSN ? drones[activeSN] ?? null : null;
  const history = activeSN ? histRef.current[activeSN] ?? [] : [];

  // Convertir para el mapa (DronePoint usa lat/lng y speedKmh)
  const dronePoint: DronePoint | null = active ? {
    lat:          active.latitude,
    lng:          active.longitude,
    course:       active.course ?? 0,
    altitudeMSL:  active.altitude,
    heightAGL:    active.height,
    speedKmh:     toKmh(active.gs),
    flightStatus: active.flightStatus,
  } : null;

  const trail: [number, number][] = history.map(h => [h.longitude, h.latitude]);

  // Datos para gráficas
  const altValues   = history.slice(-MAX_CHART).map(h => h.altitude);
  const aglValues   = history.slice(-MAX_CHART).map(h => h.height);
  const speedValues = history.slice(-MAX_CHART).map(h => toKmh(h.gs));
  const vsValues    = history.slice(-MAX_CHART).map(h => h.vs);

  // Stats sesión
  const maxAlt   = history.length ? Math.max(...history.map(h => h.altitude)) : 0;
  const maxSpeed = history.length ? Math.max(...history.map(h => toKmh(h.gs))) : 0;
  const avgSpeed = history.length ? history.reduce((s, h) => s + toKmh(h.gs), 0) / history.length : 0;
  const distKm   = history.length > 1 ? history.reduce((acc, h, i) => {
    if (i === 0) return acc;
    const p = history[i - 1];
    const dLat = (h.latitude - p.latitude) * 111;
    const dLng = (h.longitude - p.longitude) * 111 * Math.cos(h.latitude * Math.PI / 180);
    return acc + Math.sqrt(dLat * dLat + dLng * dLng);
  }, 0) : 0;

  return (
    <div className="flex flex-col h-full bg-slate-900 overflow-hidden">

      {/* ── Header ── */}
      <div className="bg-slate-800 border-b border-slate-700 px-4 py-3 shrink-0 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-amber-500/20 flex items-center justify-center">
            <span className="material-icons-round text-amber-400 text-base">radar</span>
          </div>
          <div>
            <h1 className="font-black text-white text-sm leading-tight">Telemetría en tiempo real</h1>
            <div className="flex items-center gap-2">
              <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-green-400 animate-pulse' : 'bg-slate-500'}`} />
              <span className="text-[10px] text-slate-400">
                {connected
                  ? active ? `Actualizado ${elapsed(active.updatedAt)}` : 'Conectado — esperando datos'
                  : 'Sin señal — esperando telemetría del dron'}
              </span>
            </div>
          </div>
        </div>
        {/* Selector si hay más de un dron */}
        {Object.keys(drones).length > 1 && (
          <div className="flex gap-1">
            {Object.keys(drones).map(sn => (
              <button key={sn} onClick={() => setActiveSN(sn)}
                className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-all ${activeSN === sn ? 'bg-amber-500 text-white' : 'bg-slate-700 text-slate-400 hover:bg-slate-600'}`}>
                {sn.slice(-8)}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── KPIs ── */}
      <div className="bg-slate-800 border-b border-slate-700 px-3 py-2 shrink-0">
        <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-8">
          {([
            { icon: 'flight',         label: 'Estado',       value: active ? statusLabel(active.flightStatus) : '—',                           dot: active ? statusColor(active.flightStatus) : 'bg-slate-600', sub: active?.uasModel ?? '' },
            { icon: 'altitude',       label: 'Alt. MSL',     value: active ? `${active.altitude.toFixed(1)} m` : '—',                          sub: 'Nivel del mar' },
            { icon: 'height',         label: 'Alt. AGL',     value: active ? `${active.height.toFixed(1)} m` : '—',                            sub: 'Sobre el suelo' },
            { icon: 'speed',          label: 'Velocidad',    value: active ? `${toKmh(active.gs).toFixed(1)} km/h` : '—',                      sub: active ? `${active.gs.toFixed(1)} m/s` : '' },
            { icon: 'swap_vert',      label: 'V. Vertical',  value: active ? `${active.vs >= 0 ? '+' : ''}${active.vs.toFixed(1)} m/s` : '—', sub: active?.vs === 0 ? 'Horizontal' : active && active.vs > 0 ? '↑ Subiendo' : '↓ Bajando' },
            { icon: 'explore',        label: 'Rumbo',        value: active?.course != null ? `${active.course.toFixed(0)}°` : '—',             sub: active?.course != null ? compassLabel(active.course) : '' },
            { icon: 'route',          label: 'Distancia',    value: `${(distKm * 1000).toFixed(0)} m`,                                        sub: 'Esta sesión' },
            { icon: 'trending_up',    label: 'Vel. máx.',    value: `${maxSpeed.toFixed(1)} km/h`,                                            sub: `Media ${avgSpeed.toFixed(1)}` },
          ] as any[]).map((k, i) => (
            <div key={i} className="bg-slate-700/50 rounded-xl p-2 flex flex-col gap-0.5 min-w-0">
              <div className="flex items-center gap-1">
                {k.dot && <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${k.dot}`} />}
                <span className="material-icons-round text-slate-400 text-sm">{k.icon}</span>
              </div>
              <p className="font-black text-white text-sm leading-none truncate">{k.value}</p>
              <p className="text-[9px] text-slate-400 leading-tight">{k.label}</p>
              {k.sub && <p className="text-[9px] text-slate-500 leading-tight truncate">{k.sub}</p>}
            </div>
          ))}
        </div>
      </div>

      {/* ── Layout: mapa + panel ── */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden min-h-0">

        {/* Mapa */}
        <div className="flex-1 relative min-h-[40vh] lg:min-h-0">
          {(!connected || !active) && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900 gap-4 z-10 px-6">
              {rtdbError ? (
                /* ── Error de configuración ── */
                <div className="bg-red-950/60 border border-red-800 rounded-2xl p-5 max-w-sm w-full text-center space-y-3">
                  <span className="material-icons-round text-red-400 text-3xl">warning</span>
                  <p className="text-red-300 font-bold text-sm">Falta configurar Firebase RTDB</p>
                  <p className="text-red-400/80 text-xs leading-relaxed">{rtdbError}</p>
                  <div className="bg-slate-900 rounded-xl px-3 py-2 text-left">
                    <p className="text-slate-400 text-[10px] font-bold uppercase tracking-wide mb-1">Pasos:</p>
                    <ol className="text-slate-400 text-[11px] space-y-1 list-decimal list-inside">
                      <li>Firebase Console → proyecto <span className="text-amber-400 font-mono">dlos-ai</span></li>
                      <li>Realtime Database → copia la URL</li>
                      <li>Pégala en <span className="text-amber-400 font-mono">.env.local</span> y en Vercel</li>
                      <li>Reinicia el servidor</li>
                    </ol>
                  </div>
                </div>
              ) : (
                /* ── Conectado, esperando datos del dron ── */
                <>
                  <div className="relative w-20 h-20 flex items-center justify-center">
                    <span className="material-icons-round text-slate-700" style={{ fontSize: 64 }}>radar</span>
                    <span className="absolute inset-0 flex items-center justify-center">
                      <span className="w-16 h-16 border-2 border-amber-500/20 border-t-amber-500 rounded-full animate-spin" />
                    </span>
                  </div>
                  <div className="text-center">
                    <p className="text-slate-300 font-bold text-sm">Conectado — esperando datos del dron</p>
                    <p className="text-slate-500 text-xs mt-1 max-w-xs">
                      RTDB conectado. Los datos aparecerán en cuanto el dron esté en vuelo y el backend envíe telemetría.
                    </p>
                    <div className="mt-3 flex items-center justify-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                      <span className="text-green-400 text-xs font-mono">firebase rtdb · telemetry/</span>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          <DroneMap point={dronePoint} trail={trail} />

          {/* Info overlay — esquina inferior izquierda */}
          {active && (
            <div className="absolute bottom-3 left-3 bg-slate-900/85 backdrop-blur-md border border-slate-700 rounded-2xl px-3 py-2 z-10 space-y-0.5 max-w-[200px]">
              <p className="font-bold text-white text-xs">{active.uasModel ?? 'Dron'}</p>
              <p className="font-mono text-[9px] text-slate-400 truncate">{activeSN}</p>
              <p className="text-[9px] text-slate-300">{active.latitude.toFixed(6)}, {active.longitude.toFixed(6)}</p>
              <p className="text-[9px] text-slate-500">Actualizado {elapsed(active.updatedAt)}</p>
            </div>
          )}

          {/* Brújula — esquina superior izquierda */}
          {active && active.course != null && (
            <div className="absolute top-3 left-3 bg-slate-900/80 backdrop-blur-md border border-slate-700 rounded-2xl w-14 h-14 flex flex-col items-center justify-center z-10">
              <span className="material-icons-round text-amber-400 text-xl"
                style={{ transform: `rotate(${active.course}deg)`, transition: 'transform 0.5s ease' }}>
                navigation
              </span>
              <p className="text-[10px] font-bold text-slate-300">{compassLabel(active.course)}</p>
            </div>
          )}
        </div>

        {/* Panel lateral — gráficas */}
        <div className="w-full lg:w-72 bg-slate-800 border-t lg:border-t-0 lg:border-l border-slate-700 overflow-y-auto shrink-0">
          <div className="p-3 space-y-3">

            <div className="bg-slate-700/50 rounded-2xl p-3">
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-1.5">
                  <span className="material-icons-round text-amber-400 text-sm">altitude</span>
                  <p className="text-xs font-bold text-slate-200">Altitud MSL</p>
                </div>
                <span className="text-xs font-black text-amber-400">{active ? `${active.altitude.toFixed(1)} m` : '—'}</span>
              </div>
              <SparkLine values={altValues} color="#f59e0b" unit=" m" />
            </div>

            <div className="bg-slate-700/50 rounded-2xl p-3">
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-1.5">
                  <span className="material-icons-round text-sky-400 text-sm">height</span>
                  <p className="text-xs font-bold text-slate-200">Altura AGL</p>
                </div>
                <span className="text-xs font-black text-sky-400">{active ? `${active.height.toFixed(1)} m` : '—'}</span>
              </div>
              <SparkLine values={aglValues} color="#38bdf8" unit=" m" />
            </div>

            <div className="bg-slate-700/50 rounded-2xl p-3">
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-1.5">
                  <span className="material-icons-round text-emerald-400 text-sm">speed</span>
                  <p className="text-xs font-bold text-slate-200">Velocidad horizontal</p>
                </div>
                <span className="text-xs font-black text-emerald-400">{active ? `${toKmh(active.gs).toFixed(1)} km/h` : '—'}</span>
              </div>
              <SparkLine values={speedValues} color="#34d399" unit=" km/h" />
            </div>

            <div className="bg-slate-700/50 rounded-2xl p-3">
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-1.5">
                  <span className="material-icons-round text-violet-400 text-sm">swap_vert</span>
                  <p className="text-xs font-bold text-slate-200">Velocidad vertical</p>
                </div>
                <span className="text-xs font-black text-violet-400">
                  {active ? `${active.vs >= 0 ? '+' : ''}${active.vs.toFixed(1)} m/s` : '—'}
                </span>
              </div>
              <SparkLine values={vsValues} color="#a78bfa" unit=" m/s" />
            </div>

            {/* Stats sesión */}
            <div className="bg-slate-700/30 rounded-2xl p-3 space-y-2">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Estadísticas sesión</p>
              {[
                { label: 'Puntos recibidos',   value: history.length },
                { label: 'Altitud máx. MSL',   value: `${maxAlt.toFixed(1)} m` },
                { label: 'Velocidad máxima',   value: `${maxSpeed.toFixed(1)} km/h` },
                { label: 'Velocidad media',    value: `${avgSpeed.toFixed(1)} km/h` },
                { label: 'Distancia aprox.',   value: `${(distKm * 1000).toFixed(0)} m` },
              ].map(s => (
                <div key={s.label} className="flex items-center justify-between">
                  <span className="text-[10px] text-slate-400">{s.label}</span>
                  <span className="text-[10px] font-bold text-slate-200">{s.value}</span>
                </div>
              ))}
            </div>

            {/* Info fuente de datos */}
            <div className="bg-slate-700/30 rounded-2xl p-3">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Fuente de datos</p>
              <div className="space-y-1">
                <div className="flex items-center gap-1.5">
                  <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-green-400 animate-pulse' : 'bg-slate-600'}`} />
                  <p className="text-[10px] text-slate-300">Firebase Realtime Database</p>
                </div>
                <p className="text-[9px] text-slate-500 font-mono">telemetry/{activeSN?.slice(-8) ?? '—'}</p>
                <p className="text-[9px] text-slate-500 mt-1">
                  DJI FlightHub 2 → dock3-backend → RTDB → Esta página
                </p>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
