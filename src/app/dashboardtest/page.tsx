'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import AgentesTab from '@/components/dashboardtest/AgentesTab';

// ConexionesTab contains Leaflet — must be client-only
const ConexionesTab = dynamic(() => import('@/components/dashboardtest/ConexionesTab'), { ssr: false });

type Tab = 'conexiones' | 'agentes';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'conexiones', label: 'Conexiones',  icon: 'lan'       },
  { id: 'agentes',    label: 'Agentes IA',  icon: 'smart_toy' },
];

const C = {
  bg:     '#0a0e17',
  card:   '#111827',
  border: '#1e293b',
  text:   '#e2e8f0',
  dim:    '#64748b',
  accent: '#0073E6',
  green:  '#10b981',
  font:   "'DM Sans', system-ui, sans-serif",
};

export default function DashboardTestPage() {
  const [tab, setTab] = useState<Tab>('conexiones');

  return (
    <div style={{ background: C.bg, minHeight: '100%', fontFamily: C.font }}>

      {/* ── Header ── */}
      <div style={{ background: C.card, borderBottom: `1px solid ${C.border}`, padding: '14px 28px', display: 'flex', alignItems: 'center', gap: 16, position: 'sticky', top: 0, zIndex: 50 }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: C.text }}>
          dlos.<span style={{ color: C.accent }}>ai</span>
        </div>
        <div style={{ width: 1, height: 22, background: C.border }} />
        <div style={{ fontSize: 13, color: C.dim }}>Dashboard Test · Dehesa Espadañal · 2.000 ha</div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, padding: '5px 14px', borderRadius: 20, background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.25)', fontSize: 12, fontWeight: 600, color: C.green }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: C.green, display: 'inline-block' }} />
          Sistema operativo
        </div>
      </div>

      {/* ── Tabs ── */}
      <div style={{ background: C.card, borderBottom: `1px solid ${C.border}`, padding: '0 28px', display: 'flex', gap: 0 }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: '13px 22px', fontSize: 13, fontWeight: 500, border: 'none',
            cursor: 'pointer', background: 'transparent', fontFamily: C.font,
            color: tab === t.id ? C.accent : C.dim,
            borderBottom: `2px solid ${tab === t.id ? C.accent : 'transparent'}`,
            display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.2s',
          }}>
            <span className="material-icons-round" style={{ fontSize: 16 }}>{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Content ── */}
      <div style={{ padding: '24px 28px 48px' }}>
        {tab === 'conexiones' && <ConexionesTab />}
        {tab === 'agentes'    && <AgentesTab />}
      </div>
    </div>
  );
}
