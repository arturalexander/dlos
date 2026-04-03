'use client';

import { useState, useEffect } from 'react';

interface Props {
  messages: string[];
  compact?: boolean; // móvil top-right
}

export default function AntoniaWidget({ messages, compact = false }: Props) {
  const [idx, setIdx]         = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;
    const id = setInterval(() => {
      setVisible(false);
      timeout = setTimeout(() => {
        setIdx(i => (i + 1) % messages.length);
        setVisible(true);
      }, 350);
    }, 4000);
    return () => { clearInterval(id); clearTimeout(timeout); };
  }, [messages.length]);

  /* ── MODO COMPACT: móvil top-right ── */
  if (compact) {
    return (
      <div className="flex flex-col items-end gap-1">
        {/* Burbuja encima del avatar */}
        <div
          style={{
            opacity: visible ? 1 : 0,
            transform: visible ? 'translateY(0) scale(1)' : 'translateY(6px) scale(0.97)',
            transition: 'opacity 0.35s ease, transform 0.35s ease',
          }}
        >
          <div style={{
            background: 'rgba(255,255,255,0.97)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            borderRadius: '12px 12px 4px 12px',
            boxShadow: '0 4px 20px rgba(0,123,255,0.18)',
            border: '1px solid rgba(0,123,255,0.18)',
            padding: '7px 11px',
            maxWidth: 180,
            position: 'relative',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
              <div className="antonia-pulse-dot" style={{ width: 5, height: 5, borderRadius: '50%', background: '#007BFF' }} />
              <span style={{ fontSize: 8, fontWeight: 700, color: '#007BFF', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                Antonia IA
              </span>
            </div>
            <p style={{ fontSize: 11, color: '#1e293b', lineHeight: 1.4, margin: 0 }}>
              {messages[idx]}
            </p>
          </div>
        </div>

        {/* Avatar + tagline horizontal */}
        <div className="flex items-end gap-1.5">
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <div className="antonia-pulse-dot" style={{ width: 6, height: 6, borderRadius: '50%', background: '#007BFF', animationDelay: '0.5s' }} />
              <p style={{ fontSize: 11, fontWeight: 600, color: '#1e293b', lineHeight: 1.3, margin: 0 }}>
                Hola soy Antonia,<br />la encargada de tu finca IA
              </p>
            </div>
          </div>
          <div className="antonia-sway shrink-0">
            <img
              src="/assets/antonia-avatar.png"
              alt="Antonia"
              style={{ height: 140, width: 'auto', objectFit: 'contain' }}
              className="drop-shadow-lg"
            />
          </div>
        </div>
      </div>
    );
  }

  /* ── MODO NORMAL: desktop bottom-left ── */
  return (
    <div className="flex items-end gap-3 pt-1">
      <div className="flex flex-col items-start shrink-0">
        {/* Burbuja */}
        <div
          className="ml-4 mb-1"
          style={{
            opacity: visible ? 1 : 0,
            transform: visible ? 'translateY(0) scale(1)' : 'translateY(6px) scale(0.97)',
            transition: 'opacity 0.4s cubic-bezier(.4,0,.2,1), transform 0.4s cubic-bezier(.4,0,.2,1)',
          }}
        >
          <div style={{
            background: 'rgba(255,255,255,0.97)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            borderRadius: '14px 14px 14px 4px',
            boxShadow: '0 4px 24px rgba(0,123,255,0.18), 0 1.5px 6px rgba(0,0,0,0.10)',
            border: '1px solid rgba(0,123,255,0.18)',
            padding: '8px 13px',
            maxWidth: 220,
            position: 'relative',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 3 }}>
              <div className="antonia-pulse-dot" style={{ width: 5, height: 5, borderRadius: '50%', background: '#007BFF' }} />
              <span style={{ fontSize: 9, fontWeight: 700, color: '#007BFF', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                Antonia IA
              </span>
            </div>
            <p style={{ fontSize: 12.5, color: '#1e293b', lineHeight: 1.4, margin: 0 }}>
              {messages[idx]}
            </p>
            {/* Cola */}
            <div style={{
              position: 'absolute', bottom: -6, left: 12,
              width: 12, height: 12,
              background: 'rgba(255,255,255,0.97)',
              border: '1px solid rgba(0,123,255,0.18)',
              borderTop: 'none', borderLeft: 'none',
              transform: 'rotate(45deg)',
              borderRadius: '0 0 3px 0',
            }} />
          </div>
        </div>

        {/* Avatar */}
        <div className="antonia-sway">
          <img
            src="/assets/antonia-avatar.png"
            alt="Antonia"
            className="h-24 lg:h-28 w-auto object-contain drop-shadow-xl"
          />
        </div>

        {/* Tagline */}
        <div className="mt-1 ml-1">
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div className="antonia-pulse-dot" style={{ width: 7, height: 7, borderRadius: '50%', background: '#007BFF', animationDelay: '0.5s' }} />
            <p className="text-sm font-semibold text-slate-900 leading-snug">
              Hola soy Antonia,<br />la encargada de tu finca IA
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
