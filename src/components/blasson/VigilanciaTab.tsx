'use client';

// Vigilancia: emails de pilotos + eventos de seguridad
// TODO: Conectar con servidor de correo real (IMAP/Exchange)
// TODO: Conectar con sistema de deteccion de personas/vehiculos (camara + IA)

import { useState } from 'react';

type EmailType = 'patrulla' | 'incidencia' | 'alerta' | 'reporte';
type EventType = 'persona' | 'vehiculo' | 'animal' | 'dron';
type Severity = 'alta' | 'media' | 'baja';

interface PilotEmail {
  id: string;
  from: string;
  fromName: string;
  subject: string;
  timestamp: Date;
  type: EmailType;
  body: string;
  read: boolean;
  attachments?: string[];
}

interface SurveillanceEvent {
  id: string;
  type: EventType;
  location: string;
  timestamp: Date;
  severity: Severity;
  description: string;
  status: 'activo' | 'resuelto';
  reportedBy: string;
}

const PILOT_EMAILS: PilotEmail[] = [
  {
    id: 'em-001', fromName: 'Carlos — Piloto Norte', from: 'piloto.norte@blasson.com',
    subject: 'Vuelo completado - Sector Norte', timestamp: new Date(Date.now() - 30 * 60000),
    type: 'reporte', read: false,
    body: 'Vuelo completado en Sector Norte (vuelo_007 y vuelo_006). Sin incidencias destacables. Cobertura: 98%. Batería final: 21%. El ganado se encuentra agrupado en la zona central. Charcas con nivel de agua normal. Adjunto log de vuelo.',
    attachments: ['log_vuelo_norte_2024.csv'],
  },
  {
    id: 'em-002', fromName: 'Pedro — Piloto Sur', from: 'piloto.sur@blasson.com',
    subject: '⚠️ ALERTA: Persona detectada en zona restringida', timestamp: new Date(Date.now() - 2 * 3600000),
    type: 'alerta', read: false,
    body: 'Durante patrulla rutinaria en Sector Sur se ha detectado una persona a pie en zona de acceso restringido. Coordenadas aproximadas: 39.9210, -5.6415 (cerca del acceso principal sur). La persona portaba cámara fotográfica. Se adjuntan capturas del vuelo. Recomiendo notificación a propietario y seguimiento.',
    attachments: ['captura_persona_001.jpg', 'captura_persona_002.jpg'],
  },
  {
    id: 'em-003', fromName: 'Carlos — Piloto Norte', from: 'piloto.norte@blasson.com',
    subject: 'Patrulla matutina - Todo normal', timestamp: new Date(Date.now() - 6 * 3600000),
    type: 'patrulla', read: true,
    body: 'Patrulla matutina finalizada sin incidencias. Estado general de la finca: normal. Vegetación seca en sector norte (zona alta, riesgo moderado de incendio en periodo estival). Vallado perimetral sin brechas detectadas. Nivel de agua en charcas: aceptable (70-80% capacidad estimada).',
  },
  {
    id: 'em-004', fromName: 'Ana — Piloto Este', from: 'piloto.este@blasson.com',
    subject: '🚗 Incidencia: Vehículo no autorizado Sector Este', timestamp: new Date(Date.now() - 24 * 3600000),
    type: 'incidencia', read: true,
    body: 'Se ha detectado un vehículo todoterreno de color negro en el camino interior del Sector Este, zona no habilitada para vehículos. Matrícula parcialmente legible: 43XX-FGH (posible). El vehículo permaneció aproximadamente 45 minutos antes de salir por el mismo acceso. Hecho documentado y reportado a Guardia Civil (ref. 2024-TR-087).',
    attachments: ['vehiculo_sector_este_001.jpg'],
  },
  {
    id: 'em-005', fromName: 'Pedro — Piloto Sur', from: 'piloto.sur@blasson.com',
    subject: 'Informe semanal - Sector Sur', timestamp: new Date(Date.now() - 2 * 24 * 3600000),
    type: 'reporte', read: true,
    body: 'Informe de actividad semanal del Sector Sur. Vuelos realizados: 5. Horas de vuelo: 7.5h. Incidencias: 1 persona no autorizada (pendiente seguimiento). Estado del vallado: bueno, sin brechas. Presencia de fauna: jabalíes detectados en zona sur (normal para la época). Recomendación: revisar el acceso sur 2 que parece tener la puerta mal cerrada.',
  },
];

const SURVEILLANCE_EVENTS: SurveillanceEvent[] = [
  {
    id: 'sev-001', type: 'persona', severity: 'alta', status: 'activo',
    location: 'Sector Sur — Acceso Restringido', timestamp: new Date(Date.now() - 2 * 3600000),
    description: 'Persona con cámara fotográfica en zona restringida', reportedBy: 'Piloto Sur',
  },
  {
    id: 'sev-002', type: 'vehiculo', severity: 'media', status: 'resuelto',
    location: 'Sector Este — Camino Interior', timestamp: new Date(Date.now() - 24 * 3600000),
    description: 'Vehículo todoterreno no autorizado (reportado a GC)', reportedBy: 'Piloto Este',
  },
  {
    id: 'sev-003', type: 'dron', severity: 'media', status: 'resuelto',
    location: 'Perímetro Norte', timestamp: new Date(Date.now() - 3 * 24 * 3600000),
    description: 'Dron no identificado sobrevolando perímetro norte', reportedBy: 'Observación manual',
  },
  {
    id: 'sev-004', type: 'animal', severity: 'baja', status: 'resuelto',
    location: 'Sector Oeste — Vallado Sur', timestamp: new Date(Date.now() - 4 * 24 * 3600000),
    description: 'Manada de jabalíes detectada cerca del vallado', reportedBy: 'Piloto Norte',
  },
  {
    id: 'sev-005', type: 'persona', severity: 'baja', status: 'resuelto',
    location: 'Acceso Principal', timestamp: new Date(Date.now() - 7 * 24 * 3600000),
    description: 'Excursionistas en acceso público (sin incidencia)', reportedBy: 'Piloto Sur',
  },
];

const EMAIL_STYLES: Record<EmailType, { color: string; icon: string; label: string; bg: string }> = {
  patrulla:   { color: 'text-blue-700',   icon: 'flight',                label: 'Patrulla',   bg: 'bg-blue-50' },
  incidencia: { color: 'text-orange-700', icon: 'warning',               label: 'Incidencia', bg: 'bg-orange-50' },
  alerta:     { color: 'text-red-700',    icon: 'notifications_active',  label: 'Alerta',     bg: 'bg-red-50' },
  reporte:    { color: 'text-green-700',  icon: 'description',           label: 'Reporte',    bg: 'bg-green-50' },
};

const EVENT_ICONS: Record<EventType, string> = { persona: 'person', vehiculo: 'directions_car', animal: 'pets', dron: 'flight' };
const EVENT_COLORS: Record<EventType, string> = { persona: 'bg-red-100 text-red-700', vehiculo: 'bg-orange-100 text-orange-700', animal: 'bg-green-100 text-green-700', dron: 'bg-blue-100 text-blue-700' };
const SEV_COLORS: Record<Severity, string> = { alta: 'bg-red-100 text-red-700', media: 'bg-orange-100 text-orange-700', baja: 'bg-slate-100 text-slate-600' };

export default function VigilanciaTab() {
  const [section, setSection] = useState<'emails' | 'eventos'>('emails');
  const [emails, setEmails] = useState<PilotEmail[]>(PILOT_EMAILS);
  const [selected, setSelected] = useState<PilotEmail | null>(null);

  const unread = emails.filter(e => !e.read).length;
  const activeEvents = SURVEILLANCE_EVENTS.filter(e => e.status === 'activo').length;

  const openEmail = (email: PilotEmail) => {
    setSelected(email);
    setEmails(prev => prev.map(e => e.id === email.id ? { ...e, read: true } : e));
  };

  const formatTime = (date: Date) => {
    const diff = Date.now() - date.getTime();
    if (diff < 3600000) return `${Math.floor(diff / 60000)} min`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;
    return date.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
  };

  const formatFullTime = (date: Date) =>
    date.toLocaleString('es-ES', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  return (
    <div className="h-full overflow-y-auto bg-slate-50">
      <div className="p-6 space-y-6 max-w-6xl mx-auto">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Vigilancia</h2>
          <p className="text-sm text-slate-500 mt-0.5">Emails de pilotos y eventos de seguridad — Simulación</p>
        </div>

        {/* Section switcher */}
        <div className="flex gap-1 bg-slate-200/60 p-1 rounded-xl w-fit">
          <button
            onClick={() => setSection('emails')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${section === 'emails' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <span className="material-icons-round text-base">email</span>
            Emails Pilotos
            {unread > 0 && <span className="bg-red-500 text-white text-[10px] w-4 h-4 rounded-full flex items-center justify-center font-bold">{unread}</span>}
          </button>
          <button
            onClick={() => setSection('eventos')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${section === 'eventos' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <span className="material-icons-round text-base">event_note</span>
            Eventos Detectados
            {activeEvents > 0 && <span className="bg-orange-500 text-white text-[10px] w-4 h-4 rounded-full flex items-center justify-center font-bold">{activeEvents}</span>}
          </button>
        </div>

        {/* EMAILS */}
        {section === 'emails' && (
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4" style={{ minHeight: '500px' }}>
            {/* List */}
            <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
              <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                <h3 className="font-bold text-slate-800 text-sm">Bandeja — Pilotos</h3>
                <span className="text-xs text-slate-400">{emails.length} mensajes</span>
              </div>
              <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
                {emails.map(email => {
                  const es = EMAIL_STYLES[email.type];
                  return (
                    <button
                      key={email.id}
                      onClick={() => openEmail(email)}
                      className={`w-full text-left flex gap-3 p-4 hover:bg-slate-50 transition-colors ${selected?.id === email.id ? 'bg-primary/5 border-l-2 border-primary' : ''}`}
                    >
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${es.bg} ${es.color}`}>
                        <span className="material-icons-round text-sm">{es.icon}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          {!email.read && <span className="w-2 h-2 bg-blue-500 rounded-full shrink-0" />}
                          <p className={`text-sm truncate ${!email.read ? 'font-bold text-slate-900' : 'font-medium text-slate-600'}`}>
                            {email.subject}
                          </p>
                        </div>
                        <p className="text-xs text-slate-500 truncate">{email.fromName}</p>
                        <p className="text-xs text-slate-400">{formatTime(email.timestamp)}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Detail */}
            <div className="lg:col-span-3 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              {selected ? (
                <div className="p-6 h-full flex flex-col">
                  {/* Type badge */}
                  <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold mb-4 w-fit ${EMAIL_STYLES[selected.type].bg} ${EMAIL_STYLES[selected.type].color}`}>
                    <span className="material-icons-round text-sm">{EMAIL_STYLES[selected.type].icon}</span>
                    {EMAIL_STYLES[selected.type].label}
                  </div>
                  <h3 className="font-bold text-slate-900 text-lg mb-2 leading-snug">{selected.subject}</h3>
                  <div className="flex items-center gap-3 mb-5 pb-4 border-b border-slate-100">
                    <div className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center">
                      <span className="material-icons-round text-slate-500 text-sm">person</span>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-700">{selected.fromName}</p>
                      <p className="text-xs text-slate-400">{selected.from} · {formatFullTime(selected.timestamp)}</p>
                    </div>
                  </div>
                  <div className="bg-slate-50 rounded-xl p-4 text-sm text-slate-700 leading-relaxed flex-1">
                    {selected.body}
                  </div>
                  {selected.attachments && selected.attachments.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-slate-100">
                      <p className="text-xs font-semibold text-slate-500 mb-2">Adjuntos ({selected.attachments.length})</p>
                      <div className="flex flex-wrap gap-2">
                        {selected.attachments.map(att => (
                          <div key={att} className="flex items-center gap-2 bg-slate-100 px-3 py-1.5 rounded-lg text-xs text-slate-600">
                            <span className="material-icons-round text-sm">{att.endsWith('.jpg') ? 'image' : 'description'}</span>
                            {att}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="h-full flex items-center justify-center">
                  <div className="text-center text-slate-300">
                    <span className="material-icons-round text-6xl">mark_email_read</span>
                    <p className="text-sm mt-3 text-slate-400">Selecciona un email para leerlo</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* EVENTOS */}
        {section === 'eventos' && (
          <div className="space-y-4">
            {/* Quick stats */}
            <div className="grid grid-cols-4 gap-3">
              {[
                { label: 'Total eventos (30d)', value: SURVEILLANCE_EVENTS.length,                                      icon: 'event_note',    color: 'text-blue-600 bg-blue-50' },
                { label: 'Activos',             value: SURVEILLANCE_EVENTS.filter(e => e.status === 'activo').length,   icon: 'warning',       color: 'text-red-600 bg-red-50' },
                { label: 'Intrusiones',         value: SURVEILLANCE_EVENTS.filter(e => e.type === 'persona').length,    icon: 'person_off',    color: 'text-orange-600 bg-orange-50' },
                { label: 'Vehículos',           value: SURVEILLANCE_EVENTS.filter(e => e.type === 'vehiculo').length,   icon: 'directions_car',color: 'text-slate-500 bg-slate-100' },
              ].map(s => (
                <div key={s.label} className="bg-white rounded-2xl border border-slate-200 p-4 flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${s.color}`}>
                    <span className="material-icons-round">{s.icon}</span>
                  </div>
                  <div>
                    <p className="text-2xl font-black text-slate-800">{s.value}</p>
                    <p className="text-[10px] text-slate-500 leading-tight">{s.label}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Events list */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                <h3 className="font-bold text-slate-800">Log de Eventos</h3>
                <span className="text-xs text-slate-400">Últimos 30 días</span>
              </div>
              <div className="divide-y divide-slate-100">
                {SURVEILLANCE_EVENTS.map(evt => (
                  <div key={evt.id} className="flex items-center gap-4 p-4">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${EVENT_COLORS[evt.type]}`}>
                      <span className="material-icons-round text-sm">{EVENT_ICONS[evt.type]}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-800">{evt.description}</p>
                      <p className="text-xs text-slate-500">{evt.location}</p>
                      <p className="text-xs text-slate-400">{formatFullTime(evt.timestamp)} · por {evt.reportedBy}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`text-[10px] font-black px-2 py-1 rounded-full ${SEV_COLORS[evt.severity]}`}>
                        {evt.severity.toUpperCase()}
                      </span>
                      <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${evt.status === 'activo' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                        {evt.status === 'activo' ? 'ACTIVO' : 'RESUELTO'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
