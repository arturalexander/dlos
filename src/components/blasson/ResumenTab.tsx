'use client';

// Dashboard Blasson — 4 sub-tabs: Resumen · Vigilancia · Detección · Agentes IA
// Diseño basado en mockup de Jorge (dlos_dashboard_espadanal.html)

import { useState, useEffect, useRef } from 'react';

// ── Paleta oscura ──────────────────────────────────────────────────────────────
const C = {
  bg:         '#0a0e17',
  card:       '#111827',
  border:     '#1e293b',
  borderLg:   '#334155',
  text:       '#e2e8f0',
  muted:      '#94a3b8',
  dim:        '#64748b',
  accent:     '#0073E6',
  accentGlow: 'rgba(0,115,230,0.15)',
  green:      '#10b981',
  greenGlow:  'rgba(16,185,129,0.15)',
  amber:      '#f59e0b',
  amberGlow:  'rgba(245,158,11,0.15)',
  red:        '#ef4444',
  redGlow:    'rgba(239,68,68,0.15)',
  cyan:       '#06b6d4',
  purple:     '#8b5cf6',
  font:       "'DM Sans', system-ui, sans-serif",
  mono:       "'DM Mono', 'Courier New', monospace",
};

// ── Helpers ────────────────────────────────────────────────────────────────────
const FARM_LAT = 39.928;
const FARM_LON = -5.653;

function calcFireRisk(temp: number, hum: number, wind: number) {
  const tF = Math.max(0, Math.min(1, (temp - 15) / 25));
  const hF = Math.max(0, Math.min(1, (85 - hum) / 65));
  const wF = Math.max(0, Math.min(1, wind / 60));
  const score = Math.round((tF * 0.45 + hF * 0.40 + wF * 0.15) * 100);
  if (score >= 70) return { level: 'EXTREMO', label: 'Extremo',  score, color: C.red,   pos: 85 };
  if (score >= 50) return { level: 'ALTO',    label: 'Alto',     score, color: C.amber, pos: 62 };
  if (score >= 25) return { level: 'MODERADO',label: 'Moderado', score, color: C.amber, pos: 36 };
  return               { level: 'BAJO',    label: 'Bajo',     score, color: C.green, pos: 10 };
}

interface Weather { temp: number; humidity: number; wind: number; code: number; }
type SubTab = 'resumen' | 'vigilancia' | 'deteccion' | 'agentes';

// ── Datos simulados ────────────────────────────────────────────────────────────
const EVENTS_INIT = [
  { icon: '🛩️', cls: 'info',    title: 'Drone A en vuelo',            desc: 'Patrulla zona norte — ruta automática iniciada',             time: '16:12' },
  { icon: '🔋', cls: 'warn',    title: 'Drone B aterrizó — cargando', desc: 'Batería al 18% — recarga estimada 25 min',                   time: '16:08' },
  { icon: '✅', cls: 'success', title: 'Misión completada — Drone B',  desc: 'Inspección abrevaderos · 4/4 puntos OK · Nivel agua normal',  time: '14:45' },
  { icon: '🧠', cls: 'info',    title: 'IA descartó falso positivo',   desc: 'Firma térmica zona este → clasificada como maquinaria',       time: '10:20' },
  { icon: '⚠️', cls: 'warn',    title: 'Alerta SR7 — Punto caliente', desc: 'Zona este · Drone B despachado inmediatamente',              time: '10:18' },
  { icon: '🛩️', cls: 'info',    title: 'Drone A completó patrulla',   desc: '1.800 ha cubiertos · Sin anomalías detectadas',              time: '09:15' },
  { icon: '📡', cls: 'success', title: 'SR7 — Rotación completa',      desc: 'Barrido 360° completado · 0 alertas · Visibilidad óptima',   time: '08:00' },
];

const LIVE_EVENTS = [
  { icon: '📡', cls: 'success', title: 'SR7 — Barrido completado',  desc: 'Sector noroeste · Sin detecciones · Visibilidad buena'  },
  { icon: '🌡️', cls: 'info',   title: 'Actualización meteo',        desc: 'Temperatura estable · Humedad bajando'                  },
  { icon: '🐄', cls: 'success', title: 'Ganado localizado',          desc: 'IA identificó 38 cabezas en zona habitual de pastoreo'  },
  { icon: '🔋', cls: 'success', title: 'Drone B — Carga completa',   desc: 'Batería 100% · Listo para próxima misión'               },
];

const MISSIONS = [
  { type: 'patrol', label: 'Patrulla', title: 'Patrulla zona norte — Drone A',       meta: 'Ruta automática · 2.000 ha · Sin anomalías',                   dur: '45 min', time: '16:12' },
  { type: 'recon',  label: 'Recon',    title: 'Inspección abrevaderos — Drone B',    meta: 'Misión programada · 4 puntos verificados · Nivel OK',          dur: '28 min', time: '14:45' },
  { type: 'patrol', label: 'Patrulla', title: 'Patrulla zona sur — Drone A',         meta: 'Ruta automática · 1.800 ha · Sin anomalías',                   dur: '42 min', time: '12:30' },
  { type: 'alert',  label: 'Alerta',   title: 'Verificación alerta SR7 — Drone B',   meta: 'Punto caliente · Resultado: maquinaria agrícola · Descartado',  dur: '12 min', time: '10:18' },
  { type: 'patrol', label: 'Patrulla', title: 'Patrulla amanecer — Drone A',         meta: 'Primera misión del día · Perímetro completo',                  dur: '44 min', time: '07:05' },
  { type: 'recon',  label: 'Recon',    title: 'Conteo ganado sector este — Drone B', meta: '142 cabezas localizadas · Todas en zona habitual',             dur: '35 min', time: '08:40' },
];

const FIRE_ALERTS = [
  { title: 'Punto caliente — Zona este',  desc: 'Detección SR7 → Drone verificó → Maquinaria agrícola. Descartado automáticamente.', date: '15 mar 10:18' },
  { title: 'Humo zona perímetro norte',   desc: 'Detección visual SR7 → Drone confirmó quema controlada en finca vecina. Descartado.', date: '8 mar 14:02' },
  { title: 'Reflejo solar — Zona sur',    desc: 'Falso positivo por reflejo en balsa de agua. IA ajustó modelo. Descartado.',           date: '2 mar 16:45' },
];

const AGENTS = [
  { icon: '👁️', name: 'Visión térmica',           status: 'active',   statusLabel: 'activo',      metrics: [['Imágenes analizadas (hoy)', '1.247'], ['Detecciones', '0'], ['Latencia media', '340ms']] },
  { icon: '🎥', name: 'Análisis vídeo',            status: 'active',   statusLabel: 'activo',      metrics: [['Streams procesados', '2'], ['Frames/seg', '15 fps'], ['Anomalías', '0']] },
  { icon: '🧠', name: 'Interpretación escena',     status: 'active',   statusLabel: 'activo',      metrics: [['Escenas evaluadas', '84'], ['Clasificación correcta', '100%'], ['Confianza media', '97.3%']] },
  { icon: '🔗', name: 'Correlación multi-sensor',  status: 'active',   statusLabel: 'activo',      metrics: [['Fuentes activas', '5'], ['Correlaciones hoy', '312'], ['Falsos positivos elim.', '3']] },
  { icon: '🗺️', name: 'Rutas de drone',            status: 'active',   statusLabel: 'activo',      metrics: [['Rutas generadas hoy', '6'], ['Cobertura optimizada', '94%'], ['Ajustes por viento', '2']] },
  { icon: '📈', name: 'Aprendizaje continuo',      status: 'learning', statusLabel: 'aprendiendo', metrics: [['Eventos procesados', '2.841'], ['Última actualización', 'hace 2h'], ['Mejora precisión (30d)', '+1.2%']] },
];

const AGENT_DECISIONS = [
  { icon: '🧠', cls: 'success', title: 'Escena clasificada: vehículo autorizado',   desc: 'Agente de interpretación identificó tractor en zona este. Sin alerta generada. Confianza: 99.1%', time: '16:34' },
  { icon: '🗺️', cls: 'info',    title: 'Ruta ajustada por viento',                  desc: 'Agente de rutas modificó patrulla zona norte: rachas de 22 km/h SO detectadas. Nueva ruta optimizada.', time: '15:58' },
  { icon: '🔗', cls: 'success', title: 'Correlación positiva — falso positivo elim.', desc: 'SR7 detectó firma térmica + drone confirmó → maquinaria agrícola. 3 fuentes coincidentes. Descartado.', time: '10:20' },
  { icon: '📈', cls: 'info',    title: 'Modelo actualizado',                         desc: 'Agente de aprendizaje incorporó 3 nuevos patrones de reflejo solar en balsas. Reducción falsos positivos: 0.3%.', time: '08:00' },
];

const SUGGESTED_QUESTIONS = [
  { label: '¿Está todo bien?',             icon: '✅' },
  { label: '¿Qué pasó hoy en la finca?',  icon: '📋' },
  { label: '¿Hay riesgo de incendio?',     icon: '🔥' },
  { label: '¿Cuándo fue la última ronda?', icon: '🛩️' },
];

// ── Componente principal ───────────────────────────────────────────────────────

export default function ResumenTab() {
  const [subTab, setSubTab]         = useState<SubTab>('resumen');
  const [weather, setWeather]       = useState<Weather | null>(null);
  const [now, setNow]               = useState(new Date());
  const [droneASecs, setDroneASecs] = useState(18 * 60 + 32);
  const [droneBPct, setDroneBPct]   = useState(64);
  const [events, setEvents]         = useState(EVENTS_INIT);
  const [aiInput, setAiInput]       = useState('');
  const [aiAnswer, setAiAnswer]     = useState('');
  const [aiLoading, setAiLoading]   = useState(false);
  const [aiActive, setAiActive]     = useState(false);
  const liveIdx = useRef(0);

  useEffect(() => {
    const t1 = setInterval(() => setNow(new Date()), 1000);
    const t2 = setInterval(() => setDroneASecs(s => s > 0 ? s - 1 : 45 * 60), 1000);
    const t3 = setInterval(() => setDroneBPct(p => Math.min(p + 0.5, 100)), 3000);
    const t4 = setInterval(() => {
      const ev = LIVE_EVENTS[liveIdx.current % LIVE_EVENTS.length];
      liveIdx.current++;
      const t = new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
      setEvents(prev => [{ ...ev, time: t }, ...prev.slice(0, 11)]);
    }, 15000);
    fetchWeather();
    return () => { clearInterval(t1); clearInterval(t2); clearInterval(t3); clearInterval(t4); };
  }, []);

  const fetchWeather = async () => {
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${FARM_LAT}&longitude=${FARM_LON}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code&timezone=Europe%2FMadrid&wind_speed_unit=kmh`;
      const res = await fetch(url);
      const d = await res.json();
      const c = d.current;
      setWeather({ temp: Math.round(c.temperature_2m), humidity: Math.round(c.relative_humidity_2m), wind: Math.round(c.wind_speed_10m), code: c.weather_code });
    } catch { /* ok */ }
  };

  const askAI = async (q: string) => {
    if (!q.trim()) return;
    setAiActive(true); setAiLoading(true); setAiAnswer(''); setAiInput(q);
    const fr = weather ? calcFireRisk(weather.temp, weather.humidity, weather.wind) : { level: 'BAJO' };
    try {
      const res = await fetch('/api/blasson/asistente', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pregunta: q, contexto: { alertCount: 1, temp: weather?.temp ?? 22, humidity: weather?.humidity ?? 50, wind: weather?.wind ?? 10, fireRisk: fr.level, camerasOk: 3, camerasTotal: 4, lastDrone: '14:32', date: now.toLocaleString('es-ES') } }),
      });
      const data = await res.json();
      setAiAnswer(data.respuesta || 'No pude obtener respuesta.');
    } catch { setAiAnswer('No puedo conectar con el asistente ahora mismo.'); }
    finally { setAiLoading(false); }
  };

  const fr       = weather ? calcFireRisk(weather.temp, weather.humidity, weather.wind) : null;
  const droneAM  = Math.floor(droneASecs / 60);
  const droneAS  = droneASecs % 60;
  const bReady   = droneBPct >= 100;
  const timeStr  = now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const dateStr  = now.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });

  const subTabs: { id: SubTab; label: string }[] = [
    { id: 'resumen',    label: 'Resumen'    },
    { id: 'vigilancia', label: 'Vigilancia' },
    { id: 'deteccion',  label: 'Detección'  },
    { id: 'agentes',    label: 'Agentes IA' },
  ];

  return (
    <div style={{ background: C.bg, height: '100%', overflow: 'hidden', fontFamily: C.font, display: 'flex', flexDirection: 'column' }}>

      {/* ── Sub-tab bar + status ── */}
      <div style={{ background: C.card, borderBottom: `1px solid ${C.border}`, padding: '6px 20px', display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0, overflowX: 'auto' }}>
        <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: 4, display: 'flex', gap: 2, flexShrink: 0 }}>
          {subTabs.map(({ id, label }) => {
            const active = subTab === id;
            return (
              <button key={id} onClick={() => setSubTab(id)} style={{
                padding: '7px 18px', fontSize: 13, fontWeight: 500, borderRadius: 8, cursor: 'pointer', border: 'none',
                background: active ? C.accent : 'transparent',
                color: active ? 'white' : C.dim,
                fontFamily: C.font,
                boxShadow: active ? '0 2px 8px rgba(0,115,230,0.3)' : 'none',
                transition: 'all 0.2s',
                whiteSpace: 'nowrap',
              }}>{label}</button>
            );
          })}
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          <span style={{ fontFamily: C.mono, fontSize: 12, color: C.dim }}>{timeStr}</span>
          <span style={{ fontSize: 12, color: C.dim, textTransform: 'capitalize' }}>{dateStr}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 20, background: C.greenGlow, border: '1px solid rgba(16,185,129,0.3)', fontSize: 12, fontWeight: 500, color: C.green, flexShrink: 0 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: C.green, display: 'inline-block' }} />
            Sistema operativo
          </div>
        </div>
      </div>

      {/* ── Contenido scrollable ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px 48px', scrollbarWidth: 'none' }}>

        {/* ════════════════ TAB: RESUMEN ════════════════ */}
        {subTab === 'resumen' && (
          <div style={{ maxWidth: 1200, margin: '0 auto' }}>

            <SecTitle>Estado general</SecTitle>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16, marginBottom: 28 }}>
              <KpiCard color={C.green} label="Días sin incidentes" value="147"  sub="Último evento: 21 oct 2025"     />
              <KpiCard color={C.accent} label="Misiones hoy"        value="6"    sub="4 patrulla · 2 reconocimiento"  />
              <KpiCard color={C.amber}  label="Alertas (7 días)"     value="3"    sub="0 confirmadas · 3 descartadas"  />
              <KpiCard color={C.cyan}   label="Cobertura activa"     value="100%" sub="SR7 24h + Drone 16h/día"        />
            </div>

            <SecTitle>Nivel de riesgo</SecTitle>
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20, marginBottom: 28 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <span style={{ fontSize: 12, color: C.dim }}>Bajo</span>
                <div style={{ flex: 1, height: 10, borderRadius: 5, background: 'linear-gradient(90deg,#10b981 0%,#f59e0b 50%,#ef4444 100%)', position: 'relative' }}>
                  <div style={{ position: 'absolute', top: -6, left: `${fr?.pos ?? 10}%`, width: 22, height: 22, borderRadius: '50%', background: C.card, border: `3px solid ${fr?.color ?? C.green}`, transform: 'translateX(-50%)', boxShadow: `0 0 10px ${fr?.color ?? C.green}55`, transition: 'left 1s ease' }} />
                </div>
                <span style={{ fontSize: 12, color: C.dim }}>Extremo</span>
                <span style={{ fontSize: 14, fontWeight: 600, color: fr?.color ?? C.green, minWidth: 90, textAlign: 'right', fontFamily: C.mono }}>{fr?.level ?? 'BAJO'}</span>
              </div>
              <div style={{ display: 'flex', gap: 24, marginTop: 12, flexWrap: 'wrap' }}>
                {[['Temperatura', weather ? `${weather.temp}°C` : '—'], ['Humedad', weather ? `${weather.humidity}%` : '—'], ['Viento', weather ? `${weather.wind} km/h` : '—'], ['Última lluvia', 'hace 8 días']].map(([l, v]) => (
                  <div key={l} style={{ fontSize: 12, color: C.dim, display: 'flex', alignItems: 'center', gap: 5 }}>
                    {l} <span style={{ fontFamily: C.mono, color: C.muted }}>{v}</span>
                  </div>
                ))}
              </div>
            </div>

            <SecTitle>Equipamiento</SecTitle>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16, marginBottom: 28 }}>
              <EquipCard name="Cámara SR7" dot="🔴" badgeLabel="Activa 24/7" badgeStatus="online"
                stats={[{ l: 'Rotación', v: '360° continuo' }, { l: 'Detecciones hoy', v: '0 alertas' }, { l: 'Uptime', v: '99.97%', bar: { pct: 99.97, col: C.green } }]}
              />
              <EquipCard name="Drone A — Norte" dot="🔵" badgeLabel="En vuelo" badgeStatus="flying"
                stats={[{ l: 'Batería', v: '72%', bar: { pct: 72, col: C.accent } }, { l: 'Misión actual', v: 'Patrulla zona norte' }, { l: 'Tiempo restante', v: `${String(droneAM).padStart(2,'0')}:${String(droneAS).padStart(2,'0')}` }]}
              />
              <EquipCard name="Drone B — Sur" dot="🟢" badgeLabel={bReady ? 'Listo' : 'Cargando'} badgeStatus={bReady ? 'online' : 'charging'}
                stats={[{ l: 'Batería', v: `${Math.floor(droneBPct)}%`, bar: { pct: droneBPct, col: bReady ? C.green : C.amber } }, { l: 'Próximo despegue', v: bReady ? 'Listo para volar' : `~${Math.max(0, Math.round((100 - droneBPct) / 0.5 * 3 / 60))} min` }, { l: 'Misiones completadas', v: '3 hoy' }]}
              />
            </div>

            <SecTitle>Mapa y actividad reciente</SecTitle>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 28 }}>
              <MiniMapPanel />
              <EventFeedPanel events={events} />
            </div>

            <SecTitle>Condiciones meteorológicas</SecTitle>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16, marginBottom: 32 }}>
              <WeatherCard icon="🌤️" value={weather ? `${weather.temp}°C`      : '—'} label="Temperatura · Cáceres"           />
              <WeatherCard icon="💨" value={weather ? `${weather.wind} km/h`   : '—'} label="Viento"                           />
              <WeatherCard icon="💧" value={weather ? `${weather.humidity}%`   : '—'} label="Humedad relativa"                 />
              <WeatherCard icon="🔥" value={fr ? `FWI ${fr.score}` : '—'}            label={`Riesgo · ${fr?.label ?? '...'}`} valueColor={fr && fr.level !== 'BAJO' ? C.amber : C.green} />
            </div>

            <AIAssistantPanel
              aiActive={aiActive} aiInput={aiInput} aiLoading={aiLoading} aiAnswer={aiAnswer}
              setAiInput={setAiInput} setAiActive={setAiActive} setAiAnswer={setAiAnswer} askAI={askAI}
            />
          </div>
        )}

        {/* ════════════════ TAB: VIGILANCIA ════════════════ */}
        {subTab === 'vigilancia' && (
          <div style={{ maxWidth: 1200, margin: '0 auto' }}>
            <SecTitle>Últimas rutas de drone</SecTitle>
            <DarkPanel style={{ marginBottom: 28 }}>
              <PanelTitle>🛩️ Registro de misiones — Hoy</PanelTitle>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {MISSIONS.map((m, i) => {
                  const typeColors: Record<string, [string, string]> = {
                    patrol: [C.accentGlow, C.accent],
                    alert:  [C.redGlow,    C.red],
                    recon:  ['rgba(6,182,212,0.15)', C.cyan],
                  };
                  const [bg, fg] = typeColors[m.type] ?? [C.accentGlow, C.accent];
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.02)' }}>
                      <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', padding: '3px 8px', borderRadius: 4, width: 70, textAlign: 'center', background: bg, color: fg }}>{m.label}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 500, color: C.text }}>{m.title}</div>
                        <div style={{ fontSize: 11, color: C.dim }}>{m.meta}</div>
                      </div>
                      <span style={{ fontFamily: C.mono, fontSize: 12, color: C.muted }}>{m.dur}</span>
                      <span style={{ fontFamily: C.mono, fontSize: 11, color: C.dim }}>{m.time}</span>
                    </div>
                  );
                })}
              </div>
            </DarkPanel>

            <SecTitle>Estadísticas — Últimos 7 días</SecTitle>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16 }}>
              <KpiCard color={C.accent} label="Total misiones"       value="38"   sub="Media: 5.4/día"         />
              <KpiCard color={C.green}  label="Horas de vuelo"       value="26"   sub="~3.7h/día"             />
              <KpiCard color={C.cyan}   label="Ha patrulladas"       value="12.4k" sub="6.2× superficie finca" />
              <KpiCard color={C.amber}  label="Alertas verificadas"  value="3"    sub="Todas descartadas"      />
            </div>
          </div>
        )}

        {/* ════════════════ TAB: DETECCIÓN ════════════════ */}
        {subTab === 'deteccion' && (
          <div style={{ maxWidth: 1200, margin: '0 auto' }}>
            <SecTitle>Protocolo de detección — Flujo en tiempo real</SecTitle>
            <DarkPanel style={{ marginBottom: 28 }}>
              <PanelTitle>⏱️ Cadena de detección y respuesta</PanelTitle>
              <DetectionTimeline />
              <p style={{ textAlign: 'center', marginTop: 16, fontSize: 12, color: C.dim }}>
                Última alerta verificada el 15 mar 2026 a las 10:18 — resultado: maquinaria agrícola (descartado)
              </p>
            </DarkPanel>

            <SecTitle>Historial de detecciones — Últimos 30 días</SecTitle>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <DarkPanel>
                <PanelTitle>🔥 Alertas de fuego</PanelTitle>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {FIRE_ALERTS.map((a, i) => (
                    <div key={i} style={{ display: 'flex', gap: 12, padding: 12, borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: `1px solid ${C.border}` }}>
                      <div style={{ width: 36, height: 36, borderRadius: 8, background: C.amberGlow, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>⚠️</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 500, color: C.text, marginBottom: 2 }}>{a.title}</div>
                        <div style={{ fontSize: 11, color: C.dim, lineHeight: 1.4 }}>{a.desc}</div>
                      </div>
                      <div style={{ fontFamily: C.mono, fontSize: 10, color: C.dim, flexShrink: 0 }}>{a.date}</div>
                    </div>
                  ))}
                </div>
              </DarkPanel>
              <DarkPanel>
                <PanelTitle>📊 Rendimiento del sistema</PanelTitle>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {[
                    ['Alertas generadas (30d)',              '3',          C.amber],
                    ['Incendios reales',                     '0',          C.green],
                    ['Falsos positivos eliminados por IA',   '47',         C.text],
                    ['Tiempo medio de verificación',         '2 min 48s',  C.text],
                    ['Precisión detección',                  '98.2%',      C.green],
                    ['Uptime SR7 (30d)',                     '99.97%',     C.text],
                    ['Uptime drones (30d)',                  '99.4%',      C.text],
                  ].map(([label, val, col]) => (
                    <div key={label as string} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
                      <span style={{ color: C.dim }}>{label}</span>
                      <span style={{ fontFamily: C.mono, fontSize: 12, color: col as string }}>{val}</span>
                    </div>
                  ))}
                  <div style={{ height: 4, background: C.border, borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: '98.2%', background: C.green, borderRadius: 2 }} />
                  </div>
                </div>
              </DarkPanel>
            </div>
          </div>
        )}

        {/* ════════════════ TAB: AGENTES ════════════════ */}
        {subTab === 'agentes' && (
          <div style={{ maxWidth: 1200, margin: '0 auto' }}>
            <SecTitle>Agentes de inteligencia artificial activos</SecTitle>
            <DarkPanel style={{ marginBottom: 28 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
                {AGENTS.map((a, i) => (
                  <div key={i} style={{ padding: 16, borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: `1px solid ${C.border}`, transition: 'all 0.3s', cursor: 'default' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{a.icon} {a.name}</span>
                      <span style={{
                        fontSize: 11, fontFamily: C.mono, padding: '2px 8px', borderRadius: 6,
                        background: a.status === 'active' ? C.greenGlow : 'rgba(139,92,246,0.15)',
                        color: a.status === 'active' ? C.green : C.purple,
                      }}>{a.statusLabel}</span>
                    </div>
                    {a.metrics.map(([label, val]) => (
                      <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginTop: 7 }}>
                        <span style={{ color: C.dim }}>{label}</span>
                        <span style={{ fontFamily: C.mono, color: C.muted }}>{val}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </DarkPanel>

            <SecTitle>Flujo de comunicación entre agentes</SecTitle>
            <AgentFlowDiagram />

            <SecTitle style={{ marginTop: 28 }}>Últimas decisiones</SecTitle>
            <DarkPanel>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {AGENT_DECISIONS.map((d, i) => (
                  <div key={i} style={{ display: 'flex', gap: 12, padding: 12, borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: `1px solid ${C.border}` }}>
                    <div style={{ width: 36, height: 36, borderRadius: 8, background: d.cls === 'success' ? C.greenGlow : C.accentGlow, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>{d.icon}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: C.text, marginBottom: 2 }}>{d.title}</div>
                      <div style={{ fontSize: 12, color: C.dim, lineHeight: 1.4 }}>{d.desc}</div>
                    </div>
                    <div style={{ fontFamily: C.mono, fontSize: 11, color: C.dim, flexShrink: 0 }}>{d.time}</div>
                  </div>
                ))}
              </div>
            </DarkPanel>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function SecTitle({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <p style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 2, color: C.dim, marginBottom: 14, ...style }}>
      {children}
    </p>
  );
}

function DarkPanel({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20, ...style }}>
      {children}
    </div>
  );
}

function PanelTitle({ children }: { children: React.ReactNode }) {
  return <p style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 16 }}>{children}</p>;
}

function KpiCard({ color, label, value, sub }: { color: string; label: string; value: string; sub: string }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20, position: 'relative', overflow: 'hidden', transition: 'border-color 0.3s' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: color }} />
      <div style={{ fontSize: 12, color: C.dim, fontWeight: 500, marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: -1, fontFamily: C.mono, color }}>{value}</div>
      <div style={{ fontSize: 12, color: C.dim, marginTop: 4 }}>{sub}</div>
    </div>
  );
}

function EquipCard({ name, dot, badgeLabel, badgeStatus, stats }: {
  name: string; dot: string; badgeLabel: string;
  badgeStatus: 'online' | 'flying' | 'charging';
  stats: { l: string; v: string; bar?: { pct: number; col: string } }[];
}) {
  const bc = { online: [C.greenGlow, C.green, 'rgba(16,185,129,0.2)'], flying: [C.accentGlow, C.accent, 'rgba(0,115,230,0.2)'], charging: [C.amberGlow, C.amber, 'rgba(245,158,11,0.2)'] }[badgeStatus];
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <span style={{ fontSize: 15, fontWeight: 600, color: C.text }}>{dot} {name}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 500, padding: '4px 10px', borderRadius: 12, background: bc[0], color: bc[1], border: `1px solid ${bc[2]}` }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: bc[1], display: 'inline-block' }} />
          {badgeLabel}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {stats.map((s) => (
          <div key={s.l}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
              <span style={{ color: C.dim }}>{s.l}</span>
              <span style={{ fontFamily: C.mono, fontSize: 12, color: C.muted }}>{s.v}</span>
            </div>
            {s.bar && (
              <div style={{ height: 4, background: C.border, borderRadius: 2, overflow: 'hidden', marginTop: 4 }}>
                <div style={{ height: '100%', width: `${s.bar.pct}%`, background: s.bar.col, borderRadius: 2, transition: 'width 1.5s ease' }} />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function MiniMapPanel() {
  return (
    <DarkPanel>
      <PanelTitle>📍 Finca Espadañal — Vista operativa</PanelTitle>
      <div style={{ width: '100%', height: 200, borderRadius: 8, background: '#0d1520', border: `1px solid ${C.border}`, position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: '15%', left: '15%', right: '20%', bottom: '15%', border: '1px dashed rgba(100,116,139,0.3)', borderRadius: '20% 40% 30% 15%' }} />
        <div style={{ position: 'absolute', width: 260, height: 260, borderRadius: '50%', border: '1px solid rgba(239,68,68,0.15)', background: 'radial-gradient(circle,rgba(239,68,68,0.04) 0%,transparent 70%)', top: '50%', left: '42%', transform: 'translate(-50%,-50%)' }} />
        {[
          { top: '48%', left: '42%', color: C.red,    label: 'SR7',    lt: '43%', ll: '44%' },
          { top: '60%', left: '58%', color: C.accent, label: 'Dock A', lt: '55%', ll: '60%' },
          { top: '38%', left: '28%', color: C.green,  label: 'Dock B', lt: '33%', ll: '20%' },
        ].map(d => (
          <div key={d.label}>
            <div style={{ position: 'absolute', width: 10, height: 10, borderRadius: '50%', background: d.color, top: d.top, left: d.left, zIndex: 2 }} />
            <div style={{ position: 'absolute', fontSize: 10, fontFamily: C.mono, color: C.dim, top: d.lt, left: d.ll, zIndex: 3, background: 'rgba(10,14,23,0.7)', padding: '2px 6px', borderRadius: 3 }}>{d.label}</div>
          </div>
        ))}
        <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', zIndex: 4 }} viewBox="0 0 400 200">
          <circle r="4" fill="#0073E6" opacity="0.9">
            <animateMotion dur="12s" repeatCount="indefinite" path="M230,120 Q300,60 280,90 Q260,120 310,80 Q340,50 280,110 Q230,140 230,120" />
          </circle>
          <path d="M230,120 Q300,60 280,90 Q260,120 310,80 Q340,50 280,110 Q230,140 230,120" fill="none" stroke="rgba(0,115,230,0.15)" strokeWidth="1" strokeDasharray="4,4" />
        </svg>
      </div>
    </DarkPanel>
  );
}

function EventFeedPanel({ events }: { events: typeof EVENTS_INIT }) {
  const clsBg = (cls: string) => cls === 'success' ? C.greenGlow : cls === 'warn' ? C.amberGlow : C.accentGlow;
  return (
    <DarkPanel>
      <PanelTitle>📋 Actividad reciente</PanelTitle>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 240, overflowY: 'auto', scrollbarWidth: 'none' }}>
        {events.map((ev, i) => (
          <div key={i} style={{ display: 'flex', gap: 10, padding: '9px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.02)' }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: clsBg(ev.cls), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0 }}>{ev.icon}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: C.text }}>{ev.title}</div>
              <div style={{ fontSize: 11, color: C.dim, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.desc}</div>
            </div>
            <div style={{ fontFamily: C.mono, fontSize: 11, color: C.dim, flexShrink: 0 }}>{ev.time}</div>
          </div>
        ))}
      </div>
    </DarkPanel>
  );
}

function WeatherCard({ icon, value, label, valueColor }: { icon: string; value: string; label: string; valueColor?: string }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
      <div style={{ fontSize: 28 }}>{icon}</div>
      <div>
        <div style={{ fontSize: 22, fontWeight: 700, fontFamily: C.mono, color: valueColor || C.text }}>{value}</div>
        <div style={{ fontSize: 12, color: C.dim }}>{label}</div>
      </div>
    </div>
  );
}

function DetectionTimeline() {
  const steps = [
    { icon: '📡', label: 'Detección SR7',   time: '0 seg',    done: true,  current: false },
    { icon: '🧠', label: 'Análisis IA',      time: '~30 seg',  done: true,  current: false },
    { icon: '🛩️', label: 'Drone despega',   time: '~1 min',   done: true,  current: false },
    { icon: '🎥', label: 'Verificación',     time: '~3 min',   done: false, current: true  },
    { icon: '🚨', label: 'Alerta bomberos',  time: '< 5 min',  done: false, current: false },
  ];
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start' }}>
      {steps.map((s, i) => (
        <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, position: 'relative' }}>
          {i < steps.length - 1 && (
            <div style={{ position: 'absolute', top: 16, left: '50%', width: '100%', height: 2, background: s.done ? C.green : C.border, zIndex: 1 }} />
          )}
          <div style={{
            width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, zIndex: 2, position: 'relative',
            background: s.done ? C.greenGlow : s.current ? C.accentGlow : C.card,
            border: `2px solid ${s.done ? C.green : s.current ? C.accent : C.borderLg}`,
          }}>{s.icon}</div>
          <div style={{ fontSize: 11, color: C.dim, marginTop: 8, textAlign: 'center', lineHeight: 1.3 }}>{s.label}</div>
          <div style={{ fontSize: 10, fontFamily: C.mono, color: C.dim, marginTop: 2 }}>{s.time}</div>
        </div>
      ))}
    </div>
  );
}

function AgentFlowDiagram() {
  const nodes = [
    { id: 'cam',    label: '📡 SR7 / Cámara',      col: C.red,    x: '5%',  y: '50%' },
    { id: 'drone',  label: '🛩️ Drone',             col: C.accent, x: '5%',  y: '80%' },
    { id: 'vision', label: '👁️ Visión térmica',    col: C.purple, x: '30%', y: '20%' },
    { id: 'video',  label: '🎥 Análisis vídeo',    col: C.purple, x: '30%', y: '50%' },
    { id: 'scene',  label: '🧠 Interpretación',    col: C.cyan,   x: '55%', y: '35%' },
    { id: 'corr',   label: '🔗 Correlación',        col: C.cyan,   x: '55%', y: '65%' },
    { id: 'routes', label: '🗺️ Rutas drone',       col: C.green,  x: '30%', y: '80%' },
    { id: 'learn',  label: '📈 Aprendizaje',        col: C.amber,  x: '55%', y: '90%' },
    { id: 'alert',  label: '🚨 Sistema alertas',   col: C.red,    x: '80%', y: '50%' },
  ];
  return (
    <DarkPanel>
      <PanelTitle>🔁 Cómo se comunican los agentes</PanelTitle>
      <div style={{ position: 'relative', height: 200, overflow: 'hidden' }}>
        <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} viewBox="0 0 600 200" preserveAspectRatio="none">
          {/* Connections */}
          {[
            ['30,100', '180,40'], ['30,100', '180,100'], ['30,160', '180,160'],
            ['180,40', '330,70'], ['180,100', '330,70'], ['180,100', '330,130'],
            ['180,160', '330,130'], ['330,70', '480,100'], ['330,130', '480,100'],
            ['330,130', '330,180'], ['330,180', '480,100'],
          ].map(([from, to], i) => (
            <line key={i} x1={from.split(',')[0]} y1={from.split(',')[1]} x2={to.split(',')[0]} y2={to.split(',')[1]}
              stroke="rgba(100,116,139,0.3)" strokeWidth="1.5" strokeDasharray="4,3" />
          ))}
        </svg>
        {nodes.map(n => (
          <div key={n.id} style={{ position: 'absolute', transform: 'translate(-50%,-50%)', top: n.y, left: n.x, fontSize: 11, fontWeight: 500, padding: '5px 10px', borderRadius: 20, background: `${n.col}22`, border: `1px solid ${n.col}55`, color: n.col, whiteSpace: 'nowrap', zIndex: 2 }}>
            {n.label}
          </div>
        ))}
      </div>
      <p style={{ fontSize: 12, color: C.dim, marginTop: 8 }}>
        Las cámaras y drones alimentan los agentes de percepción → los agentes de análisis cruzan datos → el sistema de alertas actúa en &lt;5 min.
      </p>
    </DarkPanel>
  );
}

function AIAssistantPanel({ aiActive, aiInput, aiLoading, aiAnswer, setAiInput, setAiActive, setAiAnswer, askAI }: {
  aiActive: boolean; aiInput: string; aiLoading: boolean; aiAnswer: string;
  setAiInput: (v: string) => void; setAiActive: (v: boolean) => void; setAiAnswer: (v: string) => void;
  askAI: (q: string) => void;
}) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden' }}>
      <div style={{ background: 'linear-gradient(135deg,#0f172a,#1e293b)', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 40, height: 40, background: 'rgba(0,115,230,0.2)', border: '1px solid rgba(0,115,230,0.3)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>✨</div>
        <div>
          <p style={{ fontWeight: 700, color: C.text, fontSize: 14, fontFamily: C.font }}>Asistente IA de tu finca</p>
          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>Pregunta lo que quieras, en lenguaje normal</p>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)', padding: '4px 10px', borderRadius: 8 }}>
          <span style={{ width: 6, height: 6, background: C.green, borderRadius: '50%', display: 'inline-block' }} />
          <span style={{ color: C.green, fontSize: 12, fontWeight: 600 }}>Activo</span>
        </div>
      </div>
      <div style={{ padding: 20 }}>
        {aiActive && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
              <div style={{ background: C.accent, color: 'white', fontSize: 13, padding: '8px 16px', borderRadius: '16px 16px 4px 16px', maxWidth: 280 }}>{aiInput}</div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ width: 32, height: 32, background: C.border, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 14 }}>🤖</div>
              <div style={{ background: '#1e293b', color: C.text, fontSize: 13, padding: '10px 16px', borderRadius: '4px 16px 16px 16px', maxWidth: 400, lineHeight: 1.6 }}>
                {aiLoading ? (
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    {[0, 150, 300].map(d => <span key={d} style={{ width: 6, height: 6, background: C.muted, borderRadius: '50%', display: 'inline-block', animation: `bounce 1s ${d}ms infinite` }} />)}
                    <span style={{ fontSize: 11, color: C.dim, marginLeft: 4 }}>Consultando tu finca...</span>
                  </div>
                ) : aiAnswer}
              </div>
            </div>
          </div>
        )}
        {!aiActive && (
          <>
            <p style={{ fontSize: 12, color: C.dim, marginBottom: 10, textAlign: 'center', fontWeight: 500 }}>Preguntas frecuentes</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
              {SUGGESTED_QUESTIONS.map(q => (
                <button key={q.label} onClick={() => askAI(q.label)} style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px',
                  background: 'rgba(255,255,255,0.02)', border: `1px solid ${C.border}`, borderRadius: 10,
                  fontSize: 13, color: C.muted, cursor: 'pointer', textAlign: 'left',
                  fontFamily: C.font, transition: 'all 0.2s',
                }}>
                  <span style={{ fontSize: 16 }}>{q.icon}</span> {q.label}
                </button>
              ))}
            </div>
          </>
        )}
        <div style={{ display: 'flex', gap: 8 }}>
          <input type="text" value={aiActive ? '' : aiInput}
            onChange={e => { setAiActive(false); setAiInput(e.target.value); }}
            onKeyDown={e => e.key === 'Enter' && askAI(aiInput)}
            placeholder="Escribe tu pregunta..."
            style={{ flex: 1, padding: '10px 14px', borderRadius: 10, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontSize: 13, outline: 'none', fontFamily: C.font }}
          />
          <button onClick={() => { if (!aiActive) askAI(aiInput); else { setAiActive(false); setAiInput(''); setAiAnswer(''); } }}
            style={{ padding: '10px 18px', borderRadius: 10, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 14, background: aiActive ? C.border : C.accent, color: aiActive ? C.muted : 'white', fontFamily: C.font }}>
            {aiActive ? '↩' : '→'}
          </button>
        </div>
        {aiActive && !aiLoading && (
          <button onClick={() => { setAiActive(false); setAiInput(''); setAiAnswer(''); }}
            style={{ marginTop: 8, width: '100%', fontSize: 12, color: C.dim, background: 'none', border: 'none', cursor: 'pointer', fontFamily: C.font }}>
            ← Volver a las preguntas
          </button>
        )}
      </div>
    </div>
  );
}
