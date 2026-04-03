'use client';

import { useState, useEffect, useMemo } from 'react';
import { collection, query, orderBy, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import Link from 'next/link';
import { formatDate, formatDuration } from '@/lib/utils';

// Mapa UUID → nombre legible (disponible en cliente vía NEXT_PUBLIC_UUID_NAMES)
let UUID_NAMES: Record<string, string> = {};
try {
    if (process.env.NEXT_PUBLIC_UUID_NAMES) {
        UUID_NAMES = JSON.parse(process.env.NEXT_PUBLIC_UUID_NAMES);
    }
} catch { /* ignorar JSON inválido */ }

function resolveName(value: string): string {
    if (!value) return value;
    // Si es un UUID (contiene guiones y es largo), intentar resolverlo
    const resolved = UUID_NAMES[value];
    if (resolved) return resolved;
    // Si contiene un UUID dentro (ej: path con UUIDs), sustituir cada UUID
    return value.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, (uuid) =>
        UUID_NAMES[uuid] || uuid.substring(0, 8) + '…'
    );
}

interface Mission {
    id: string;
    missionName: string;
    siteName: string;
    status: string;
    totalCows?: number;
    processingTimeSeconds?: number;
    createdAt: any;
    completedAt?: any;
    vastGpu?: string;
    vastPrice?: number;
    analysisStatus?: string;
}

export default function MisionesPage() {
    const [missions, setMissions] = useState<Mission[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [filter, setFilter] = useState<'all' | 'completed' | 'processing' | 'failed'>('all');

    useEffect(() => {
        loadMissions();
    }, []);

    const loadMissions = async () => {
        try {
            const jobsRef = collection(db, 'processing_jobs');
            const q = query(jobsRef, orderBy('createdAt', 'desc'));
            const snapshot = await getDocs(q);

            const missionsList: Mission[] = [];
            snapshot.forEach((doc) => {
                const data = doc.data();
                missionsList.push({
                    id: doc.id,
                    missionName: data.missionName || 'Sin nombre',
                    siteName: data.siteName || 'Sin sitio',
                    status: data.status || 'unknown',
                    totalCows: data.results?.totalCows,
                    processingTimeSeconds: data.processingTimeSeconds,
                    createdAt: data.createdAt,
                    completedAt: data.completedAt,
                    vastGpu: data.vastGpu,
                    vastPrice: data.vastPrice,
                    analysisStatus: data.analysisStatus,
                });
            });

            setMissions(missionsList);
        } catch (error) {
            console.error('Error loading missions:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const filteredMissions = useMemo(() =>
        missions.filter(m => filter === 'all' || m.status === filter),
    [missions, filter]);

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'completed':
                return (
                    <span className="px-2 py-1 text-xs font-bold rounded-full bg-emerald-100 text-emerald-700">
                        ✅ Completado
                    </span>
                );
            case 'processing':
                return (
                    <span className="px-2 py-1 text-xs font-bold rounded-full bg-blue-100 text-blue-700 animate-pulse">
                        ⏳ Procesando
                    </span>
                );
            case 'failed':
                return (
                    <span className="px-2 py-1 text-xs font-bold rounded-full bg-red-100 text-red-700">
                        ❌ Error
                    </span>
                );
            case 'queued':
                return (
                    <span className="px-2 py-1 text-xs font-bold rounded-full bg-yellow-100 text-yellow-700">
                        🕐 En cola
                    </span>
                );
            case 'starting':
                return (
                    <span className="px-2 py-1 text-xs font-bold rounded-full bg-purple-100 text-purple-700 animate-pulse">
                        🚀 Iniciando
                    </span>
                );
            default:
                return (
                    <span className="px-2 py-1 text-xs font-bold rounded-full bg-slate-100 text-slate-700">
                        {status}
                    </span>
                );
        }
    };


    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <div className="text-center">
                    <div className="w-10 h-10 border-2 border-slate-200 border-t-primary rounded-full animate-spin mx-auto" />
                    <p className="mt-4 text-slate-500">Cargando misiones...</p>
                </div>
            </div>
        );
    }

    return (
        <>
            {/* Header */}
            <header className="h-16 border-b border-slate-200 flex items-center justify-between px-4 lg:px-8 bg-white/50 backdrop-blur-md shrink-0 sticky top-0 z-40">
                <div>
                    <h2 className="text-xl font-bold">Misiones</h2>
                    <p className="text-xs text-slate-500">Historial de vuelos procesados</p>
                </div>
                <div className="flex items-center gap-4">
                    <span className="text-sm text-slate-500">
                        {missions.length} misiones totales
                    </span>
                    <button
                        onClick={loadMissions}
                        className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 px-3 py-2 rounded-lg transition-colors"
                    >
                        <span className="material-icons-round text-sm">refresh</span>
                        <span className="hidden md:inline text-sm">Actualizar</span>
                    </button>
                </div>
            </header>

            <div className="flex-1 overflow-y-auto p-4 lg:p-8 space-y-6 hide-scrollbar pb-24 lg:pb-8">
                {/* Filters */}
                <div className="flex gap-2 flex-wrap">
                    {([
                        ['all',        'Todas'      ],
                        ['completed',  'Completadas'],
                        ['processing', 'En proceso' ],
                        ['failed',     'Fallidas'   ],
                    ] as const).map(([f, label]) => (
                        <button
                            key={f}
                            onClick={() => setFilter(f)}
                            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${filter === f
                                ? 'bg-primary text-white'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                }`}
                        >
                            {label}
                        </button>
                    ))}
                </div>

                {/* Stats Summary - SIN VACAS TOTALES */}
                <div className="grid grid-cols-3 gap-4">
                    <div className="bg-white p-4 rounded-xl border border-slate-200">
                        <p className="text-xs text-slate-500 uppercase font-bold">Completadas</p>
                        <p className="text-2xl font-bold text-emerald-600">
                            {missions.filter((m) => m.status === 'completed').length}
                        </p>
                    </div>
                    <div className="bg-white p-4 rounded-xl border border-slate-200">
                        <p className="text-xs text-slate-500 uppercase font-bold">En Proceso</p>
                        <p className="text-2xl font-bold text-blue-600">
                            {missions.filter((m) => ['processing', 'starting', 'queued'].includes(m.status)).length}
                        </p>
                    </div>
                    <div className="bg-white p-4 rounded-xl border border-slate-200">
                        <p className="text-xs text-slate-500 uppercase font-bold">Tiempo Total</p>
                        <p className="text-2xl font-bold text-slate-800">
                            {(missions.reduce((acc, m) => acc + (m.processingTimeSeconds || 0), 0) / 60).toFixed(0)} min
                        </p>
                    </div>
                </div>

                {/* Missions List */}
                <div className="space-y-4">
                    {filteredMissions.length === 0 ? (
                        <div className="text-center py-12 bg-white rounded-xl border border-slate-200">
                            <span className="text-4xl">📭</span>
                            <p className="mt-4 text-slate-500">No hay misiones con este filtro</p>
                        </div>
                    ) : (
                        filteredMissions.map((mission) => (
                            <Link
                                key={mission.id}
                                href={`/mision/${mission.id}`}
                                className="block bg-white rounded-xl border border-slate-200 p-4 hover:shadow-lg hover:border-primary/30 transition-all group"
                            >
                                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                                    <div className="flex-1">
                                        <div className="flex items-center gap-3 mb-2">
                                            <h3 className="font-bold text-slate-800 group-hover:text-primary transition-colors">
                                                {mission.missionName.replace('dlos_', '')}
                                            </h3>
                                            {getStatusBadge(mission.status)}
                                            {mission.analysisStatus === 'completed' && (
                                                <span className="px-2 py-1 text-xs font-bold rounded-full bg-primary/10 text-primary flex items-center gap-1">
                                                    <span className="material-icons-round text-xs">smart_toy</span>
                                                    IA
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex flex-wrap gap-4 text-sm text-slate-500">
                                            <span className="flex items-center gap-1">
                                                <span className="material-icons-round text-sm">location_on</span>
                                                {resolveName(mission.siteName)}
                                            </span>
                                            <span className="flex items-center gap-1">
                                                <span className="material-icons-round text-sm">schedule</span>
                                                {formatDate(mission.createdAt)}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-6">
                                        {mission.status === 'completed' && (
                                            <>
                                                <div className="text-center">
                                                    <p className="text-2xl font-bold text-emerald-600">
                                                        {mission.totalCows || 0}
                                                    </p>
                                                    <p className="text-xs text-slate-500">vacas</p>
                                                </div>
                                                <div className="text-center">
                                                    <p className="text-lg font-bold text-slate-600">
                                                        {formatDuration(mission.processingTimeSeconds)}
                                                    </p>
                                                    <p className="text-xs text-slate-500">duración</p>
                                                </div>
                                            </>
                                        )}
                                        <div className="w-10 h-10 rounded-full bg-slate-100 group-hover:bg-primary group-hover:text-white flex items-center justify-center transition-all">
                                            <span className="material-icons-round">arrow_forward</span>
                                        </div>
                                    </div>
                                </div>
                            </Link>
                        ))
                    )}
                </div>
            </div>
        </>
    );
}