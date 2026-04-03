import type { ReactNode } from 'react';

interface Props {
  children: ReactNode;
  title: ReactNode;
  subtitle: string;
  antoniaDesktop?: ReactNode; // bottom-left desktop
  antoniaMobile?: ReactNode;  // top-right mobile
}

export default function AuthLayout({ children, title, subtitle, antoniaDesktop, antoniaMobile }: Props) {
  return (
    <main className="relative min-h-screen w-full bg-slate-800 overflow-x-hidden">

      {/* ── Fondo ── */}
      <img
        src="/assets/imagen_web.jpg"
        alt="Finca"
        loading="eager"
        fetchPriority="high"
        className="absolute inset-0 h-full w-full object-cover"
      />
      <div className="absolute inset-0" style={{ background: 'rgba(255,255,255,0.35)' }} />

      {/* ── Layout raíz ── */}
      <div className="relative z-10 min-h-screen flex flex-col lg:flex-row">

        {/* ── Columna izquierda ── */}
        <div className="flex-1 min-w-0 flex flex-col px-6 pt-5 pb-6 sm:px-10 lg:pl-14 lg:pr-10">

          {/* Logo + Antonia móvil (top-right) */}
          <nav className="flex items-center justify-between gap-2 py-3 shrink-0">
            <div className="flex items-center gap-2.5">
              <img src="/logo-icon.svg" alt="dlos.ai" className="h-9 w-9" />
              <span className="text-xl font-bold text-slate-900 tracking-tight">
                dlos<span className="text-primary">.ai</span>
              </span>
            </div>
            {/* Antonia compacta arriba derecha — solo móvil */}
            {antoniaMobile && (
              <div className="lg:hidden shrink-0">
                {antoniaMobile}
              </div>
            )}
          </nav>

          {/* Titular */}
          <div className="flex lg:flex-1 items-center py-3 lg:py-0">
            <div className="max-w-xl">
              <h1 className="text-3xl sm:text-4xl lg:text-[3.4rem] font-bold leading-tight tracking-tight text-slate-900">
                {title}
              </h1>
              <p className="mt-2 max-w-md text-sm lg:text-base text-slate-700/80 leading-relaxed">
                {subtitle}
              </p>
            </div>
          </div>

          {/* Formulario móvil */}
          <div className="lg:hidden mt-4 mb-3">
            <div
              className="glass-panel w-full max-w-sm mx-auto p-6"
              style={{ borderRadius: 20 }}
            >
              {children}
            </div>
          </div>

          {/* Antonia desktop — bottom-left */}
          {antoniaDesktop && (
            <div className="hidden lg:block shrink-0">
              {antoniaDesktop}
            </div>
          )}

        </div>

        {/* ── Panel derecho desktop ── */}
        <div
          className="hidden lg:flex flex-col items-stretch justify-center shrink-0 py-14 pr-8"
          style={{ width: 420 }}
        >
          <div
            style={{
              background: 'rgba(245,247,252,0.72)',
              backdropFilter: 'blur(28px)',
              WebkitBackdropFilter: 'blur(28px)',
              border: '1px solid rgba(210,220,235,0.6)',
              borderRadius: 24,
              boxShadow: '0 8px 40px -8px rgba(15,23,42,0.14)',
              paddingTop: 40,
              paddingBottom: 40,
              paddingLeft: 40,
              paddingRight: 40,
            }}
          >
            {children}
          </div>
        </div>

      </div>

    </main>
  );
}
