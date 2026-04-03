'use client';

import { useState, useRef, useEffect } from 'react';
import { useAuth } from '@/lib/auth-context';

interface MissionCard {
  id: string; name: string; status: string; date: string; time: string;
  totalCows: number; avgAltitude: string | null; thumbnails: string[];
  captures: { label: string; url: string }[];
  cows: { id: string; lat: number | null; lng: number | null; conf: string | null }[];
}

interface Message {
  role: 'user' | 'bot';
  text: string;
  ts: number;
  missionCard?: MissionCard | null;
}

const QUICK_PROMPTS = [
  { label: '¿Qué ha pasado hoy?',   msg: '¿Qué ha pasado hoy en la finca?'       },
  { label: 'Último vuelo',           msg: '¿Cuál fue el último vuelo?'             },
  { label: '¿Cómo está el tiempo?',  msg: '¿Cómo está el tiempo ahora?'           },
  { label: 'Total animales',         msg: '¿Cuántos animales en total?'            },
  { label: 'Esta semana',            msg: '¿Cuántos vuelos esta semana?'           },
  { label: 'Zonas del mapa',         msg: '¿Qué zonas tengo marcadas en el mapa?' },
];

// Frases que rotan en el globo de llamada
const TEASERS = [
  '¿Qué pasó en la finca hoy?',
  '¿Cuántos animales se han visto?',
  '¿Cómo está el tiempo ahora?',
  '¿Ha habido algo raro últimamente?',
  'Pregúntame lo que necesites.',
];

function renderMd(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) =>
    p.startsWith('**') && p.endsWith('**')
      ? <strong key={i}>{p.slice(2, -2)}</strong>
      : <span key={i}>{p}</span>
  );
}

function FarmerAvatar({ size = 24 }: { size?: number }) {
  return (
    <div
      className="rounded-full bg-amber-100 border border-amber-200 flex items-center justify-center shrink-0"
      style={{ width: size, height: size, fontSize: size * 0.6 }}
    >
      👩‍🌾
    </div>
  );
}

export default function ChatIA() {
  const { user }                  = useAuth();
  const [open, setOpen]           = useState(false);
  const [greeted, setGreeted]     = useState(false);
  const [messages, setMessages]   = useState<Message[]>([]);
  const [input, setInput]         = useState('');
  const [loading, setLoading]     = useState(false);
  const [teaser, setTeaser]       = useState<string | null>(null);
  const [teaserIdx, setTeaserIdx] = useState(0);
  const bottomRef                 = useRef<HTMLDivElement>(null);
  // ID de sesión único por apertura del componente (identifica una visita)
  const sessionId                 = useRef(`s_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);

  // Notifica al resto de la app cuando el chat se abre/cierra (p.ej. ocultar botones solapados)
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('chatia:toggle', { detail: { open } }));
  }, [open]);

  // Globo de llamada: aparece a los 3s, rota cada 6s, desaparece al abrir
  useEffect(() => {
    if (open) { setTeaser(null); return; }
    const show = setTimeout(() => {
      setTeaser(TEASERS[teaserIdx]);
    }, 3000);
    return () => clearTimeout(show);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, teaserIdx]);

  useEffect(() => {
    if (!teaser || open) return;
    const next = setTimeout(() => {
      setTeaser(null);
      setTimeout(() => setTeaserIdx(i => (i + 1) % TEASERS.length), 800);
    }, 5000);
    return () => clearTimeout(next);
  }, [teaser, open]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, open]);

  // Primer apertura → saludo automático
  useEffect(() => {
    if (open && !greeted) {
      setGreeted(true);
      sendInternal('__SALUDO__');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function sendInternal(msg: string) {
    if (loading) return;
    setLoading(true);
    try {
      const history = messages
        .slice(-10)
        .map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', text: m.text }));

      const res = await fetch('/api/chat/galisancho', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: msg,
          history,
          userId:    user?.uid    ?? null,
          userEmail: user?.email  ?? null,
          sessionId: sessionId.current,
        }),
      });
      const data = await res.json();
      setMessages(ms => [...ms, {
        role: 'bot',
        text: data.reply || 'Sin respuesta.',
        ts: Date.now(),
        missionCard: data.missionCard ?? null,
      }]);
    } catch {
      setMessages(ms => [...ms, { role: 'bot', text: 'Error de conexión. Inténtalo de nuevo.', ts: Date.now() }]);
    } finally {
      setLoading(false);
    }
  }

  async function send(msg: string) {
    if (!msg.trim() || loading) return;
    setMessages(ms => [...ms, { role: 'user', text: msg.trim(), ts: Date.now() }]);
    setInput('');
    await sendInternal(msg.trim());
  }

  return (
    <>
      {/* ── Botón flotante + globo ─────────────────────────────────────── */}
      <div className="fixed bottom-24 right-4 lg:bottom-8 lg:right-8 z-[60] flex flex-col items-end gap-2">

        {/* Globo de llamada */}
        {!open && teaser && (
          <div
            className="relative bg-white border border-slate-200 shadow-lg rounded-2xl rounded-br-sm px-4 py-2.5 max-w-[200px] animate-fade-in"
            style={{ animation: 'fadeInUp 0.3s ease' }}
          >
            <p className="text-xs font-semibold text-slate-700 leading-snug">{teaser}</p>
            {/* Flecha apuntando al botón */}
            <div className="absolute -bottom-2 right-5 w-3 h-3 bg-white border-r border-b border-slate-200 rotate-45" />
          </div>
        )}

        {/* Botón principal — solo visible cuando el chat está cerrado */}
        {!open && (
          <button
            onClick={() => setOpen(true)}
            className="group flex items-center gap-3 bg-amber-500 hover:bg-amber-600 text-white rounded-2xl shadow-xl transition-all hover:scale-105 active:scale-95 pl-2 pr-4 py-2"
            style={{ boxShadow: '0 4px 24px rgba(245,158,11,0.5)', animation: 'antoniaBounce 3s ease-in-out infinite' }}
          >
            {/* Avatar con anillo pulsante */}
            <div className="relative shrink-0">
              <span className="absolute inset-0 rounded-full bg-amber-300 opacity-50 animate-ping" style={{ animationDuration: '2.5s' }} />
              <img
                src="/assets/antonia-avatar.png"
                alt="Antonia"
                className="relative w-10 h-10 rounded-full object-cover border-2 border-white/50 shadow-sm"
                style={{ animation: 'antoniaWave 4s ease-in-out infinite' }}
                onError={e => { (e.target as HTMLImageElement).style.display='none'; }}
              />
            </div>
            <div className="text-left hidden sm:block">
              <p className="text-sm font-black leading-tight">Antonia</p>
              <p className="text-[10px] opacity-80 leading-tight">Pregunta a tu encargada</p>
            </div>
          </button>
        )}
      </div>

      {/* ── Panel chat ────────────────────────────────────────────────────── */}
      {open && (
        <div
          className="fixed bottom-[88px] right-4 lg:bottom-[80px] lg:right-8 z-[59] w-[calc(100vw-32px)] max-w-sm bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden"
          style={{ height: 'min(540px, calc(100vh - 140px))' }}
        >
          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-3 shrink-0" style={{ background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)' }}>
            <div className="relative shrink-0">
              <img
                src="/assets/antonia-avatar.png"
                alt="Antonia"
                className="w-10 h-10 rounded-full object-cover border-2 border-white/40 shadow-sm"
                onError={e => { (e.target as HTMLImageElement).src = ''; (e.target as HTMLImageElement).className = 'w-10 h-10 rounded-full bg-amber-100 border-2 border-white/40 flex items-center justify-center'; }}
              />
              {/* Dot online */}
              <span className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-400 border-2 border-white rounded-full" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-black text-white leading-tight">Antonia</p>
              <p className="text-[10px] text-white/70 leading-tight">Finca Galisancho · en línea</p>
            </div>
            <button onClick={() => setOpen(false)} className="text-white/70 hover:text-white transition-colors">
              <span className="material-icons-round text-lg">close</span>
            </button>
          </div>

          {/* Mensajes */}
          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3 hide-scrollbar">
            {/* Typing inicial */}
            {messages.length === 0 && loading && (
              <div className="flex justify-start items-end gap-2">
                <FarmerAvatar size={30} />
                <div className="bg-slate-50 border border-slate-100 rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-1.5">
                  {[0,1,2].map(i => (
                    <span key={i} className="w-2 h-2 bg-amber-400 rounded-full animate-bounce" style={{ animationDelay: `${i*150}ms` }} />
                  ))}
                </div>
              </div>
            )}

            {messages.map((m, i) => (
              <div key={i} className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'} gap-1`}>
                <div className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'} items-end gap-2 w-full`}>
                  {m.role === 'bot' && <FarmerAvatar size={30} />}
                  <div className={`max-w-[85%] px-3 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-line ${
                    m.role === 'user'
                      ? 'bg-amber-500 text-white rounded-br-sm'
                      : 'bg-slate-50 text-slate-800 border border-slate-100 rounded-bl-sm'
                  }`}>
                    {m.role === 'bot' ? renderMd(m.text) : m.text}
                  </div>
                </div>

                {/* Mission card */}
                {m.missionCard && (
                  <div className="ml-10 w-full max-w-[85%]">
                    <a
                      href={`/mision/${m.missionCard.id}`}
                      className="block bg-white border border-slate-200 rounded-xl p-3 hover:border-amber-300 hover:shadow-sm transition-all"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold text-slate-700 truncate">{m.missionCard.name}</span>
                        <span className="text-[10px] text-slate-400 shrink-0 ml-2">{m.missionCard.date}</span>
                      </div>
                      <div className="flex gap-3 text-xs text-slate-600">
                        <span>🐄 {m.missionCard.totalCows} animales</span>
                        {m.missionCard.avgAltitude && <span>✈️ {m.missionCard.avgAltitude}</span>}
                      </div>
                      {(m.missionCard.captures?.length > 0) && (
                        <div className="grid grid-cols-2 gap-1 mt-2">
                          {m.missionCard.captures.slice(0, 4).map((c, j) => (
                            <div key={j} className="relative rounded-lg overflow-hidden bg-slate-100">
                              <img src={c.url} className="w-full h-20 object-cover" alt={c.label} />
                              <div className="absolute bottom-0 left-0 right-0 bg-black/50 px-1.5 py-0.5">
                                <p className="text-[9px] text-white font-semibold capitalize truncate">{c.label}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      {(!m.missionCard.captures?.length && m.missionCard.thumbnails.length > 0) && (
                        <div className="flex gap-1 mt-2 overflow-hidden rounded-lg">
                          {m.missionCard.thumbnails.slice(0,3).map((url,j) => (
                            <img key={j} src={url} className="w-1/3 h-16 object-cover rounded" alt="" />
                          ))}
                        </div>
                      )}
                      <p className="text-[10px] text-amber-600 font-semibold mt-2">Ver detalle →</p>
                    </a>
                  </div>
                )}
              </div>
            ))}

            {loading && messages.length > 0 && (
              <div className="flex justify-start items-end gap-2">
                <FarmerAvatar size={30} />
                <div className="bg-slate-50 border border-slate-100 rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-1.5">
                  {[0,1,2].map(i => (
                    <span key={i} className="w-2 h-2 bg-amber-400 rounded-full animate-bounce" style={{ animationDelay: `${i*150}ms` }} />
                  ))}
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Quick prompts */}
          <div className="px-3 pt-2 pb-1 shrink-0 border-t border-slate-100">
            <div className="flex gap-1.5 overflow-x-auto hide-scrollbar pb-1">
              {QUICK_PROMPTS.map(p => (
                <button
                  key={p.label}
                  onClick={() => send(p.msg)}
                  disabled={loading}
                  className="shrink-0 px-2.5 py-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 text-[11px] font-semibold transition-colors disabled:opacity-50 whitespace-nowrap border border-amber-100"
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Input */}
          <div className="px-3 pb-3 pt-1 shrink-0">
            <form onSubmit={e => { e.preventDefault(); send(input); }} className="flex gap-2">
              <input
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder="Escribe tu pregunta..."
                disabled={loading}
                className="flex-1 text-sm bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-amber-300 focus:border-amber-400 placeholder-slate-400 disabled:opacity-60"
              />
              <button
                type="submit"
                disabled={!input.trim() || loading}
                className="w-10 h-10 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-40 flex items-center justify-center text-white transition-colors shrink-0"
              >
                <span className="material-icons-round text-lg">send</span>
              </button>
            </form>
          </div>
        </div>
      )}

      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in { animation: fadeInUp 0.3s ease; }
        @keyframes antoniaBounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-5px); }
        }
        @keyframes antoniaWave {
          0%, 100% { transform: rotate(0deg); }
          15% { transform: rotate(8deg); }
          30% { transform: rotate(-5deg); }
          45% { transform: rotate(8deg); }
          60% { transform: rotate(-3deg); }
          75% { transform: rotate(0deg); }
        }
      `}</style>
    </>
  );
}
