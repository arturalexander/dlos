'use client';

import { useState, useCallback, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useAuth } from '@/lib/auth-context';
import FuegoTab from '@/components/blasson/FuegoTab';
import VigilanciaTab from '@/components/blasson/VigilanciaTab';
import AlarmasTab from '@/components/blasson/AlarmasTab';
import AccesosTab from '@/components/blasson/AccesosTab';
import InformesTab from '@/components/blasson/InformesTab';
import ResumenTab from '@/components/blasson/ResumenTab';

// Dynamic import para evitar SSR en el mapa (usa window/document)
const MapaTab = dynamic(() => import('@/components/blasson/MapaTab'), { ssr: false });

// UID con acceso al dashboard completo de Blasson
const BLASSON_ADVANCED_UID = 'E6baCtzpLoc4x8Xk9cmP9zPsHnC3';

type TabId = 'resumen' | 'mapa' | 'fuego' | 'vigilancia' | 'alarmas' | 'accesos' | 'informes';

const TABS: { id: TabId; icon: string; label: string }[] = [
  { id: 'resumen',    icon: 'home',                  label: 'Inicio'     },
  { id: 'mapa',       icon: 'map',                   label: 'Mapa'       },
  { id: 'fuego',      icon: 'local_fire_department',  label: 'Fuego'      },
  { id: 'vigilancia', icon: 'visibility',             label: 'Vigilancia' },
  { id: 'alarmas',    icon: 'notifications_active',   label: 'Alarmas'    },
  { id: 'accesos',    icon: 'lock',                   label: 'Accesos'    },
  { id: 'informes',   icon: 'summarize',              label: 'Informes'   },
];

// ── Dashboard completo (solo UID avanzado) ────────────────────────────────────

function BlasSonDashboard() {
  const [activeTab, setActiveTab] = useState<TabId>('resumen');
  const [alarmCount, setAlarmCount] = useState(2);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const handleAlarmUpdate = useCallback((count: number) => {
    setAlarmCount(count);
  }, []);

  const handleAcknowledge = useCallback(() => {
    setAlarmCount(0);
  }, []);

  const timeStr = now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  const dateStr = now.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });

  return (
    <div className="flex flex-col" style={{ height: '100%', minHeight: 0 }}>

      {/* ── Blasson header bar ── */}
      <div className="bg-slate-900 px-3 sm:px-5 py-2 flex items-center justify-between shrink-0 gap-3">
        {/* Logo */}
        <div className="flex items-center gap-2.5 shrink-0">
          <div className="flex items-center" style={{ letterSpacing: '0.18em' }}>
            {['B','L','A','S','S','O','N'].map((letter, i) => (
              <span key={i} className="relative inline-flex" style={{ marginRight: i < 6 ? '2px' : 0 }}>
                <span style={{ fontSize: '16px', fontWeight: 900, color: 'white', lineHeight: 1, fontFamily: 'system-ui' }}>
                  {letter}
                </span>
                {i < 6 && (
                  <span style={{
                    position: 'absolute', right: '-2px', top: 0, bottom: 0,
                    width: '1.5px',
                    background: i % 2 === 0 ? '#dc2626' : 'rgba(255,255,255,0.2)',
                  }} />
                )}
              </span>
            ))}
          </div>
          <span className="hidden sm:block" style={{ fontSize: '8px', color: '#475569', letterSpacing: '0.22em', fontFamily: 'system-ui' }}>
            PROPERTY INVESTMENTS
          </span>
        </div>

        {/* Center: date/time */}
        <div className="hidden md:flex items-center gap-1 text-slate-500 text-xs">
          <span className="material-icons-round text-sm">schedule</span>
          <span className="font-mono">{timeStr}</span>
          <span className="text-slate-700 mx-1">·</span>
          <span className="capitalize">{dateStr}</span>
        </div>

        {/* Right: alarm status */}
        <div className="flex items-center gap-2 shrink-0">
          {alarmCount > 0 ? (
            <button
              onClick={() => setActiveTab('alarmas')}
              className="flex items-center gap-1.5 bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 text-red-400 px-2.5 py-1.5 rounded-lg transition-colors ring-pulse"
            >
              <span className="material-icons-round text-sm animate-pulse">notifications_active</span>
              <span className="text-xs font-black">{alarmCount}</span>
              <span className="text-xs font-bold hidden sm:inline">alarma{alarmCount !== 1 ? 's' : ''}</span>
            </button>
          ) : (
            <div className="flex items-center gap-1.5 text-emerald-500/70 text-xs">
              <span className="w-2 h-2 bg-emerald-500 rounded-full" />
              <span className="hidden sm:inline">Sistema normal</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Tab navigation — horizontally scrollable on mobile ── */}
      <div className="bg-white border-b border-slate-200 shrink-0 overflow-x-auto hide-scrollbar">
        <div className="flex min-w-max">
          {TABS.map(tab => {
            const isActive = activeTab === tab.id;
            const hasBadge = tab.id === 'alarmas' && alarmCount > 0;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`relative flex items-center gap-2 px-4 sm:px-5 py-3 text-xs font-bold whitespace-nowrap border-b-2 transition-all ${
                  isActive
                    ? 'border-primary text-primary bg-primary/5'
                    : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                }`}
              >
                <span className={`material-icons-round text-lg ${isActive ? 'text-primary' : ''}`}>{tab.icon}</span>
                <span>{tab.label}</span>
                {hasBadge && (
                  <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-[9px] font-black rounded-full flex items-center justify-center ring-pulse">
                    {alarmCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Tab content ── */}
      <div className="flex-1 overflow-hidden min-h-0">
        {/* Resumen: siempre montado para no perder estado (weather, AI) */}
        <div className={activeTab === 'resumen' ? 'h-full' : 'hidden'}>
          <ResumenTab />
        </div>

        {/* Mapa: se mantiene montado para no recargar tiles */}
        <div className={activeTab === 'mapa' ? 'h-full' : 'hidden'}>
          <MapaTab />
        </div>

        {activeTab === 'fuego'      && <FuegoTab onAlarm={handleAlarmUpdate} />}
        {activeTab === 'vigilancia' && <VigilanciaTab />}
        {activeTab === 'alarmas'    && <AlarmasTab alarmCount={alarmCount} onAcknowledge={handleAcknowledge} />}
        {activeTab === 'accesos'    && <AccesosTab />}
        {activeTab === 'informes'   && <InformesTab />}
      </div>
    </div>
  );
}

// ── Página principal ───────────────────────────────────────────────────────────

export default function MapaPage() {
  const { user, loading } = useAuth();

  // Mientras carga auth, mostrar spinner
  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center h-full">
        <div className="w-8 h-8 border-3 border-slate-200 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  // Usuario avanzado: dashboard completo con tabs
  if (user?.uid === BLASSON_ADVANCED_UID) {
    return <BlasSonDashboard />;
  }

  // Cualquier otro usuario con acceso a /mapa: solo el mapa, sin tabs
  return (
    <div className="flex-1 h-full min-h-0">
      <MapaTab />
    </div>
  );
}
