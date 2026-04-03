'use client';

import { useState, useEffect, useRef } from 'react';

// ── Tipos ─────────────────────────────────────────────────────────────────────

type AgentStatus = 'idle' | 'processing' | 'alert' | 'done';

interface PipelineNode {
  id: string;
  icon: string;
  label: string;
  sublabel: string;
  color: string;
  bgColor: string;
  borderColor: string;
}

interface AgentDef {
  id: string;
  name: string;
  role: string;
  icon: string;
  color: string;
  bg: string;
  border: string;
  description: string;
  outputs: string[];
  model: string;
}

interface LiveEvent {
  id: number;
  time: string;
  agent: string;
  agentColor: string;
  action: string;
  detail: string;
  type: 'info' | 'detection' | 'alert' | 'report';
}

interface DetectionExample {
  label: string;
  confidence: number;
  bbox: [number, number, number, number]; // x, y, w, h en %
  color: string;
  class: string;
}

// ── Pipeline nodes ─────────────────────────────────────────────────────────

const PIPELINE_NODES: PipelineNode[] = [
  { id: 'capture',   icon: 'videocam',              label: 'Captura',       sublabel: 'Dron / Cámara FLIR',      color: 'text-sky-600',     bgColor: 'bg-sky-50',     borderColor: 'border-sky-200'     },
  { id: 'cv',        icon: 'image_search',           label: 'Visión IA',     sublabel: 'YOLO v8 · GPU',           color: 'text-violet-600',  bgColor: 'bg-violet-50',  borderColor: 'border-violet-200'  },
  { id: 'analysis',  icon: 'psychology',             label: 'Análisis',      sublabel: 'Agente Analítico',        color: 'text-blue-600',    bgColor: 'bg-blue-50',    borderColor: 'border-blue-200'    },
  { id: 'decision',  icon: 'rule',                   label: 'Decisión',      sublabel: 'Agente de Respuesta',     color: 'text-orange-600',  bgColor: 'bg-orange-50',  borderColor: 'border-orange-200'  },
  { id: 'action',    icon: 'send',                   label: 'Acción',        sublabel: 'Telegram · Email',        color: 'text-emerald-600', bgColor: 'bg-emerald-50', borderColor: 'border-emerald-200' },
  { id: 'report',    icon: 'summarize',              label: 'Informe',       sublabel: 'PDF · Gemini AI',         color: 'text-rose-600',    bgColor: 'bg-rose-50',    borderColor: 'border-rose-200'    },
];

// ── Agentes IA ───────────────────────────────────────────────────────────────

const AGENTS: AgentDef[] = [
  {
    id: 'visual',
    name: 'Agente Visual',
    role: 'Computer Vision',
    icon: 'image_search',
    color: 'text-violet-600',
    bg: 'bg-violet-50',
    border: 'border-violet-200',
    description: 'Procesa cada frame en tiempo real usando YOLO v8. Detecta ganado, personas, vehículos, humo y fuego. Corre en GPU dedicada con latencia <200 ms por frame.',
    outputs: ['BBox + confianza por detección', 'Mapa de calor de zonas activas', 'Conteo de animales', 'Clasificación de amenazas'],
    model: 'YOLO v8x · GPU NVIDIA',
  },
  {
    id: 'analytic',
    name: 'Agente Analítico',
    role: 'Interpretación',
    icon: 'psychology',
    color: 'text-blue-600',
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    description: 'Recibe las detecciones del Agente Visual y las interpreta en contexto. Cruza datos meteorológicos, histórico de alertas y mapa de la finca para evaluar el nivel de riesgo.',
    outputs: ['Índice de riesgo 0-100', 'Resumen ejecutivo en lenguaje natural', 'Agentes secundarios a activar', 'Prioridad de respuesta'],
    model: 'Gemini 2.0 Flash',
  },
  {
    id: 'response',
    name: 'Agente de Respuesta',
    role: 'Orquestación',
    icon: 'rule',
    color: 'text-orange-600',
    bg: 'bg-orange-50',
    border: 'border-orange-200',
    description: 'Decide qué acciones tomar según el análisis. Coordina el envío de alertas por Telegram, activa protocolos de emergencia y delega al Agente de Informes para documentar el evento.',
    outputs: ['Alerta Telegram con foto y coordenadas', 'Activación de protocolo de emergencia', 'Solicitud de verificación a piloto', 'Registro en Firestore'],
    model: 'Lógica de reglas + GPT-4o',
  },
  {
    id: 'report',
    name: 'Agente de Informes',
    role: 'Documentación',
    icon: 'summarize',
    color: 'text-rose-600',
    bg: 'bg-rose-50',
    border: 'border-rose-200',
    description: 'Agrega todos los eventos del día/semana/mes y genera informes automáticos en PDF. Usa Gemini para redactar textos narrativos. Envía informes por email y Telegram según el calendario.',
    outputs: ['PDF con cabecera Blasson', 'KPIs operacionales', 'Línea de tiempo de eventos', 'Recomendaciones de mejora'],
    model: 'Gemini 2.0 Flash + jsPDF',
  },
];

// ── Eventos en vivo (simulados) ───────────────────────────────────────────────

const BASE_EVENTS: Omit<LiveEvent, 'id' | 'time'>[] = [
  { agent: 'Agente Visual',      agentColor: 'bg-violet-500', action: 'Frame analizado',       detail: 'CAM-02 · 847 objetos procesados · 3 bovinos detectados (conf. 0.97)',   type: 'detection' },
  { agent: 'Agente Analítico',   agentColor: 'bg-blue-500',   action: 'Riesgo calculado',      detail: 'Índice general: 91/100 · Estado: NORMAL · Sin anomalías',              type: 'info'      },
  { agent: 'Agente Visual',      agentColor: 'bg-violet-500', action: 'DETECCIÓN FUEGO',       detail: 'CAM-02 · Humo detectado · Confianza: 89% · Temp. estimada: 42°C',      type: 'alert'     },
  { agent: 'Agente Analítico',   agentColor: 'bg-blue-500',   action: 'Evaluación de riesgo',  detail: 'Cruzando datos meteo · Humedad 34% · Viento 18 km/h → Riesgo ALTO',    type: 'alert'     },
  { agent: 'Agente Respuesta',   agentColor: 'bg-orange-500', action: 'Alerta enviada',        detail: 'Telegram → Chat Blasson · Foto adjunta · Coordenadas GPS incluidas',   type: 'alert'     },
  { agent: 'Agente Respuesta',   agentColor: 'bg-orange-500', action: 'Piloto notificado',     detail: 'Piloto Norte → WhatsApp: "Sector Sur — verificar incidencia fuego"',    type: 'alert'     },
  { agent: 'Agente Visual',      agentColor: 'bg-violet-500', action: 'Frame analizado',       detail: 'DRON-01 · Ronda perimetral · Persona detectada · Zona restringida',     type: 'detection' },
  { agent: 'Agente Respuesta',   agentColor: 'bg-orange-500', action: 'Evento registrado',     detail: 'Firestore → event_logs · ID: evt_20240317_1432 · Foto guardada',        type: 'info'      },
  { agent: 'Agente Informes',    agentColor: 'bg-rose-500',   action: 'Informe generado',      detail: 'Resumen diario · 3 vuelos · 1 incidencia · PDF enviado por email',       type: 'report'    },
  { agent: 'Agente Analítico',   agentColor: 'bg-blue-500',   action: 'Conteo ganado',         detail: '47 bovinos localizados · Sector Central · Cobertura: 100%',             type: 'info'      },
];

// ── Ejemplos de detección ─────────────────────────────────────────────────────

const DETECTION_EXAMPLES: DetectionExample[] = [
  { label: 'Bovino', confidence: 0.97, bbox: [8,  30, 22, 28], color: '#22c55e', class: 'ganado'    },
  { label: 'Bovino', confidence: 0.94, bbox: [35, 45, 20, 25], color: '#22c55e', class: 'ganado'    },
  { label: 'Bovino', confidence: 0.91, bbox: [62, 35, 18, 22], color: '#22c55e', class: 'ganado'    },
  { label: 'Persona', confidence: 0.88, bbox: [78, 20, 8,  18], color: '#f97316', class: 'intrusion' },
  { label: 'Vehículo', confidence: 0.82, bbox: [15, 65, 25, 15], color: '#3b82f6', class: 'vehiculo' },
];

// ── Templates de informe ──────────────────────────────────────────────────────

const REPORT_TEMPLATE = {
  title: 'Informe Semanal — Blasson Property Investments',
  date: '10 – 16 Mar 2025',
  kpis: [
    { label: 'Vuelos completados', value: '18', icon: 'flight_takeoff', color: 'text-blue-600' },
    { label: 'Horas de cobertura', value: '27h', icon: 'timer', color: 'text-emerald-600' },
    { label: 'Incidencias', value: '3', icon: 'warning', color: 'text-orange-600' },
    { label: 'Tiempo respuesta', value: '4.2 min', icon: 'speed', color: 'text-violet-600' },
  ],
  sections: [
    { icon: 'check_circle', color: 'text-emerald-600', title: 'Estado general', body: 'Semana sin incidencias graves. Los 3 pilotos completaron sus rutas con cobertura del 100%. Sistema de alertas activo y respondiendo en tiempo real.' },
    { icon: 'local_fire_department', color: 'text-orange-600', title: 'Detección de fuego', body: '2 activaciones de alerta: 1 confirmada (incendio menor resuelto en 22 min) y 1 falsa alarma. Tiempo medio de respuesta: 3.8 min.' },
    { icon: 'security', color: 'text-red-600', title: 'Seguridad perimetral', body: '1 intrusión detectada en Sector Sur (persona no identificada, sin daños). Reportado a Guardia Civil. Referencia: 2024-TR-087.' },
    { icon: 'lightbulb', color: 'text-blue-600', title: 'Recomendaciones IA', body: 'Reparar CAM-04 (offline 6h). Aumentar patrullas sector norte en próximas 2 semanas (riesgo incendio moderado). Ajustar sensibilidad fuego para reducir falsos positivos.' },
  ],
};

// ── Utils ─────────────────────────────────────────────────────────────────────

function nowStr() {
  return new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function eventTypeStyle(type: LiveEvent['type']) {
  switch (type) {
    case 'alert':     return 'border-red-200 bg-red-50';
    case 'detection': return 'border-violet-200 bg-violet-50';
    case 'report':    return 'border-rose-200 bg-rose-50';
    default:          return 'border-slate-200 bg-white';
  }
}

// ── Página ────────────────────────────────────────────────────────────────────

export default function AgentesPage() {
  const [activeNode, setActiveNode]       = useState(0);
  const [activeAgent, setActiveAgent]     = useState<string | null>(null);
  const [events, setEvents]               = useState<LiveEvent[]>([]);
  const [showReport, setShowReport]       = useState(false);
  const [pipelineRunning, setPipelineRunning] = useState(true);
  const evRef = useRef(0);
  const counterRef = useRef(0);

  // Animar el pipeline node
  useEffect(() => {
    if (!pipelineRunning) return;
    const t = setInterval(() => {
      setActiveNode(n => (n + 1) % PIPELINE_NODES.length);
    }, 900);
    return () => clearInterval(t);
  }, [pipelineRunning]);

  // Generar eventos simulados
  useEffect(() => {
    const t = setInterval(() => {
      const base = BASE_EVENTS[counterRef.current % BASE_EVENTS.length];
      counterRef.current += 1;
      const ev: LiveEvent = { ...base, id: evRef.current++, time: nowStr() };
      setEvents(prev => [ev, ...prev].slice(0, 20));
    }, 2200);
    return () => clearInterval(t);
  }, []);

  return (
    <>
      {/* Header */}
      <header className="h-16 border-b border-slate-200 flex items-center justify-between px-4 lg:px-8 bg-white shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-violet-100 rounded-xl flex items-center justify-center">
            <span className="material-icons-round text-violet-600 text-xl">hub</span>
          </div>
          <div>
            <h2 className="text-lg font-black text-slate-900">Orquestación de Agentes IA</h2>
            <p className="text-xs text-slate-500">Pipeline de visión artificial · Tiempo real</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-full">
            <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
            <span className="text-xs font-bold text-emerald-700">Sistema activo</span>
          </div>
        </div>
      </header>

      {/* Scroll container */}
      <div className="flex-1 overflow-y-auto bg-slate-50 pb-24 lg:pb-8" style={{ scrollbarWidth: 'none' }}>
        <div className="max-w-6xl mx-auto px-4 lg:px-8 py-6 space-y-6">

          {/* ── SECCIÓN 1: Pipeline visual ── */}
          <section>
            <SectionHeader icon="account_tree" title="Pipeline de procesamiento" sub="De la captura a la acción en menos de 2 segundos" />

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 overflow-x-auto">
              <div className="flex items-center gap-0 min-w-max mx-auto" style={{ width: 'fit-content' }}>
                {PIPELINE_NODES.map((node, i) => (
                  <div key={node.id} className="flex items-center">
                    {/* Node */}
                    <div
                      className={`flex flex-col items-center gap-2 cursor-pointer transition-all ${activeNode === i ? 'scale-110' : 'opacity-70 hover:opacity-100'}`}
                      style={{ width: 100 }}
                    >
                      <div className={`w-14 h-14 rounded-2xl border-2 flex items-center justify-center transition-all ${node.bgColor} ${node.borderColor} ${activeNode === i ? 'shadow-lg' : ''}`}>
                        <span className={`material-icons-round text-2xl ${node.color}`}>{node.icon}</span>
                      </div>
                      <div className="text-center">
                        <p className={`text-xs font-black ${activeNode === i ? node.color : 'text-slate-600'}`}>{node.label}</p>
                        <p className="text-[9px] text-slate-400 leading-tight mt-0.5">{node.sublabel}</p>
                      </div>
                      {/* Processing indicator */}
                      {activeNode === i && (
                        <div className="flex gap-0.5">
                          {[0,1,2].map(d => (
                            <span key={d} className={`w-1 h-1 rounded-full animate-bounce ${node.bgColor.replace('bg-', 'bg-').replace('-50', '-400')}`}
                              style={{ animationDelay: `${d * 120}ms`, background: node.color.includes('sky') ? '#0ea5e9' : node.color.includes('violet') ? '#7c3aed' : node.color.includes('blue') ? '#2563eb' : node.color.includes('orange') ? '#ea580c' : node.color.includes('emerald') ? '#059669' : '#e11d48' }}
                            />
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Arrow connector */}
                    {i < PIPELINE_NODES.length - 1 && (
                      <div className="flex items-center mx-1 mb-6">
                        <div className={`h-0.5 w-8 transition-all ${activeNode > i ? 'bg-primary' : 'bg-slate-200'}`} />
                        <span className={`material-icons-round text-sm transition-colors ${activeNode > i ? 'text-primary' : 'text-slate-300'}`}>
                          arrow_forward
                        </span>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Timing bar */}
              <div className="mt-6 pt-5 border-t border-slate-100 grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-2xl font-black text-slate-900">&lt; 200ms</p>
                  <p className="text-xs text-slate-500">Inferencia YOLO por frame</p>
                </div>
                <div>
                  <p className="text-2xl font-black text-slate-900">&lt; 2s</p>
                  <p className="text-xs text-slate-500">Captura → Alerta Telegram</p>
                </div>
                <div>
                  <p className="text-2xl font-black text-slate-900">24/7</p>
                  <p className="text-xs text-slate-500">Monitorización continua</p>
                </div>
              </div>
            </div>
          </section>

          {/* ── SECCIÓN 2: Detección en vivo (CV demo) + Feed ── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* Demo detección visual */}
            <section>
              <SectionHeader icon="image_search" title="Visión artificial · Demo" sub="YOLO v8 — detección multi-clase en tiempo real" />
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                {/* Simulated video frame */}
                <div className="relative bg-slate-900" style={{ paddingTop: '56.25%' }}>
                  {/* Fake landscape background */}
                  <div className="absolute inset-0 overflow-hidden">
                    {/* Sky */}
                    <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, #1e3a5f 0%, #2d6a4f 50%, #52b788 70%, #8b7355 100%)' }} />
                    {/* Some shapes suggesting terrain */}
                    <div className="absolute bottom-0 left-0 right-0 h-2/5" style={{ background: '#6b8f6b', borderRadius: '60% 60% 0 0' }} />
                    <div className="absolute bottom-0 left-0 right-0 h-1/3" style={{ background: '#5a7a5a' }} />
                    {/* Drone overlay */}
                    <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-black/60 px-2 py-1 rounded text-white text-[10px] font-mono">
                      <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
                      CAM-02 · DRON-01 · 14:32:17
                    </div>
                    <div className="absolute top-3 right-3 bg-black/60 px-2 py-1 rounded text-white text-[10px] font-mono">
                      FPS: 30 · GPU: 78%
                    </div>
                  </div>

                  {/* Bounding boxes */}
                  {DETECTION_EXAMPLES.map((det, i) => (
                    <div
                      key={i}
                      className="absolute"
                      style={{
                        left: `${det.bbox[0]}%`,
                        top:  `${det.bbox[1]}%`,
                        width: `${det.bbox[2]}%`,
                        height: `${det.bbox[3]}%`,
                        border: `2px solid ${det.color}`,
                        boxSizing: 'border-box',
                      }}
                    >
                      <div
                        className="absolute -top-5 left-0 px-1.5 py-0.5 text-[9px] font-black text-white whitespace-nowrap"
                        style={{ background: det.color, borderRadius: '3px 3px 0 0' }}
                      >
                        {det.label} {Math.round(det.confidence * 100)}%
                      </div>
                    </div>
                  ))}

                  {/* Scan line animation */}
                  <div
                    className="absolute left-0 right-0 h-0.5 opacity-40"
                    style={{
                      background: 'linear-gradient(90deg, transparent, #00ff88, transparent)',
                      animation: 'scan 2s linear infinite',
                      top: '50%',
                    }}
                  />
                </div>

                {/* Detection summary */}
                <div className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-black text-slate-500 uppercase tracking-widest">Detecciones activas</p>
                    <span className="text-xs bg-violet-50 text-violet-600 font-bold px-2 py-0.5 rounded-full border border-violet-200">
                      {DETECTION_EXAMPLES.length} objetos
                    </span>
                  </div>
                  <div className="space-y-2">
                    {[
                      { label: 'Ganado (bovino)', count: 3, color: '#22c55e', icon: 'pets' },
                      { label: 'Persona detectada', count: 1, color: '#f97316', icon: 'person' },
                      { label: 'Vehículo', count: 1, color: '#3b82f6', icon: 'directions_car' },
                    ].map(d => (
                      <div key={d.label} className="flex items-center gap-2.5">
                        <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: d.color }} />
                        <span className="material-icons-round text-sm" style={{ color: d.color }}>{d.icon}</span>
                        <span className="text-sm text-slate-700 flex-1">{d.label}</span>
                        <span className="text-sm font-black text-slate-900">{d.count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </section>

            {/* Feed de actividad agentes */}
            <section>
              <SectionHeader icon="bolt" title="Feed en tiempo real" sub="Actividad de agentes · Actualización cada 2.2s" />
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="h-[380px] overflow-y-auto p-3 space-y-2" style={{ scrollbarWidth: 'none' }}>
                  {events.length === 0 && (
                    <div className="flex items-center justify-center h-full text-slate-400 text-sm">
                      Iniciando agentes...
                    </div>
                  )}
                  {events.map(ev => (
                    <div key={ev.id} className={`border rounded-xl p-3 transition-all ${eventTypeStyle(ev.type)}`}>
                      <div className="flex items-start gap-2.5">
                        <span className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${ev.agentColor}`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-xs font-black text-slate-700 truncate">{ev.agent}</p>
                            <p className="text-[10px] text-slate-400 font-mono shrink-0">{ev.time}</p>
                          </div>
                          <p className={`text-xs font-bold mt-0.5 ${ev.type === 'alert' ? 'text-red-600' : ev.type === 'detection' ? 'text-violet-600' : ev.type === 'report' ? 'text-rose-600' : 'text-slate-600'}`}>
                            {ev.action}
                          </p>
                          <p className="text-[11px] text-slate-500 mt-0.5 leading-tight">{ev.detail}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          </div>

          {/* ── SECCIÓN 3: Agentes ── */}
          <section>
            <SectionHeader icon="smart_toy" title="Los 4 agentes IA" sub="Cada agente tiene un rol especializado y se comunican entre sí" />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {AGENTS.map(agent => (
                <div
                  key={agent.id}
                  className={`bg-white rounded-2xl border ${activeAgent === agent.id ? agent.border + ' shadow-lg' : 'border-slate-200 shadow-sm'} cursor-pointer transition-all hover:shadow-md`}
                  onClick={() => setActiveAgent(a => a === agent.id ? null : agent.id)}
                >
                  <div className="p-5">
                    <div className={`w-12 h-12 ${agent.bg} rounded-2xl flex items-center justify-center mb-4`}>
                      <span className={`material-icons-round text-2xl ${agent.color}`}>{agent.icon}</span>
                    </div>
                    <p className={`text-xs font-black uppercase tracking-widest mb-1 ${agent.color}`}>{agent.role}</p>
                    <p className="font-black text-slate-900 text-sm leading-tight">{agent.name}</p>
                    <p className="text-[10px] text-slate-400 mt-1 font-mono">{agent.model}</p>
                  </div>

                  {/* Expanded detail */}
                  {activeAgent === agent.id && (
                    <div className={`border-t ${agent.border} p-5 space-y-3`}>
                      <p className="text-xs text-slate-600 leading-relaxed">{agent.description}</p>
                      <div>
                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Outputs</p>
                        <div className="space-y-1.5">
                          {agent.outputs.map((o, i) => (
                            <div key={i} className="flex items-start gap-1.5">
                              <span className={`material-icons-round text-xs mt-0.5 ${agent.color}`}>arrow_right</span>
                              <span className="text-xs text-slate-600">{o}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {!activeAgent || activeAgent !== agent.id ? (
                    <div className="px-5 pb-4">
                      <p className="text-[10px] text-slate-400 flex items-center gap-1">
                        <span className="material-icons-round text-xs">expand_more</span>
                        Ver detalles
                      </p>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </section>

          {/* ── SECCIÓN 4: Template de informe ── */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="material-icons-round text-rose-500 text-base">description</span>
                  <h3 className="text-sm font-black text-slate-800 uppercase tracking-wide">Template de informe generado por IA</h3>
                </div>
                <p className="text-xs text-slate-500 ml-6">Así queda el informe que recibe el cliente cada semana, generado automáticamente por Gemini</p>
              </div>
              <button
                onClick={() => setShowReport(r => !r)}
                className="flex items-center gap-2 px-4 py-2 bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 rounded-xl text-sm font-bold transition-colors"
              >
                <span className="material-icons-round text-base">{showReport ? 'expand_less' : 'preview'}</span>
                {showReport ? 'Ocultar' : 'Ver template'}
              </button>
            </div>

            {showReport && (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                {/* Report header */}
                <div className="bg-slate-900 px-8 py-6 flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-3 mb-2">
                      {['B','L','A','S','S','O','N'].map((l, i) => (
                        <span key={i} className="text-xl font-black text-white" style={{ letterSpacing: 3 }}>{l}</span>
                      ))}
                    </div>
                    <p className="text-slate-400 text-xs uppercase tracking-widest">Property Investments · Finca Cáceres</p>
                  </div>
                  <div className="text-right">
                    <p className="text-white font-bold text-sm">{REPORT_TEMPLATE.title.replace('Informe Semanal — Blasson Property Investments', 'Informe Semanal')}</p>
                    <p className="text-slate-400 text-xs mt-1">{REPORT_TEMPLATE.date}</p>
                    <p className="text-slate-500 text-[10px] mt-0.5">Generado por Gemini AI · dlos.ai</p>
                  </div>
                </div>

                {/* KPIs */}
                <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-y sm:divide-y-0 divide-slate-100">
                  {REPORT_TEMPLATE.kpis.map(k => (
                    <div key={k.label} className="p-5 flex items-center gap-3">
                      <span className={`material-icons-round text-2xl ${k.color}`}>{k.icon}</span>
                      <div>
                        <p className="text-2xl font-black text-slate-900">{k.value}</p>
                        <p className="text-xs text-slate-500">{k.label}</p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Sections */}
                <div className="divide-y divide-slate-100">
                  {REPORT_TEMPLATE.sections.map((s, i) => (
                    <div key={i} className="px-8 py-5 flex items-start gap-4">
                      <span className={`material-icons-round text-xl mt-0.5 ${s.color} shrink-0`}>{s.icon}</span>
                      <div>
                        <p className="font-black text-slate-800 text-sm mb-1">{s.title}</p>
                        <p className="text-sm text-slate-600 leading-relaxed">{s.body}</p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Footer */}
                <div className="bg-slate-50 px-8 py-4 flex items-center justify-between border-t border-slate-100">
                  <p className="text-xs text-slate-400">Generado automáticamente por el Agente de Informes · dlos.ai · sistema activo 24/7</p>
                  <div className="flex gap-2">
                    <span className="text-xs bg-white border border-slate-200 text-slate-500 px-2.5 py-1 rounded-lg font-medium">📧 Email automático</span>
                    <span className="text-xs bg-white border border-slate-200 text-slate-500 px-2.5 py-1 rounded-lg font-medium">📱 Telegram</span>
                    <span className="text-xs bg-white border border-slate-200 text-slate-500 px-2.5 py-1 rounded-lg font-medium">📄 PDF</span>
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* ── SECCIÓN 5: Integraciones ── */}
          <section>
            <SectionHeader icon="integration_instructions" title="Stack tecnológico" sub="Qué hay detrás de cada agente" />
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {[
                { icon: 'image_search', label: 'YOLO v8',      sub: 'Detección objetos',   color: 'text-violet-600', bg: 'bg-violet-50', border: 'border-violet-200' },
                { icon: 'memory',       label: 'GPU NVIDIA',   sub: 'Inferencia <200ms',   color: 'text-slate-600',  bg: 'bg-slate-50',  border: 'border-slate-200'  },
                { icon: 'auto_awesome', label: 'Gemini 2.0',   sub: 'Análisis + informes', color: 'text-blue-600',   bg: 'bg-blue-50',   border: 'border-blue-200'   },
                { icon: 'send',         label: 'Telegram Bot', sub: 'Alertas en tiempo real',color: 'text-sky-600',   bg: 'bg-sky-50',    border: 'border-sky-200'    },
                { icon: 'cloud',        label: 'Firebase',     sub: 'DB + almacenamiento', color: 'text-orange-600', bg: 'bg-orange-50', border: 'border-orange-200' },
                { icon: 'map',          label: 'Leaflet + GPS',sub: 'Mapas + coordenadas', color: 'text-emerald-600',bg: 'bg-emerald-50',border: 'border-emerald-200'},
              ].map(t => (
                <div key={t.label} className={`bg-white rounded-2xl border ${t.border} shadow-sm p-4 flex flex-col items-center text-center gap-2`}>
                  <div className={`w-10 h-10 ${t.bg} rounded-xl flex items-center justify-center`}>
                    <span className={`material-icons-round text-xl ${t.color}`}>{t.icon}</span>
                  </div>
                  <p className="font-black text-slate-800 text-xs leading-tight">{t.label}</p>
                  <p className="text-[10px] text-slate-400 leading-tight">{t.sub}</p>
                </div>
              ))}
            </div>
          </section>

        </div>
      </div>

      {/* CSS for scan animation */}
      <style>{`
        @keyframes scan {
          0%   { top: 0%; }
          100% { top: 100%; }
        }
      `}</style>
    </>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionHeader({ icon, title, sub }: { icon: string; title: string; sub: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span className="material-icons-round text-primary text-base">{icon}</span>
      <div>
        <p className="text-sm font-black text-slate-800">{title}</p>
        <p className="text-xs text-slate-500">{sub}</p>
      </div>
    </div>
  );
}
