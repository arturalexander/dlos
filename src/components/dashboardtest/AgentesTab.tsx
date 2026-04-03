'use client';

// AgentesTab — 3 AI agents with animated thinking + typewriter detection
// Fire Agent · Intruder Agent · License Plate Agent

import { useState, useEffect, useRef } from 'react';

const C = {
  bg:     '#0a0e17',
  card:   '#111827',
  border: '#1e293b',
  text:   '#e2e8f0',
  muted:  '#94a3b8',
  dim:    '#64748b',
  green:  '#10b981',
  amber:  '#f59e0b',
  red:    '#ef4444',
  accent: '#0073E6',
  purple: '#8b5cf6',
  cyan:   '#06b6d4',
  font:   "'DM Sans', system-ui, sans-serif",
  mono:   "'DM Mono', 'Courier New', monospace",
};

// ── Agent definitions ──────────────────────────────────────────────────────────

interface Detection {
  level: 'critical' | 'warning' | 'ok';
  title: string;
  body: string;
  coords?: string;
  action: string;
}

interface AgentDef {
  id: string;
  icon: string;
  name: string;
  subtitle: string;
  type: 'fuego' | 'intrusos' | 'matricula';
  thinkingPhases: string[];
  detections: Detection[];
  accentColor: string;
  glowColor: string;
  startDelay: number; // ms before first cycle starts
}

const AGENTS: AgentDef[] = [
  {
    id: 'fuego',
    icon: '🔥',
    name: 'Agente Fuegos',
    subtitle: 'YOLO · Visión térmica · FWI',
    type: 'fuego',
    accentColor: C.red,
    glowColor: 'rgba(239,68,68,0.2)',
    startDelay: 0,
    thinkingPhases: [
      'Inicializando visión térmica FLIR...',
      'Analizando imagen infrarroja (12.000 px)...',
      'Calculando temperatura diferencial...',
      'Cruzando datos con GPS drone...',
      'Consultando condiciones meteorológicas...',
      'Calculando índice FWI en tiempo real...',
      'Verificando umbral de detección (ΔT > 30°C)...',
      'Correlacionando con histórico de alertas...',
    ],
    detections: [
      {
        level: 'critical',
        title: '⚠️ FUEGO DETECTADO',
        body: 'Foco de calor anómalo en Sector NE de la finca. Temperatura diferencial: +68°C sobre ambiente. Coordenadas: 39.931°N, -5.649°O. Viento: 12 km/h dirección SO — riesgo de propagación ALTO. Índice FWI: 74/100.',
        coords: '39.931°N, -5.649°O',
        action: '🚒 ALERTANDO A BOMBEROS — Protocolo de emergencia iniciado. Drone B despachado para confirmación visual.',
      },
      {
        level: 'ok',
        title: '✅ SIN ANOMALÍAS DETECTADAS',
        body: 'Firma térmica analizada en Sector Sur (39.921°N, -5.658°O). Temperatura diferencial: +18°C. Clasificación: maquinaria agrícola en operación. Temperatura ambiente: 22°C. Modelo: tractor John Deere. Probabilidad incendio: 2.1%.',
        coords: '39.921°N, -5.658°O',
        action: '✅ Sin acción requerida. Sistema nominal. Próximo barrido en 4 min.',
      },
      {
        level: 'warning',
        title: '⚡ VIGILANCIA ELEVADA',
        body: 'Punto caliente detectado en lindero norte (39.934°N, -5.661°O). Temperatura diferencial: +41°C. Humedad relativa: 28% (crítica). Última lluvia: hace 11 días. FWI: 52/100 — nivel ALTO. Posible origen: quema de rastrojos en finca colindante.',
        coords: '39.934°N, -5.661°O',
        action: '🛩️ Drone A despachado para verificación visual. Bomberos en prealerta.',
      },
    ],
  },
  {
    id: 'intrusos',
    icon: '👤',
    name: 'Agente Intrusos',
    subtitle: 'Computer vision · Análisis siluetas',
    type: 'intrusos',
    accentColor: C.amber,
    glowColor: 'rgba(245,158,11,0.2)',
    startDelay: 4500,
    thinkingPhases: [
      'Procesando stream de vídeo CCTV...',
      'Detectando siluetas humanas (YOLOv8)...',
      'Analizando trayectoria y velocidad...',
      'Verificando perímetro autorizado...',
      'Cruzando con base de datos de empleados...',
      'Evaluando comportamiento (patrón normal/intrusión)...',
      'Determinando nivel de amenaza...',
    ],
    detections: [
      {
        level: 'critical',
        title: '🚨 INTRUSIÓN DETECTADA',
        body: 'Persona no autorizada detectada en zona norte (39.934°N, -5.652°O) a las 14:32:07. Temperatura corporal estimada: 36.8°C. Velocidad de movimiento: 1.2 m/s hacia interior. No identificada en base de datos de empleados (142 registros). Hora de entrada estimada: hace 8 min.',
        coords: '39.934°N, -5.652°O',
        action: '🚔 PROTOCOLO DE SEGURIDAD ACTIVADO. Guardas alertados. Drone en intercepción. Grabando secuencia.',
      },
      {
        level: 'ok',
        title: '✅ ACCESO AUTORIZADO',
        body: 'Persona detectada en entrada este (39.928°N, -5.645°O) a las 09:17. Identificada: Juan M. González · Empleado #042 · Veterinario. Horario habitual: 08:00-17:00. Comportamiento: normal. Trayectoria hacia corrales (zona habitual de trabajo).',
        coords: '39.928°N, -5.645°O',
        action: '✅ Acceso registrado. Sin acción requerida.',
      },
      {
        level: 'warning',
        title: '⚠️ PERSONA NO IDENTIFICADA',
        body: 'Individuo detectado en lindero sur (39.919°N, -5.657°O) a las 17:44. No identificado en base de datos. Posible: cazador, excursionista, empleado temporal. Permanece en perímetro exterior, no ha cruzado la valla. Tiempo en zona: 12 minutos.',
        coords: '39.919°N, -5.657°O',
        action: '👀 Drone B asignado para inspección. Notificando al encargado de finca.',
      },
    ],
  },
  {
    id: 'matricula',
    icon: '🚗',
    name: 'Agente Matrícula',
    subtitle: 'OCR · Reconocimiento de vehículos',
    type: 'matricula',
    accentColor: C.cyan,
    glowColor: 'rgba(6,182,212,0.2)',
    startDelay: 9000,
    thinkingPhases: [
      'Capturando fotograma cámara de acceso...',
      'Detectando región de interés (placa)...',
      'Procesando OCR (EasyOCR)...',
      'Normalizando formato matrícula española...',
      'Consultando base de datos de vehículos autorizados...',
      'Verificando propietario y acceso vigente...',
    ],
    detections: [
      {
        level: 'warning',
        title: '🚗 VEHÍCULO NO AUTORIZADO',
        body: 'Matrícula 4521-KBV detectada en Puerta Norte a las 16:45:22. Vehículo: Ford Ranger blanco · 2019. No registrado en base de datos autorizada (87 vehículos). Conductor: no identificado. Permanece detenido frente a la cancela 3 minutos.',
        coords: 'Puerta Norte',
        action: '📞 Notificando al encargado. Cámara grabando. Acceso denegado hasta verificación.',
      },
      {
        level: 'ok',
        title: '✅ ACCESO AUTORIZADO',
        body: 'Matrícula 8234-MPS detectada en Puerta Sur a las 09:12:05. Vehículo: Toyota Hilux gris · 2022. Propietario: Carlos Jiménez — Proveedor de pienso. Autorización vigente hasta 30/06/2026. Visita número 14 este mes. Tiempo en finca medio: 45 min.',
        coords: 'Puerta Sur',
        action: '✅ Acceso concedido. Registro creado. Apertura automática de cancela.',
      },
      {
        level: 'critical',
        title: '🔴 VEHÍCULO EN LISTA NEGRA',
        body: 'Matrícula 1234-ZZZ detectada en Puerta Este a las 11:30:44. Vehículo registrado como acceso DENEGADO (incidente previo 15/01/2026). Toyota Land Cruiser negro · 2018. Placa también detectada el 02/03/2026 — posible reconocimiento de terreno.',
        coords: 'Puerta Este',
        action: '🚔 ACCESO BLOQUEADO. Alertas enviadas a propietario y SEPRONA. Imágenes archivadas.',
      },
    ],
  },
];

// ── Animation hook ─────────────────────────────────────────────────────────────

type AgentStatus = 'idle' | 'thinking' | 'typing' | 'done';

function useAgent(def: AgentDef) {
  const [status, setStatus]       = useState<AgentStatus>('idle');
  const [phaseIdx, setPhaseIdx]   = useState(0);
  const [detectIdx, setDetectIdx] = useState(0);
  const [typed, setTyped]         = useState('');
  const [cycleCount, setCycleCount] = useState(0);

  // Start after delay
  useEffect(() => {
    const t = setTimeout(() => setStatus('thinking'), def.startDelay);
    return () => clearTimeout(t);
  }, [def.startDelay]);

  // Advance thinking phases
  useEffect(() => {
    if (status !== 'thinking') return;
    const delay = 1200 + Math.random() * 600;
    const t = setTimeout(() => {
      if (phaseIdx < def.thinkingPhases.length - 1) {
        setPhaseIdx(p => p + 1);
      } else {
        setStatus('typing');
        setTyped('');
      }
    }, delay);
    return () => clearTimeout(t);
  }, [status, phaseIdx, def.thinkingPhases.length]);

  // Typewriter for detection body
  useEffect(() => {
    if (status !== 'typing') return;
    const target = def.detections[detectIdx].body;
    if (typed.length < target.length) {
      const t = setTimeout(() => setTyped(target.slice(0, typed.length + 2)), 18);
      return () => clearTimeout(t);
    } else {
      setStatus('done');
    }
  }, [status, typed, detectIdx, def.detections]);

  // Restart with next detection after pause
  useEffect(() => {
    if (status !== 'done') return;
    const t = setTimeout(() => {
      setDetectIdx(d => (d + 1) % def.detections.length);
      setPhaseIdx(0);
      setTyped('');
      setCycleCount(c => c + 1);
      setStatus('thinking');
    }, 7000);
    return () => clearTimeout(t);
  }, [status, def.detections.length]);

  return {
    status,
    currentPhase: def.thinkingPhases[phaseIdx],
    phaseIdx,
    totalPhases: def.thinkingPhases.length,
    detection: def.detections[detectIdx],
    typedBody: typed,
    cycleCount,
    isTypingDone: status === 'done',
  };
}

// ── Agent Card ─────────────────────────────────────────────────────────────────

function AgentCard({ def }: { def: AgentDef }) {
  const ag = useAgent(def);

  const levelConfig = {
    critical: { color: C.red,   border: 'rgba(239,68,68,0.4)',  bg: 'rgba(239,68,68,0.08)',  label: 'CRÍTICO' },
    warning:  { color: C.amber, border: 'rgba(245,158,11,0.4)', bg: 'rgba(245,158,11,0.08)', label: 'ALERTA'  },
    ok:       { color: C.green, border: 'rgba(16,185,129,0.4)', bg: 'rgba(16,185,129,0.08)', label: 'SEGURO'  },
  };

  const lc = ag.status !== 'idle' && ag.status !== 'thinking'
    ? levelConfig[ag.detection.level]
    : null;

  const statusLabel =
    ag.status === 'idle'    ? { text: 'En espera',  color: C.dim   } :
    ag.status === 'thinking'? { text: 'Analizando', color: C.amber } :
    ag.status === 'typing'  ? { text: 'Detectado',  color: def.accentColor } :
                              { text: ag.detection.level === 'ok' ? 'Sin anomalías' : ag.detection.level === 'warning' ? 'Vigilancia' : 'Alerta',
                                color: lc?.color ?? C.green };

  return (
    <div style={{
      background: C.card,
      border: `1px solid ${lc ? lc.border : C.border}`,
      borderRadius: 16,
      overflow: 'hidden',
      transition: 'border-color 0.5s',
      boxShadow: lc && ag.detection.level === 'critical' ? `0 0 32px ${def.glowColor}` : 'none',
    }}>

      {/* Header */}
      <div style={{
        background: `linear-gradient(135deg, #0f172a, #1a2332)`,
        borderBottom: `1px solid ${C.border}`,
        padding: '16px 20px',
        display: 'flex', alignItems: 'center', gap: 14,
      }}>
        <div style={{
          width: 48, height: 48, borderRadius: 12,
          background: `${def.accentColor}22`,
          border: `2px solid ${def.accentColor}44`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 24, flexShrink: 0,
          boxShadow: `0 0 20px ${def.glowColor}`,
        }}>{def.icon}</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{def.name}</div>
          <div style={{ fontSize: 11, color: C.dim, marginTop: 1 }}>{def.subtitle}</div>
        </div>
        {/* Status badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 20, background: `${statusLabel.color}18`, border: `1px solid ${statusLabel.color}44`, fontSize: 12, fontWeight: 700, color: statusLabel.color }}>
          {ag.status === 'thinking' && <ThinkingDots color={statusLabel.color} />}
          {ag.status !== 'thinking' && <span style={{ width: 6, height: 6, borderRadius: '50%', background: statusLabel.color, display: 'inline-block' }} />}
          {statusLabel.text}
        </div>
      </div>

      {/* Thinking phase progress */}
      {(ag.status === 'thinking' || ag.status === 'idle') && (
        <div style={{ padding: '18px 20px' }}>
          {ag.status === 'idle' ? (
            <div style={{ textAlign: 'center', padding: '20px 0', color: C.dim, fontSize: 13 }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>⏳</div>
              Agente en espera de activación...
            </div>
          ) : (
            <>
              {/* Timeline of phases */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
                {def.thinkingPhases.map((phase, i) => {
                  const done    = i < ag.phaseIdx;
                  const current = i === ag.phaseIdx;
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, opacity: done || current ? 1 : 0.3, transition: 'opacity 0.3s' }}>
                      <div style={{
                        width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                        background: done ? C.green : current ? def.accentColor : C.border,
                        border: `2px solid ${done ? C.green : current ? def.accentColor : C.dim}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 11, fontWeight: 700, transition: 'all 0.3s',
                      }}>
                        {done ? '✓' : <span style={{ width: 6, height: 6, borderRadius: '50%', background: current ? 'white' : C.dim, display: 'inline-block' }} />}
                      </div>
                      <span style={{ fontSize: 12, color: done ? C.muted : current ? C.text : C.dim, flex: 1 }}>{phase}</span>
                      {current && <ThinkingDots color={def.accentColor} size={5} />}
                    </div>
                  );
                })}
              </div>
              {/* Progress bar */}
              <div style={{ height: 3, background: C.border, borderRadius: 2, overflow: 'hidden' }}>
                <div style={{
                  height: '100%', borderRadius: 2, background: def.accentColor,
                  width: `${((ag.phaseIdx + 1) / def.thinkingPhases.length) * 100}%`,
                  transition: 'width 0.5s ease',
                }} />
              </div>
            </>
          )}
        </div>
      )}

      {/* Detection result (typing or done) */}
      {(ag.status === 'typing' || ag.status === 'done') && lc && (
        <div style={{ padding: '18px 20px' }}>
          {/* Detection header */}
          <div style={{
            background: lc.bg, border: `1px solid ${lc.border}`,
            borderRadius: 10, padding: '12px 16px', marginBottom: 14,
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: lc.color, letterSpacing: -0.3 }}>{ag.detection.title}</div>
              {ag.detection.coords && (
                <div style={{ fontSize: 11, fontFamily: C.mono, color: C.dim, marginTop: 3 }}>📍 {ag.detection.coords}</div>
              )}
            </div>
            <div style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: lc.bg, border: `1px solid ${lc.border}`, color: lc.color }}>
              {lc.label}
            </div>
          </div>

          {/* Typewriter body */}
          <div style={{
            fontSize: 13, color: C.muted, lineHeight: 1.65,
            fontFamily: ag.status === 'typing' ? C.mono : C.font,
            background: '#0f172a', borderRadius: 8, padding: '12px 14px',
            marginBottom: 12, minHeight: 80,
            border: `1px solid ${C.border}`,
            position: 'relative',
          }}>
            {ag.typedBody}
            {ag.status === 'typing' && (
              <span style={{ display: 'inline-block', width: 2, height: 14, background: def.accentColor, marginLeft: 2, verticalAlign: 'middle', animation: 'cursorBlink 0.7s infinite' }} />
            )}
          </div>

          {/* Action */}
          {ag.isTypingDone && (
            <div style={{
              fontSize: 12, fontWeight: 600, color: lc.color,
              padding: '10px 14px', borderRadius: 8,
              background: lc.bg, border: `1px solid ${lc.border}`,
            }}>
              {ag.detection.action}
            </div>
          )}

          {/* Cycle indicator */}
          {ag.isTypingDone && (
            <div style={{ fontSize: 11, color: C.dim, marginTop: 10, textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <RestartDots />
              Reiniciando análisis en 7s · Ciclo #{ag.cycleCount + 1} completado
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Micro-components ───────────────────────────────────────────────────────────

function ThinkingDots({ color = '#f59e0b', size = 6 }: { color?: string; size?: number }) {
  return (
    <span style={{ display: 'inline-flex', gap: 3, alignItems: 'center' }}>
      {[0, 1, 2].map(i => (
        <span key={i} style={{
          width: size, height: size, borderRadius: '50%', background: color,
          display: 'inline-block',
          animation: `thinkBounce 1.2s ${i * 0.2}s ease-in-out infinite`,
        }} />
      ))}
      <style>{`
        @keyframes thinkBounce {
          0%,80%,100%{transform:translateY(0);opacity:0.4}
          40%{transform:translateY(-${size}px);opacity:1}
        }
        @keyframes cursorBlink{0%,100%{opacity:1}50%{opacity:0}}
      `}</style>
    </span>
  );
}

function RestartDots() {
  return (
    <span style={{ display: 'inline-flex', gap: 3, alignItems: 'center' }}>
      {[0, 1, 2].map(i => (
        <span key={i} style={{
          width: 4, height: 4, borderRadius: '50%', background: '#64748b',
          display: 'inline-block',
          animation: `restartPulse 1.5s ${i * 0.3}s ease-in-out infinite`,
        }} />
      ))}
      <style>{`@keyframes restartPulse{0%,100%{opacity:0.3}50%{opacity:1}}`}</style>
    </span>
  );
}

// ── Main tab ───────────────────────────────────────────────────────────────────

export default function AgentesTab() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Header info */}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '16px 22px', display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{ width: 40, height: 40, background: 'rgba(0,115,230,0.15)', border: '1px solid rgba(0,115,230,0.3)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>🧠</div>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>Motor de agentes dlos.ai</div>
          <div style={{ fontSize: 12, color: C.dim, marginTop: 1 }}>3 agentes especializados · Análisis en paralelo · Ciclo continuo de vigilancia</div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 20, fontSize: 12 }}>
          {[
            { icon: '🔥', label: 'Detecciones hoy', value: '3',   color: C.amber },
            { icon: '👤', label: 'Intrusiones',      value: '1',   color: C.red   },
            { icon: '🚗', label: 'Matrículas proc.', value: '14',  color: C.cyan  },
            { icon: '✅', label: 'Incidentes reales', value: '0',  color: C.green },
          ].map(s => (
            <div key={s.label} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 18, fontWeight: 800, fontFamily: C.mono, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 10, color: C.dim, marginTop: 1 }}>{s.icon} {s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* 3-column agents grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 }}>
        {AGENTS.map(def => <AgentCard key={def.id} def={def} />)}
      </div>

      {/* Pipeline explanation */}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '18px 22px' }}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 2, color: C.dim, marginBottom: 16 }}>
          Flujo de detección — Cómo funcionan los agentes
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
          {[
            { icon: '📡', label: 'Sensor', sub: 'Cámara/Drone', color: C.red    },
            { icon: '→',  label: '',       sub: '',              color: C.dim,   arrow: true },
            { icon: '🧠', label: 'YOLO',   sub: 'Detección CV',  color: C.accent },
            { icon: '→',  label: '',       sub: '',              color: C.dim,   arrow: true },
            { icon: '🔥', label: 'Agente', sub: 'Análisis IA',   color: C.amber  },
            { icon: '→',  label: '',       sub: '',              color: C.dim,   arrow: true },
            { icon: '🔗', label: 'Fusión', sub: 'Multi-sensor',  color: C.purple },
            { icon: '→',  label: '',       sub: '',              color: C.dim,   arrow: true },
            { icon: '✅', label: 'Decisión', sub: '< 30 seg',    color: C.green  },
            { icon: '→',  label: '',       sub: '',              color: C.dim,   arrow: true },
            { icon: '🚒', label: 'Acción', sub: 'Telegram/Mail', color: C.cyan   },
          ].map((s, i) => (
            s.arrow ? (
              <div key={i} style={{ fontSize: 18, color: C.dim, flex: 1, textAlign: 'center' }}>→</div>
            ) : (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '10px 14px', background: '#0f172a', borderRadius: 10, border: `1px solid ${C.border}` }}>
                <div style={{ fontSize: 22 }}>{s.icon}</div>
                <div style={{ fontSize: 11, fontWeight: 700, color: s.color }}>{s.label}</div>
                <div style={{ fontSize: 9, color: C.dim }}>{s.sub}</div>
              </div>
            )
          ))}
        </div>
      </div>
    </div>
  );
}
