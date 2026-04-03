'use client';

import { useState, useEffect, useCallback } from 'react';

export type AlarmType = 'fuego' | 'intrusion' | 'vehiculo' | 'dron' | 'piloto' | 'manual';
export type AlarmSeverity = 'alta' | 'media' | 'baja';
export type AlarmStatus = 'activa' | 'reconocida' | 'resuelta';

export interface Alarm {
  id: string;
  tipo: AlarmType;
  severidad: AlarmSeverity;
  fuente: string;
  mensaje: string;
  timestamp: Date;
  status: AlarmStatus;
  acknowledgedAt?: Date;
  resolvedAt?: Date;
  sentChannels?: string[];
}

// ── Config visual por tipo ───────────────────────────────────────────────────

const TIPO: Record<AlarmType, { icon: string; label: string; color: string; bg: string; border: string }> = {
  fuego:     { icon: 'local_fire_department', label: 'Incendio',   color: 'text-orange-600', bg: 'bg-orange-50',  border: 'border-orange-300' },
  intrusion: { icon: 'person_off',            label: 'Intrusión',  color: 'text-red-600',    bg: 'bg-red-50',     border: 'border-red-300' },
  vehiculo:  { icon: 'directions_car',        label: 'Vehículo',   color: 'text-amber-700',  bg: 'bg-amber-50',   border: 'border-amber-300' },
  dron:      { icon: 'flight',                label: 'Dron',       color: 'text-blue-600',   bg: 'bg-blue-50',    border: 'border-blue-300' },
  piloto:    { icon: 'email',                 label: 'Piloto',     color: 'text-purple-600', bg: 'bg-purple-50',  border: 'border-purple-300' },
  manual:    { icon: 'warning',               label: 'Manual',     color: 'text-slate-700',  bg: 'bg-slate-100',  border: 'border-slate-300' },
};

const SEV: Record<AlarmSeverity, { label: string; bar: string; badge: string; dot: string }> = {
  alta:  { label: 'ALTA',  bar: 'bg-red-500',    badge: 'bg-red-100 text-red-700',       dot: 'bg-red-500' },
  media: { label: 'MEDIA', bar: 'bg-orange-400', badge: 'bg-orange-100 text-orange-700', dot: 'bg-orange-400' },
  baja:  { label: 'BAJA',  bar: 'bg-slate-300',  badge: 'bg-slate-100 text-slate-600',   dot: 'bg-slate-400' },
};

// ── Datos simulados ──────────────────────────────────────────────────────────

const INITIAL_ALARMS: Alarm[] = [
  {
    id: 'alm-001', tipo: 'fuego', severidad: 'alta', status: 'activa',
    fuente: 'CAM-02 — Sur Entrada',
    mensaje: 'Posible incendio. T° detectada: 38°C, humedad: 18%, viento: 15 km/h. Confianza IA: 87%.',
    timestamp: new Date(Date.now() - 5 * 60000),
  },
  {
    id: 'alm-002', tipo: 'intrusion', severidad: 'alta', status: 'activa',
    fuente: 'Email Piloto Sur',
    mensaje: 'Persona con cámara fotográfica en zona restringida. Coordenadas: 39.921, -5.641. 15 min en la zona.',
    timestamp: new Date(Date.now() - 2 * 3600000),
  },
  {
    id: 'alm-003', tipo: 'vehiculo', severidad: 'media', status: 'resuelta',
    fuente: 'Email Piloto Este',
    mensaje: 'Todoterreno no autorizado en camino interior Sector Este. Matrícula parcial: 43XX. Reportado a Guardia Civil.',
    timestamp: new Date(Date.now() - 26 * 3600000),
    resolvedAt: new Date(Date.now() - 24 * 3600000),
    sentChannels: ['seguridad', 'admin'],
  },
  {
    id: 'alm-004', tipo: 'dron', severidad: 'media', status: 'resuelta',
    fuente: 'Observación manual',
    mensaje: 'Dron no identificado sobrevolando perímetro norte durante 8 min. No reingresó. Documentado.',
    timestamp: new Date(Date.now() - 3 * 24 * 3600000),
    resolvedAt: new Date(Date.now() - 3 * 24 * 3600000 + 3600000),
    sentChannels: ['seguridad'],
  },
];

const EMPTY_FORM = {
  tipo: 'manual' as AlarmType,
  severidad: 'media' as AlarmSeverity,
  fuente: '',
  mensaje: '',
};

// ── Canal config (leído de API GET) ─────────────────────────────────────────

interface ChannelStatus {
  configured: boolean;
}

const CHANNEL_META: Record<string, { label: string; icon: string; desc: string; types: AlarmType[] }> = {
  general:   { label: 'General',   icon: 'forum',   desc: 'Canal principal / fallback',     types: ['manual'] },
  fuego:     { label: 'Fuego',     icon: 'local_fire_department', desc: 'Alertas de incendio',  types: ['fuego'] },
  seguridad: { label: 'Seguridad', icon: 'security', desc: 'Intrusión, vehículos, drones',   types: ['intrusion', 'vehiculo', 'dron'] },
  pilotos:   { label: 'Pilotos',   icon: 'flight',   desc: 'Comunicaciones de pilotos',     types: ['piloto'] },
  admin:     { label: 'Admin',     icon: 'shield',   desc: 'Escalado (severidad ALTA)',      types: [] },
};

// ── Componente ───────────────────────────────────────────────────────────────

interface AlarmasTabProps {
  alarmCount: number;
  onAcknowledge: () => void;
}

export default function AlarmasTab({ onAcknowledge }: AlarmasTabProps) {
  const [alarms, setAlarms] = useState<Alarm[]>(INITIAL_ALARMS);
  const [form, setForm] = useState(EMPTY_FORM);
  const [showForm, setShowForm] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [sendResults, setSendResults] = useState<Record<string, { ok: boolean; channels: number }>>({});
  const [channels, setChannels] = useState<Record<string, ChannelStatus>>({});
  const [loadingChannels, setLoadingChannels] = useState(true);
  const [view, setView] = useState<'activas' | 'historial'>('activas');

  const active = alarms.filter(a => a.status === 'activa');
  const acknowledged = alarms.filter(a => a.status === 'reconocida');
  const resolved = alarms.filter(a => a.status === 'resuelta');

  // Fetch channel config on mount
  useEffect(() => {
    fetch('/api/blasson/alarma')
      .then(r => r.json())
      .then(data => { if (data.channels) setChannels(data.channels); })
      .catch(() => {})
      .finally(() => setLoadingChannels(false));
  }, []);

  // Elapsed time string
  const elapsed = (date: Date) => {
    const s = Math.floor((Date.now() - date.getTime()) / 1000);
    if (s < 60)  return `${s}s`;
    if (s < 3600) return `${Math.floor(s / 60)}min`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}min`;
    return `${Math.floor(s / 86400)}d`;
  };

  const formatTs = (d: Date) =>
    d.toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

  // Send alarm to Telegram
  const sendTelegram = useCallback(async (alarm: Alarm) => {
    setSendingId(alarm.id);
    try {
      const res = await fetch('/api/blasson/alarma', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipo: alarm.tipo,
          severidad: alarm.severidad,
          fuente: alarm.fuente,
          mensaje: alarm.mensaje,
        }),
      });
      const data = await res.json();
      const ok = data.status === 'success';
      setSendResults(prev => ({ ...prev, [alarm.id]: { ok, channels: data.channelsSent ?? (ok ? 1 : 0) } }));
      if (ok) {
        setAlarms(prev => prev.map(a =>
          a.id === alarm.id ? { ...a, sentChannels: data.results?.filter((r: { success: boolean }) => r.success).map((r: { channel: string }) => r.channel) ?? [] } : a
        ));
      }
    } catch {
      setSendResults(prev => ({ ...prev, [alarm.id]: { ok: false, channels: 0 } }));
    }
    setSendingId(null);
  }, []);

  const acknowledge = (id: string) =>
    setAlarms(prev => prev.map(a => a.id === id ? { ...a, status: 'reconocida', acknowledgedAt: new Date() } : a));

  const resolve = (id: string) => {
    setAlarms(prev => prev.map(a => a.id === id ? { ...a, status: 'resuelta', resolvedAt: new Date() } : a));
    const remaining = alarms.filter(a => a.status === 'activa' && a.id !== id).length
      + alarms.filter(a => a.status === 'reconocida' && a.id !== id).length;
    if (remaining === 0) onAcknowledge();
  };

  const submitManual = async () => {
    if (!form.fuente.trim() || !form.mensaje.trim()) return;
    const alarm: Alarm = {
      id: `alm-${Date.now()}`,
      tipo: form.tipo, severidad: form.severidad,
      fuente: form.fuente.trim(), mensaje: form.mensaje.trim(),
      timestamp: new Date(), status: 'activa',
    };
    setAlarms(prev => [alarm, ...prev]);
    setForm(EMPTY_FORM);
    setShowForm(false);
    // Auto-send
    setSendingId(alarm.id);
    try {
      const res = await fetch('/api/blasson/alarma', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo: alarm.tipo, severidad: alarm.severidad, fuente: alarm.fuente, mensaje: alarm.mensaje }),
      });
      const data = await res.json();
      setSendResults(prev => ({ ...prev, [alarm.id]: { ok: data.status === 'success', channels: data.channelsSent ?? 0 } }));
    } catch {
      setSendResults(prev => ({ ...prev, [alarm.id]: { ok: false, channels: 0 } }));
    }
    setSendingId(null);
  };

  // System status
  const highActive = active.filter(a => a.severidad === 'alta').length;
  const status = highActive > 0 ? 'critico' : active.length > 0 ? 'alerta' : acknowledged.length > 0 ? 'reconocido' : 'normal';
  const STATUS_BG = { critico: 'bg-red-600', alerta: 'bg-orange-600', reconocido: 'bg-amber-600', normal: 'bg-emerald-700' };
  const STATUS_LABEL = { critico: 'CRÍTICO', alerta: 'ALERTA', reconocido: 'RECONOCIDO', normal: 'SISTEMA NORMAL' };

  // ── AlarmCard ──
  const AlarmCard = ({ alarm, compact = false }: { alarm: Alarm; compact?: boolean }) => {
    const tc = TIPO[alarm.tipo];
    const sc = SEV[alarm.severidad];
    const sr = sendResults[alarm.id];
    const isSending = sendingId === alarm.id;
    const unacknowledgedMins = alarm.status === 'activa'
      ? Math.floor((Date.now() - alarm.timestamp.getTime()) / 60000)
      : 0;
    const needsEscalation = unacknowledgedMins > 10 && alarm.severidad === 'alta' && alarm.status === 'activa';

    return (
      <div className={`bg-white rounded-2xl border-2 overflow-hidden transition-all ${
        alarm.status === 'activa'      ? `${tc.border} shadow-md` :
        alarm.status === 'reconocida' ? 'border-amber-200 shadow-sm' :
                                        'border-slate-200 opacity-70'
      }`}>
        {/* Severity bar */}
        <div className={`h-1 ${alarm.status === 'activa' ? sc.bar : 'bg-slate-200'} ${
          alarm.status === 'activa' && alarm.severidad === 'alta' ? 'animate-pulse' : ''
        }`} />

        <div className="p-4">
          {/* Header row */}
          <div className="flex items-start gap-3 mb-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${tc.bg}`}>
              <span className={`material-icons-round text-xl ${tc.color}`}>{tc.icon}</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${sc.badge}`}>
                  {sc.label}
                </span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${tc.bg} ${tc.color}`}>
                  {tc.label.toUpperCase()}
                </span>
                {needsEscalation && (
                  <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-red-600 text-white animate-pulse">
                    ESCALAR
                  </span>
                )}
                <span className="text-xs text-slate-400 ml-auto font-mono">+{elapsed(alarm.timestamp)}</span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5 truncate">{formatTs(alarm.timestamp)}</p>
            </div>
          </div>

          {/* Source + message */}
          <p className="text-sm font-bold text-slate-800 mb-1">{alarm.fuente}</p>
          <p className={`text-sm text-slate-600 leading-relaxed ${compact ? 'line-clamp-2' : ''}`}>{alarm.mensaje}</p>

          {/* Sent channels */}
          {alarm.sentChannels && alarm.sentChannels.length > 0 && (
            <div className="flex items-center gap-1.5 mt-2 flex-wrap">
              <span className="material-icons-round text-xs text-green-500">send</span>
              <span className="text-[10px] text-slate-400">Enviado a:</span>
              {alarm.sentChannels.map(ch => (
                <span key={ch} className="text-[10px] bg-green-50 text-green-700 px-1.5 py-0.5 rounded font-medium">{ch}</span>
              ))}
            </div>
          )}

          {/* Escalation warning */}
          {needsEscalation && (
            <div className="mt-3 bg-red-50 border border-red-200 rounded-xl px-3 py-2 flex items-center gap-2">
              <span className="material-icons-round text-red-500 text-sm">escalator_warning</span>
              <p className="text-xs text-red-700 font-semibold">
                Sin reconocer {unacknowledgedMins} min — considera escalar al canal Admin
              </p>
            </div>
          )}

          {/* Actions (only for active/acknowledged) */}
          {alarm.status !== 'resuelta' && (
            <div className="flex gap-2 mt-4">
              {/* Telegram button */}
              <button
                onClick={() => sendTelegram(alarm)}
                disabled={isSending}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all ${
                  sr?.ok
                    ? 'bg-green-100 text-green-700'
                    : 'bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-60'
                }`}
              >
                <span className="material-icons-round text-sm">{isSending ? 'hourglass_empty' : sr?.ok ? 'check_circle' : 'send'}</span>
                {isSending ? 'Enviando...' : sr?.ok ? `✓ ${sr.channels} canal${sr.channels !== 1 ? 'es' : ''}` : 'Telegram'}
              </button>

              {alarm.status === 'activa' && (
                <button
                  onClick={() => acknowledge(alarm.id)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-amber-100 hover:bg-amber-200 text-amber-800 transition-colors"
                >
                  <span className="material-icons-round text-sm">visibility</span>
                  Reconocer
                </button>
              )}
              <button
                onClick={() => resolve(alarm.id)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-green-100 hover:bg-green-200 text-green-800 transition-colors ml-auto"
              >
                <span className="material-icons-round text-sm">check_circle</span>
                Resolver
              </button>
            </div>
          )}

          {/* Resolved info */}
          {alarm.status === 'resuelta' && alarm.resolvedAt && (
            <p className="text-xs text-slate-400 mt-2">
              Resuelta {formatTs(alarm.resolvedAt)}
            </p>
          )}
        </div>
      </div>
    );
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="h-full overflow-y-auto bg-slate-50">

      {/* Hero status bar */}
      <div className={`${STATUS_BG[status]} transition-colors`}>
        <div className="max-w-6xl mx-auto px-6 py-5 flex items-center gap-5">
          {/* Icon */}
          <div className={`w-14 h-14 rounded-2xl flex items-center justify-center border-2 border-white/20 shrink-0 ${
            status !== 'normal' ? 'animate-pulse' : ''
          }`} style={{ background: 'rgba(255,255,255,0.15)' }}>
            <span className="material-icons-round text-white text-3xl">
              {status === 'normal' ? 'shield' : status === 'reconocido' ? 'visibility' : 'notifications_active'}
            </span>
          </div>

          {/* Status text */}
          <div className="flex-1">
            <div className="flex items-baseline gap-3">
              <h2 className="text-2xl font-black text-white">{STATUS_LABEL[status]}</h2>
              {status !== 'normal' && (
                <span className="text-white/60 text-sm font-medium">
                  {active.length} activa{active.length !== 1 ? 's' : ''}
                  {acknowledged.length > 0 && ` · ${acknowledged.length} reconocida${acknowledged.length !== 1 ? 's' : ''}`}
                </span>
              )}
            </div>
            <p className="text-white/60 text-sm mt-0.5">
              {status === 'normal'
                ? 'Todos los sistemas operativos — Sin alarmas pendientes'
                : `Última actualización: ${new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`}
            </p>
          </div>

          {/* Counters */}
          <div className="flex gap-4 shrink-0">
            {[
              { n: active.length,       label: 'Activas',     bg: 'bg-white/20' },
              { n: acknowledged.length, label: 'Reconocidas', bg: 'bg-white/10' },
              { n: resolved.length,     label: 'Resueltas',   bg: 'bg-white/10' },
            ].map(c => (
              <div key={c.label} className={`${c.bg} rounded-xl px-3 py-2 text-center min-w-[52px]`}>
                <p className="text-2xl font-black text-white">{c.n}</p>
                <p className="text-[10px] text-white/60 font-medium">{c.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-6 space-y-6">

        {/* Telegram channels panel */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2">
            <span className="material-icons-round text-blue-500 text-lg">send</span>
            <h3 className="font-bold text-slate-800 text-sm">Canales Telegram</h3>
            <span className="ml-auto text-xs text-slate-400">Enrutamiento automático por tipo de alarma</span>
          </div>
          <div className="p-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {Object.entries(CHANNEL_META).map(([key, meta]) => {
              const cfg = channels[key];
              const isConfigured = cfg?.configured ?? false;
              return (
                <div key={key} className={`rounded-xl border p-3 transition-all ${
                  isConfigured ? 'border-green-200 bg-green-50' : 'border-slate-200 bg-slate-50 opacity-60'
                }`}>
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className={`material-icons-round text-base ${isConfigured ? 'text-green-600' : 'text-slate-400'}`}>
                      {meta.icon}
                    </span>
                    <span className={`text-xs font-bold ${isConfigured ? 'text-green-700' : 'text-slate-500'}`}>
                      {meta.label}
                    </span>
                    <span className={`ml-auto w-2 h-2 rounded-full ${isConfigured ? 'bg-green-500' : 'bg-slate-300'}`} />
                  </div>
                  <p className="text-[10px] text-slate-400 leading-tight">{meta.desc}</p>
                  {meta.types.length > 0 && (
                    <p className="text-[10px] text-slate-300 mt-1">
                      {meta.types.map(t => TIPO[t].label).join(', ')}
                    </p>
                  )}
                  {loadingChannels && (
                    <div className="w-3 h-3 border-2 border-slate-300 border-t-slate-500 rounded-full animate-spin mt-1" />
                  )}
                </div>
              );
            })}
          </div>
          <div className="px-5 pb-4">
            <p className="text-[11px] text-slate-400">
              💡 Configura los canales en variables de entorno:{' '}
              <code className="bg-slate-100 px-1 rounded">TELEGRAM_CHAT_FUEGO</code>{' '}
              <code className="bg-slate-100 px-1 rounded">TELEGRAM_CHAT_SEGURIDAD</code>{' '}
              <code className="bg-slate-100 px-1 rounded">TELEGRAM_CHAT_ADMIN</code>
            </p>
          </div>
        </div>

        {/* View toggle + new alarm button */}
        <div className="flex items-center gap-3">
          <div className="flex gap-1 bg-slate-200/60 p-1 rounded-xl">
            <button
              onClick={() => setView('activas')}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all ${view === 'activas' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}
            >
              <span className="material-icons-round text-sm">notifications_active</span>
              Activas & Reconocidas
              {(active.length + acknowledged.length) > 0 && (
                <span className="bg-red-500 text-white text-[9px] w-4 h-4 rounded-full flex items-center justify-center font-black">
                  {active.length + acknowledged.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setView('historial')}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all ${view === 'historial' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}
            >
              <span className="material-icons-round text-sm">history</span>
              Historial
            </button>
          </div>
          <button
            onClick={() => setShowForm(!showForm)}
            className="ml-auto flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-white px-4 py-2.5 rounded-xl text-xs font-bold transition-colors"
          >
            <span className="material-icons-round text-sm">add_alert</span>
            Nueva alarma
          </button>
        </div>

        {/* New alarm form */}
        {showForm && (
          <div className="bg-white rounded-2xl border-2 border-slate-800 shadow-lg overflow-hidden">
            <div className="bg-slate-800 px-5 py-3 flex items-center gap-2">
              <span className="material-icons-round text-amber-400 text-lg">add_alert</span>
              <h3 className="font-bold text-white text-sm">Activar Alarma Manual</h3>
              <button onClick={() => setShowForm(false)} className="ml-auto text-slate-400 hover:text-white">
                <span className="material-icons-round text-base">close</span>
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-500 block mb-1.5">Tipo de alarma</label>
                  <select
                    value={form.tipo}
                    onChange={e => setForm(p => ({ ...p, tipo: e.target.value as AlarmType }))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-800/30 bg-white"
                  >
                    <option value="fuego">🔥 Incendio / Fuego</option>
                    <option value="intrusion">🚨 Intrusión persona</option>
                    <option value="vehiculo">🚗 Vehículo no autorizado</option>
                    <option value="dron">🚁 Dron no autorizado</option>
                    <option value="piloto">✈️ Evento piloto</option>
                    <option value="manual">⚠️ Alarma general</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 block mb-1.5">Severidad</label>
                  <select
                    value={form.severidad}
                    onChange={e => setForm(p => ({ ...p, severidad: e.target.value as AlarmSeverity }))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-800/30 bg-white"
                  >
                    <option value="alta">🔴 Alta — Acción inmediata</option>
                    <option value="media">🟡 Media — Monitorizar</option>
                    <option value="baja">🟢 Baja — Informativa</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 block mb-1.5">Fuente / Ubicación</label>
                <input
                  value={form.fuente}
                  onChange={e => setForm(p => ({ ...p, fuente: e.target.value }))}
                  placeholder="Ej: Puerta Norte, CAM-02, Sector Este..."
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-800/30"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 block mb-1.5">Descripción del incidente</label>
                <textarea
                  value={form.mensaje}
                  onChange={e => setForm(p => ({ ...p, mensaje: e.target.value }))}
                  placeholder="Describe el incidente con el máximo detalle posible..."
                  rows={3}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-slate-800/30"
                />
              </div>
              {/* Channel preview */}
              <div className="bg-slate-50 rounded-xl p-3 flex items-center gap-2">
                <span className="material-icons-round text-slate-400 text-sm">route</span>
                <p className="text-xs text-slate-500">
                  Esta alarma se enviará a:{' '}
                  <span className="font-semibold text-slate-700">
                    {CHANNEL_META[
                      form.tipo === 'fuego' ? 'fuego' :
                      ['intrusion', 'vehiculo', 'dron'].includes(form.tipo) ? 'seguridad' :
                      form.tipo === 'piloto' ? 'pilotos' : 'general'
                    ]?.label ?? 'General'}
                  </span>
                  {form.severidad === 'alta' && ' + Admin (severidad alta)'}
                </p>
              </div>
              <button
                onClick={submitManual}
                disabled={!form.fuente.trim() || !form.mensaje.trim() || !!sendingId}
                className="w-full flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-black py-3.5 rounded-xl text-sm transition-colors"
              >
                <span className="material-icons-round">notifications_active</span>
                Activar + Notificar por Telegram
              </button>
            </div>
          </div>
        )}

        {/* ACTIVE & ACKNOWLEDGED alarms */}
        {view === 'activas' && (
          <div className="space-y-4">
            {active.length === 0 && acknowledged.length === 0 && (
              <div className="bg-white rounded-2xl border border-slate-200 py-16 flex flex-col items-center gap-3 text-slate-300">
                <span className="material-icons-round text-6xl">shield</span>
                <p className="text-sm font-semibold text-slate-400">Sin alarmas activas</p>
                <p className="text-xs text-slate-300">El sistema está operativo</p>
              </div>
            )}

            {active.length > 0 && (
              <div>
                <p className="text-xs font-black text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                  <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                  Alarmas activas ({active.length})
                </p>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {active.map(a => <AlarmCard key={a.id} alarm={a} />)}
                </div>
              </div>
            )}

            {acknowledged.length > 0 && (
              <div>
                <p className="text-xs font-black text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                  <span className="w-2 h-2 bg-amber-400 rounded-full" />
                  Reconocidas — pendiente de resolución ({acknowledged.length})
                </p>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {acknowledged.map(a => <AlarmCard key={a.id} alarm={a} />)}
                </div>
              </div>
            )}
          </div>
        )}

        {/* HISTORY */}
        {view === 'historial' && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-slate-800">Historial de alarmas</h3>
              <span className="text-xs text-slate-400">{resolved.length} resueltas</span>
            </div>
            {resolved.length === 0 ? (
              <div className="py-12 text-center text-slate-300">
                <span className="material-icons-round text-5xl">history</span>
                <p className="text-sm mt-2 text-slate-400">Sin historial todavía</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {resolved.map(alarm => {
                  const tc = TIPO[alarm.tipo];
                  const sc = SEV[alarm.severidad];
                  const sr = sendResults[alarm.id];
                  return (
                    <div key={alarm.id} className="flex items-center gap-4 px-5 py-4">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${tc.bg}`}>
                        <span className={`material-icons-round text-sm ${tc.color}`}>{tc.icon}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <p className="text-sm font-semibold text-slate-700 truncate">{alarm.fuente}</p>
                        </div>
                        <p className="text-xs text-slate-400">{formatTs(alarm.timestamp)}</p>
                        {alarm.sentChannels && alarm.sentChannels.length > 0 && (
                          <div className="flex items-center gap-1 mt-0.5">
                            <span className="material-icons-round text-[10px] text-green-500">send</span>
                            <span className="text-[10px] text-slate-400">{alarm.sentChannels.join(', ')}</span>
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${sc.badge}`}>{sc.label}</span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${tc.bg} ${tc.color}`}>{tc.label}</span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-700">RESUELTA</span>
                      </div>
                      {/* Re-send option */}
                      {!sr?.ok && (
                        <button
                          onClick={() => sendTelegram(alarm)}
                          disabled={sendingId === alarm.id}
                          className="text-slate-400 hover:text-blue-600 transition-colors"
                          title="Reenviar por Telegram"
                        >
                          <span className="material-icons-round text-base">send</span>
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
