'use client';

import { useState, useEffect, useMemo } from 'react';
import { collection, query, orderBy, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import Link from 'next/link';
import { formatDate, formatDuration } from '@/lib/utils';

interface Job {
  id: string;
  missionName: string;
  siteName: string;
  status: string;
  totalCows?: number;
  totalPersons?: number;
  totalVehicles?: number;
  processingTimeSeconds?: number;
  createdAt: any;
  completedAt?: any;
  vastGpu?: string;
  analysisStatus?: string;
}


function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'completed':
      return (
        <span className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />Completado
        </span>
      );
    case 'processing':
      return (
        <span className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-blue-50 text-blue-700 border border-blue-200 text-[10px] font-bold animate-pulse">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />Procesando
        </span>
      );
    case 'failed':
      return (
        <span className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-red-50 text-red-700 border border-red-200 text-[10px] font-bold">
          <span className="w-1.5 h-1.5 rounded-full bg-red-500" />Error
        </span>
      );
    case 'queued':
      return (
        <span className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-yellow-50 text-yellow-700 border border-yellow-200 text-[10px] font-bold">
          <span className="w-1.5 h-1.5 rounded-full bg-yellow-400" />En cola
        </span>
      );
    case 'starting':
      return (
        <span className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-purple-50 text-purple-700 border border-purple-200 text-[10px] font-bold animate-pulse">
          <span className="w-1.5 h-1.5 rounded-full bg-purple-500" />Iniciando
        </span>
      );
    default:
      return (
        <span className="px-2 py-0.5 rounded-lg bg-slate-100 text-slate-600 text-[10px] font-bold">{status}</span>
      );
  }
}

export default function GalisanchoMisionesPage() {
  const [jobs, setJobs]       = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter]   = useState<'all' | 'completed' | 'processing' | 'failed'>('all');
  const [search, setSearch]   = useState('');

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const q = query(collection(db, 'processing_jobs'), orderBy('createdAt', 'desc'));
      const snap = await getDocs(q);
      const list: Job[] = [];
      snap.forEach(doc => {
        const d = doc.data();
        list.push({
          id: doc.id,
          missionName: d.missionName || 'Sin nombre',
          siteName: d.siteName || 'Sin sitio',
          status: d.status || 'unknown',
          totalCows: d.results?.totalCows,
          totalPersons: d.results?.totalPersons,
          totalVehicles: d.results?.totalVehicles,
          processingTimeSeconds: d.processingTimeSeconds,
          createdAt: d.createdAt,
          completedAt: d.completedAt,
          vastGpu: d.vastGpu,
          analysisStatus: d.analysisStatus,
        });
      });
      setJobs(list);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  const searchLower = search.toLowerCase();
  const filtered = useMemo(() => jobs.filter(j => {
    const matchFilter = filter === 'all' || j.status === filter;
    const matchSearch = !searchLower ||
      j.missionName.toLowerCase().includes(searchLower) ||
      j.siteName.toLowerCase().includes(searchLower);
    return matchFilter && matchSearch;
  }), [jobs, filter, searchLower]);

  const stats = useMemo(() => ({
    total:     jobs.length,
    completed: jobs.filter(j => j.status === 'completed').length,
    running:   jobs.filter(j => ['processing', 'starting', 'queued'].includes(j.status)).length,
    cows:      jobs.reduce((a, j) => a + (j.totalCows || 0), 0),
    totalTime: jobs.reduce((a, j) => a + (j.processingTimeSeconds || 0), 0),
  }), [jobs]);

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50 pb-24 lg:pb-8">

      {/* ── Header ── */}
      <div className="bg-white border-b border-slate-200 px-4 sm:px-6 py-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-black text-slate-900">Misiones</h1>
            <p className="text-sm text-slate-500">Finca Galisancho · Historial de vuelos procesados</p>
          </div>
          <div className="flex items-center gap-3">
            {stats.running > 0 && (
              <div className="flex items-center gap-1.5 bg-blue-50 border border-blue-200 px-3 py-1.5 rounded-xl">
                <span className="material-icons-round text-blue-500 text-sm animate-spin" style={{ animationDuration: '2s' }}>sync</span>
                <span className="text-sm font-semibold text-blue-700">{stats.running} procesando</span>
              </div>
            )}
            <button
              onClick={load}
              className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 text-sm font-semibold transition-colors"
            >
              <span className="material-icons-round text-base">refresh</span>
              <span className="hidden sm:inline">Actualizar</span>
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-6">

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { icon: 'flight_takeoff', bg: 'bg-primary/10',  color: 'text-primary',     label: 'Misiones totales',    value: loading ? null : stats.total                          },
            { icon: 'check_circle',   bg: 'bg-emerald-50',  color: 'text-emerald-600', label: 'Completadas',         value: loading ? null : stats.completed                      },
            { icon: 'category',       bg: 'bg-emerald-50',  color: 'text-emerald-600', label: 'Objetos detectados',  value: loading ? null : stats.cows                           },
            { icon: 'timer',          bg: 'bg-purple-50',   color: 'text-purple-600',  label: 'Tiempo total',        value: loading ? null : `${(stats.totalTime / 60).toFixed(0)} min` },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
              <div className={`w-9 h-9 ${s.bg} rounded-xl flex items-center justify-center mb-3`}>
                <span className={`material-icons-round text-lg ${s.color}`}>{s.icon}</span>
              </div>
              {s.value === null
                ? <div className="h-7 w-12 bg-slate-100 rounded-lg skeleton mb-1" />
                : <p className="text-2xl font-black text-slate-900">{s.value}</p>
              }
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wide mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Search + filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <span className="material-icons-round absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg pointer-events-none">search</span>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar por nombre o sitio..."
              className="w-full pl-10 pr-4 py-2.5 text-sm bg-white border border-slate-200 rounded-xl text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40 transition"
            />
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {([
              ['all',        'Todas',      'grid_view'    ],
              ['completed',  'Completadas','check_circle' ],
              ['processing', 'En proceso', 'sync'         ],
              ['failed',     'Fallidas',   'error_outline'],
            ] as const).map(([id, label, icon]) => (
              <button
                key={id}
                onClick={() => setFilter(id)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all ${
                  filter === id
                    ? 'bg-primary text-white shadow-sm shadow-primary/30'
                    : 'bg-white border border-slate-200 text-slate-500 hover:bg-slate-50'
                }`}
              >
                <span className="material-icons-round" style={{ fontSize: 14 }}>{icon}</span>
                <span className="hidden sm:inline">{label}</span>
                {id !== 'all' && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-md ${
                    filter === id ? 'bg-white/20' : 'bg-slate-100'
                  }`}>
                    {id === 'completed' ? stats.completed : id === 'processing' ? stats.running : jobs.filter(j => j.status === 'failed').length}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Loading skeletons */}
        {loading && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-5 py-4 border-b border-slate-50 last:border-0">
                <div className="w-10 h-10 rounded-xl skeleton shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-3.5 w-2/3 skeleton rounded-lg" />
                  <div className="h-3 w-1/2 skeleton rounded-lg" />
                </div>
                <div className="hidden sm:flex gap-4">
                  <div className="w-10 h-8 skeleton rounded-lg" />
                  <div className="w-14 h-8 skeleton rounded-lg" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Empty */}
        {!loading && filtered.length === 0 && (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
            <span className="material-icons-round text-5xl text-slate-200 mb-3">inbox</span>
            <p className="font-bold text-slate-500">
              {jobs.length === 0 ? 'Sin misiones todavía' : 'No hay misiones con este filtro'}
            </p>
            <p className="text-sm text-slate-400 mt-1">
              {jobs.length === 0 ? 'Las misiones aparecerán cuando FlightHub2 procese vuelos' : 'Prueba a cambiar los filtros'}
            </p>
          </div>
        )}

        {/* Jobs list */}
        {!loading && filtered.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <h2 className="font-bold text-slate-900">Historial de vuelos</h2>
              <span className="text-xs text-slate-400">{filtered.length} registros</span>
            </div>

            <div className="px-5 py-3 space-y-0">
              {filtered.map((j, idx) => {
                const isOk   = j.status === 'completed';
                const isRun  = ['processing', 'starting'].includes(j.status);
                const isFail = j.status === 'failed';
                const name   = j.missionName.replace('dlos_', '');

                // ── Cabecera de fecha ──────────────────────────────────
                const getDay = (ts: any) => {
                  if (!ts) return '';
                  const d = ts.toDate ? ts.toDate() : new Date(ts);
                  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }).toUpperCase();
                };
                const dayKey  = getDay(j.createdAt);
                const prevKey = idx > 0 ? getDay(filtered[idx - 1].createdAt) : '';
                const showDateHeader = dayKey && dayKey !== prevKey;

                return (
                  <div key={j.id}>
                    {showDateHeader && (
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest pt-4 pb-2 first:pt-2">
                        {dayKey}
                      </p>
                    )}
                    <Link
                      href={`/mision/${j.id}`}
                      className="flex items-center gap-4 px-4 py-3.5 rounded-xl border border-slate-100 mb-2 hover:border-primary/30 hover:bg-primary/[0.02] transition-all group"
                    >
                      {/* Icon */}
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-all ${
                        isFail ? 'bg-red-50 text-red-400' : 'bg-primary/10 text-primary group-hover:bg-primary group-hover:text-white'
                      }`}>
                        <span className={`material-icons-round text-lg ${isRun ? 'animate-spin' : ''}`} style={isRun ? { animationDuration: '2s' } : {}}>
                          {isRun ? 'sync' : isFail ? 'error_outline' : 'flight_takeoff'}
                        </span>
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                          <span className="font-bold text-sm text-slate-900 group-hover:text-primary transition-colors truncate">{name}</span>
                          <StatusBadge status={j.status} />
                          {j.analysisStatus === 'completed' && (
                            <span className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-primary/10 text-primary text-[10px] font-bold">
                              <span className="material-icons-round" style={{ fontSize: 11 }}>smart_toy</span>IA
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 flex-wrap">
                          <span className="flex items-center gap-1 text-xs text-slate-400">
                            <span className="material-icons-round" style={{ fontSize: 12 }}>location_on</span>
                            {j.siteName}
                          </span>
                          {j.createdAt && (
                            <span className="flex items-center gap-1 text-xs text-slate-400">
                              <span className="material-icons-round" style={{ fontSize: 12 }}>schedule</span>
                              {formatDate(j.createdAt)}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Metrics desktop */}
                      {isOk && (
                        <div className="hidden sm:flex items-center gap-5 shrink-0 text-center">
                          <div>
                            <p className="text-base font-black text-emerald-600">{j.totalCows ?? 0}</p>
                            <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wide">Animales</p>
                          </div>
                          <div>
                            <p className="text-base font-black text-blue-500">{j.totalPersons ?? 0}</p>
                            <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wide">Personas</p>
                          </div>
                          <div>
                            <p className="text-base font-black text-orange-500">{j.totalVehicles ?? 0}</p>
                            <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wide">Vehículos</p>
                          </div>
                          <div>
                            <p className="text-sm font-bold text-slate-500">{formatDuration(j.processingTimeSeconds)}</p>
                            <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wide">Duración</p>
                          </div>
                        </div>
                      )}

                      {/* Metrics mobile */}
                      {isOk && (
                        <div className="sm:hidden text-right shrink-0 space-y-0.5">
                          <p className="text-sm font-black text-emerald-600">{j.totalCows ?? 0}<span className="text-[9px] text-slate-400 font-bold ml-1">anim</span></p>
                          <p className="text-sm font-black text-blue-500">{j.totalPersons ?? 0}<span className="text-[9px] text-slate-400 font-bold ml-1">pers</span></p>
                          <p className="text-sm font-black text-orange-500">{j.totalVehicles ?? 0}<span className="text-[9px] text-slate-400 font-bold ml-1">veh</span></p>
                        </div>
                      )}

                      <span className="material-icons-round text-slate-300 group-hover:text-primary transition-colors shrink-0">chevron_right</span>
                    </Link>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <p className="text-center text-xs text-slate-400 py-2">
          dlos.ai · Finca Galisancho · {stats.total} misiones totales
        </p>
      </div>
    </div>
  );
}
