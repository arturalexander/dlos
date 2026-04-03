'use client';

import { useParams, useSearchParams } from 'next/navigation';
import { useState, useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import Link from 'next/link';
import Image from 'next/image';
import type { AgentAnalysis, AnalysisDocument, AgentEstado, AlertaSeveridad, TareaPrioridad } from '@/lib/agent-types';
import { ESTADO_CONFIG, SEVERIDAD_CONFIG, PRIORIDAD_CONFIG, DETECTION_TYPE_CONFIG } from '@/lib/agent-types';

interface MissionResults {
    totalCows: number;
    summary: {
        total_confirmed_cows: number;
        total_time_min: number;
        max_simultaneous: number;
        gps_tracking_enabled: boolean;
        method?: string;
        drone_path_radius_m?: number;
    };
    flightInfo: {
        center_lat: number;
        center_lon: number;
        min_lat: number;
        max_lat: number;
        min_lon: number;
        max_lon: number;
        avg_altitude_m: number;
        total_path_distance_m?: number;
    };
    cows: Array<{
        track_id: number;
        detections: number;
        duration_s: number;
        gps_location: [number, number];
        in_revisited_area: boolean;
    }>;
    captures: Record<string, { clean: string; bbox: string }>;
    periodicCaptures: Array<{ frame: number; clean: string; bbox: string }>;
    mapUrl: string;
    allFiles: Record<string, string>;
}

interface MissionData {
    id: string;
    jobId: string;
    missionName: string;
    siteName: string;
    status: string;
    createdAt: any;
    completedAt?: any;
    processingTimeSeconds?: number;
    vastGpu?: string;
    vastPrice?: number;
    results?: MissionResults;
    error?: string;
}

export default function MisionPage() {
    const params = useParams();
    const searchParams = useSearchParams();
    const missionId = params.id as string;
    const initialTab = searchParams.get('tab') as 'resumen' | 'media' | 'datos' | 'analisis' | null;

    const [mission, setMission] = useState<MissionData | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<'resumen' | 'media' | 'datos' | 'analisis'>(initialTab || 'resumen');
    const [selectedCapture, setSelectedCapture] = useState<string | null>(null);
    const [analysis, setAnalysis] = useState<AnalysisDocument | null>(null);
    const [analysisLoading, setAnalysisLoading] = useState(false);

    useEffect(() => {
        loadMission();
    }, [missionId]);

    useEffect(() => {
        if (activeTab === 'analisis' && missionId) {
            loadAnalysis();
        }
    }, [activeTab, missionId]);

    const loadAnalysis = async () => {
        setAnalysisLoading(true);
        try {
            const analysisRef = doc(db, 'agent_analyses', missionId);
            const analysisSnap = await getDoc(analysisRef);
            if (analysisSnap.exists()) {
                setAnalysis(analysisSnap.data() as AnalysisDocument);
            }
        } catch (err) {
            console.error('Error loading analysis:', err);
        } finally {
            setAnalysisLoading(false);
        }
    };

    const triggerAnalysis = async () => {
        setAnalysisLoading(true);
        try {
            const response = await fetch('/api/agents/analyze', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ jobId: missionId }),
            });
            if (response.ok) {
                // Wait a moment then reload
                setTimeout(loadAnalysis, 2000);
            }
        } catch (err) {
            console.error('Error triggering analysis:', err);
            setAnalysisLoading(false);
        }
    };

    const loadMission = async () => {
        try {
            const docRef = doc(db, 'processing_jobs', missionId);
            const docSnap = await getDoc(docRef);

            if (docSnap.exists()) {
                const data = docSnap.data();
                setMission({
                    id: docSnap.id,
                    jobId: data.jobId,
                    missionName: data.missionName || 'Sin nombre',
                    siteName: data.siteName || 'Sin sitio',
                    status: data.status,
                    createdAt: data.createdAt,
                    completedAt: data.completedAt,
                    processingTimeSeconds: data.processingTimeSeconds,
                    vastGpu: data.vastGpu,
                    vastPrice: data.vastPrice,
                    results: data.results,
                    error: data.error,
                });
            } else {
                setError('Misión no encontrada');
            }
        } catch (err) {
            console.error('Error loading mission:', err);
            setError('Error al cargar la misión');
        } finally {
            setIsLoading(false);
        }
    };

    const formatDate = (timestamp: any) => {
        if (!timestamp) return 'N/A';
        const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
        return date.toLocaleDateString('es-ES', {
            weekday: 'long',
            day: '2-digit',
            month: 'long',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <div className="text-center">
                    <div className="w-14 h-14 animate-pulse mx-auto">
                        <img src="/logo-icon.svg" alt="dlos.ai" className="w-full h-full" />
                    </div>
                    <p className="mt-4 text-slate-500 font-medium">Cargando misión...</p>
                </div>
            </div>
        );
    }

    if (error || !mission) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <div className="text-center">
                    <span className="text-6xl">❌</span>
                    <h2 className="text-2xl font-bold mt-4">{error || 'Misión no encontrada'}</h2>
                    <p className="text-slate-500 mt-2">ID: {missionId}</p>
                    <Link href="/misiones" className="inline-block mt-4 px-6 py-2 bg-primary text-white rounded-lg hover:bg-primary/90">
                        Ver todas las misiones
                    </Link>
                </div>
            </div>
        );
    }

    const results = mission.results;

    // Calcular máximo de detecciones para la gráfica
    const maxDetections = results?.cows ? Math.max(...results.cows.map(c => c.detections)) : 1;

    return (
        <>
            {/* Header */}
            <header className="h-auto min-h-16 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between px-4 lg:px-8 py-4 bg-white/50 backdrop-blur-md shrink-0 sticky top-0 z-40 gap-4">
                <div>
                    <Link href="/misiones" className="text-sm text-primary hover:underline mb-1 inline-flex items-center gap-1">
                        <span className="material-icons-round text-sm">arrow_back</span>
                        Volver a misiones
                    </Link>
                    <h2 className="text-xl font-bold">{mission.missionName.replace('dlos_', '')}</h2>
                    <p className="text-xs text-slate-500">{mission.siteName} • {formatDate(mission.createdAt)}</p>
                </div>
                <div className="flex items-center gap-3">
                    {mission.status === 'completed' && (
                        <div className="flex items-center gap-2 bg-emerald-100 text-emerald-700 px-4 py-2 rounded-lg">
                            <span className="material-icons-round text-sm">check_circle</span>
                            <span className="font-bold">{results?.totalCows || 0} vacas detectadas</span>
                        </div>
                    )}
                    {mission.status === 'processing' && (
                        <div className="flex items-center gap-2 bg-blue-100 text-blue-700 px-4 py-2 rounded-lg animate-pulse">
                            <span className="material-icons-round text-sm">sync</span>
                            <span className="font-bold">Procesando...</span>
                        </div>
                    )}
                    {mission.status === 'failed' && (
                        <div className="flex items-center gap-2 bg-red-100 text-red-700 px-4 py-2 rounded-lg">
                            <span className="material-icons-round text-sm">error</span>
                            <span className="font-bold">Error</span>
                        </div>
                    )}
                </div>
            </header>

            {/* Tabs */}
            <div className="border-b border-slate-200 bg-white px-4 lg:px-8">
                <div className="flex gap-1 overflow-x-auto hide-scrollbar">
                    {(['resumen', 'media', 'datos', 'analisis'] as const).map((tab) => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={`px-4 py-3 text-sm font-medium border-b-2 transition-all whitespace-nowrap ${activeTab === tab
                                ? 'border-primary text-primary'
                                : 'border-transparent text-slate-500 hover:text-slate-700'
                                }`}
                        >
                            {tab === 'resumen' && '📊 Resumen'}
                            {tab === 'media' && '📸 Media'}
                            {tab === 'datos' && '📋 Datos'}
                            {tab === 'analisis' && '🤖 Análisis IA'}
                        </button>
                    ))}
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 lg:p-8 hide-scrollbar pb-24 lg:pb-8">
                {/* Tab: Resumen - KPIs + MAPA */}
                {activeTab === 'resumen' && results && (
                    <div className="space-y-6">
                        {/* KPIs */}
                        <div className="grid grid-cols-3 md:grid-cols-5 gap-3">
                            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                                <div className="p-1.5 bg-emerald-100 rounded-lg w-fit mb-2">
                                    <span className="material-icons-round text-emerald-600 text-lg">pets</span>
                                </div>
                                <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wide">Animales</p>
                                <p className="text-2xl font-black text-slate-800">{results.totalCows}</p>
                            </div>
                            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                                <div className="p-1.5 bg-blue-100 rounded-lg w-fit mb-2">
                                    <span className="material-icons-round text-blue-500 text-lg">person</span>
                                </div>
                                <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wide">Personas</p>
                                <p className="text-2xl font-black text-slate-800">{(results as any).totalPersons ?? 0}</p>
                            </div>
                            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                                <div className="p-1.5 bg-orange-100 rounded-lg w-fit mb-2">
                                    <span className="material-icons-round text-orange-500 text-lg">directions_car</span>
                                </div>
                                <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wide">Vehículos</p>
                                <p className="text-2xl font-black text-slate-800">{(results as any).totalVehicles ?? 0}</p>
                            </div>
                            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                                <div className="p-1.5 bg-purple-100 rounded-lg w-fit mb-2">
                                    <span className="material-icons-round text-purple-600 text-lg">height</span>
                                </div>
                                <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wide">Altitud</p>
                                <p className="text-2xl font-black text-slate-800">{results.flightInfo?.avg_altitude_m?.toFixed(0) || '-'}m</p>
                            </div>
                            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                                <div className="p-1.5 bg-sky-100 rounded-lg w-fit mb-2">
                                    <span className="material-icons-round text-sky-600 text-lg">timer</span>
                                </div>
                                <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wide">Proceso</p>
                                <p className="text-2xl font-black text-slate-800">{mission.processingTimeSeconds ? `${(mission.processingTimeSeconds / 60).toFixed(1)}m` : '-'}</p>
                            </div>
                        </div>

                        {/* MAPA en Resumen */}
                        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                            <div className="p-4 border-b border-slate-100 flex items-center gap-2">
                                <span className="material-icons-round text-primary">map</span>
                                <h3 className="font-bold text-slate-800">Mapa de Detecciones</h3>
                            </div>
                            <div className="h-[500px]">
                                {results.mapUrl ? (
                                    <iframe
                                        src={results.mapUrl}
                                        title="Mapa de la misión"
                                        className="w-full h-full"
                                        sandbox="allow-scripts allow-same-origin"
                                    />
                                ) : (
                                    <div className="flex items-center justify-center h-full text-slate-500">
                                        <div className="text-center">
                                            <span className="material-icons-round text-6xl text-slate-300">map</span>
                                            <p className="mt-4">Mapa no disponible</p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* Tab: Media */}
                {activeTab === 'media' && results && (
                    <div className="space-y-6">
                        {/* Key Captures */}
                        <h3 className="font-bold text-slate-800">Capturas Clave</h3>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                            {Object.entries(results.captures || {}).map(([key, capture]) => (
                                <div
                                    key={key}
                                    className="bg-white rounded-xl border border-slate-200 overflow-hidden cursor-pointer hover:shadow-lg transition-all group"
                                    onClick={() => setSelectedCapture(capture.bbox)}
                                >
                                    <div className="relative aspect-video bg-slate-100">
                                        {capture.bbox && (
                                            <Image
                                                src={capture.bbox}
                                                alt={key}
                                                fill
                                                className="object-cover group-hover:scale-105 transition-transform"
                                            />
                                        )}
                                    </div>
                                    <div className="p-3">
                                        <p className="text-sm font-bold text-slate-800 capitalize">
                                            {key.replace(/_/g, ' ').replace(/\bcow\b/gi, 'detection').replace(/\bcows\b/gi, 'detections')}
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Periodic Captures */}
                        {results.periodicCaptures && results.periodicCaptures.length > 0 && (
                            <>
                                <h3 className="font-bold text-slate-800 mt-8">Capturas Periódicas ({results.periodicCaptures.length})</h3>
                                <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
                                    {results.periodicCaptures.map((capture, i) => (
                                        <div
                                            key={i}
                                            className="relative aspect-video bg-slate-100 rounded-lg overflow-hidden cursor-pointer hover:ring-2 ring-primary transition-all"
                                            onClick={() => setSelectedCapture(capture.bbox)}
                                        >
                                            {capture.bbox && (
                                                <Image
                                                    src={capture.bbox}
                                                    alt={`Frame ${capture.frame}`}
                                                    fill
                                                    className="object-cover"
                                                />
                                            )}
                                            <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-xs p-1 text-center">
                                                #{capture.frame}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </>
                        )}

                        {/* Lightbox */}
                        {selectedCapture && (
                            <div
                                className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4"
                                onClick={() => setSelectedCapture(null)}
                            >
                                <button
                                    className="absolute top-4 right-4 text-white text-4xl hover:text-primary"
                                    onClick={() => setSelectedCapture(null)}
                                >
                                    ×
                                </button>
                                <Image
                                    src={selectedCapture}
                                    alt="Captura"
                                    width={1200}
                                    height={800}
                                    className="max-w-full max-h-[90vh] object-contain"
                                />
                            </div>
                        )}
                    </div>
                )}

                {/* Tab: Datos - Info técnica + Gráfica de vacas */}
                {activeTab === 'datos' && results && (
                    <div className="space-y-6">
                        {/* Info Cards */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* Flight Info */}
                            <div className="bg-white p-6 rounded-2xl border border-slate-200">
                                <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                                    <span className="material-icons-round text-primary">flight</span>
                                    Información del Vuelo
                                </h3>
                                <div className="space-y-3 text-sm">
                                    <div className="flex justify-between">
                                        <span className="text-slate-500">Centro</span>
                                        <span className="font-mono">
                                            {results.flightInfo?.center_lat?.toFixed(5)}, {results.flightInfo?.center_lon?.toFixed(5)}
                                        </span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-slate-500">Distancia recorrida</span>
                                        <span className="font-bold">
                                            {results.flightInfo?.total_path_distance_m
                                                ? `${(results.flightInfo.total_path_distance_m / 1000).toFixed(2)} km`
                                                : '-'}
                                        </span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-slate-500">GPS Tracking</span>
                                        <span className={results.summary?.gps_tracking_enabled ? 'text-emerald-600' : 'text-slate-400'}>
                                            {results.summary?.gps_tracking_enabled ? '✅ Activo' : '❌ Inactivo'}
                                        </span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-slate-500">Método</span>
                                        <span className="font-mono text-xs bg-slate-100 px-2 py-1 rounded">
                                            {results.summary?.method || 'standard'}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* Processing Info */}
                            <div className="bg-white p-6 rounded-2xl border border-slate-200">
                                <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                                    <span className="material-icons-round text-primary">memory</span>
                                    Procesamiento GPU
                                </h3>
                                <div className="space-y-3 text-sm">
                                    <div className="flex justify-between">
                                        <span className="text-slate-500">GPU</span>
                                        <span className="font-bold">{mission.vastGpu || '-'}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-slate-500">Precio/hora</span>
                                        <span className="font-mono">${mission.vastPrice?.toFixed(4) || '-'}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-slate-500">Coste total</span>
                                        <span className="font-bold text-emerald-600">
                                            ${mission.vastPrice && mission.processingTimeSeconds
                                                ? ((mission.vastPrice * mission.processingTimeSeconds) / 3600).toFixed(4)
                                                : '-'}
                                        </span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-slate-500">Completado</span>
                                        <span className="text-xs">{formatDate(mission.completedAt)}</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Gráfica de Vacas */}
                        {results.cows && results.cows.length > 0 && (
                            <div className="bg-white p-6 rounded-2xl border border-slate-200">
                                <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                                    <span className="material-icons-round text-primary">bar_chart</span>
                                    Vacas Detectadas ({results.cows.length})
                                </h3>

                                {/* Gráfica de barras */}
                                <div className="space-y-3">
                                    {results.cows.map((cow) => (
                                        <div key={cow.track_id} className="flex items-center gap-4">
                                            <div className="w-16 text-sm font-mono text-slate-500">
                                                #{cow.track_id}
                                            </div>
                                            <div className="flex-1">
                                                <div className="flex items-center gap-2">
                                                    <div className="flex-1 bg-slate-100 rounded-full h-6 overflow-hidden">
                                                        <div
                                                            className="bg-gradient-to-r from-emerald-400 to-emerald-600 h-full rounded-full flex items-center justify-end pr-2 transition-all duration-500"
                                                            style={{ width: `${(cow.detections / maxDetections) * 100}%` }}
                                                        >
                                                            <span className="text-xs font-bold text-white">
                                                                {cow.detections}
                                                            </span>
                                                        </div>
                                                    </div>
                                                    <div className="w-16 text-xs text-slate-500 text-right">
                                                        {cow.duration_s?.toFixed(1)}s
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="w-32 text-xs text-slate-400 font-mono hidden md:block">
                                                {cow.gps_location
                                                    ? `${cow.gps_location[0]?.toFixed(4)}, ${cow.gps_location[1]?.toFixed(4)}`
                                                    : '-'}
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                {/* Leyenda */}
                                <div className="mt-4 pt-4 border-t border-slate-100 flex flex-wrap gap-4 text-xs text-slate-500">
                                    <span className="flex items-center gap-1">
                                        <span className="w-3 h-3 bg-emerald-500 rounded"></span>
                                        Detecciones (frames donde apareció)
                                    </span>
                                    <span>Duración = tiempo visible en video</span>
                                </div>
                            </div>
                        )}

                        {/* Download JSON */}
                        <div className="bg-white p-6 rounded-2xl border border-slate-200">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="font-bold text-slate-800 flex items-center gap-2">
                                    <span className="material-icons-round text-primary">code</span>
                                    Datos JSON
                                </h3>
                                <button
                                    onClick={() => {
                                        const dataStr = JSON.stringify(mission, null, 2);
                                        const blob = new Blob([dataStr], { type: 'application/json' });
                                        const url = URL.createObjectURL(blob);
                                        const a = document.createElement('a');
                                        a.href = url;
                                        a.download = `mission_${mission.id}.json`;
                                        a.click();
                                    }}
                                    className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-lg hover:bg-primary/90"
                                >
                                    <span className="material-icons-round text-sm">download</span>
                                    Descargar JSON
                                </button>
                            </div>
                            <details className="group">
                                <summary className="cursor-pointer text-sm text-slate-500 hover:text-primary">
                                    Ver datos completos...
                                </summary>
                                <pre className="mt-4 bg-slate-900 text-emerald-400 p-4 rounded-lg overflow-auto max-h-[300px] text-xs">
                                    {JSON.stringify(mission, null, 2)}
                                </pre>
                            </details>
                        </div>

                        {/* All Files */}
                        {results?.allFiles && Object.keys(results.allFiles).length > 0 && (
                            <div className="bg-white p-6 rounded-2xl border border-slate-200">
                                <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                                    <span className="material-icons-round text-primary">folder</span>
                                    Archivos Generados
                                </h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                    {Object.entries(results.allFiles).map(([name, url]) => (
                                        <a
                                            key={name}
                                            href={url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors"
                                        >
                                            <span className="material-icons-round text-slate-400">
                                                {name.endsWith('.jpg') ? 'image' : name.endsWith('.html') ? 'code' : 'insert_drive_file'}
                                            </span>
                                            <span className="text-sm text-slate-700 flex-1 truncate">{name}</span>
                                            <span className="material-icons-round text-slate-400 text-sm">open_in_new</span>
                                        </a>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Tab: Análisis IA */}
                {activeTab === 'analisis' && (
                    <div className="space-y-6">
                        {analysisLoading ? (
                            <div className="flex items-center justify-center py-20">
                                <div className="text-center">
                                    <span className="text-4xl animate-pulse">🤖</span>
                                    <p className="mt-4 text-slate-500">Cargando análisis...</p>
                                </div>
                            </div>
                        ) : analysis?.status === 'completed' && analysis.analysis ? (
                            <AnalysisView analysis={analysis.analysis} missionName={mission.missionName} />
                        ) : analysis?.status === 'analyzing' ? (
                            <div className="bg-white p-8 rounded-2xl border border-slate-200 text-center">
                                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-blue-100 flex items-center justify-center animate-pulse">
                                    <span className="material-icons-round text-3xl text-blue-600">psychology</span>
                                </div>
                                <h3 className="text-xl font-bold text-slate-800 mb-2">Analizando con IA...</h3>
                                <p className="text-slate-500 mb-4">Gemini está procesando los resultados del vuelo.</p>
                                <button onClick={loadAnalysis} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-sm">
                                    Actualizar estado
                                </button>
                            </div>
                        ) : analysis?.status === 'failed' ? (
                            <div className="bg-white p-8 rounded-2xl border border-slate-200 text-center">
                                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-100 flex items-center justify-center">
                                    <span className="material-icons-round text-3xl text-red-600">error</span>
                                </div>
                                <h3 className="text-xl font-bold text-slate-800 mb-2">Error en el análisis</h3>
                                <p className="text-slate-500 mb-4">{analysis.error || 'Error desconocido'}</p>
                                <button onClick={triggerAnalysis} className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 text-sm">
                                    Reintentar análisis
                                </button>
                            </div>
                        ) : mission.status === 'completed' ? (
                            <div className="bg-white p-8 rounded-2xl border border-slate-200 text-center">
                                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-slate-100 flex items-center justify-center">
                                    <span className="material-icons-round text-3xl text-slate-400">smart_toy</span>
                                </div>
                                <h3 className="text-xl font-bold text-slate-800 mb-2">Análisis no disponible</h3>
                                <p className="text-slate-500 mb-4">Esta misión no ha sido analizada por IA aún.</p>
                                <button onClick={triggerAnalysis} className="flex items-center gap-2 mx-auto px-6 py-3 bg-primary text-white rounded-lg hover:bg-primary/90">
                                    <span className="material-icons-round text-sm">psychology</span>
                                    Lanzar Análisis IA
                                </button>
                            </div>
                        ) : (
                            <div className="bg-white p-8 rounded-2xl border border-slate-200 text-center">
                                <p className="text-slate-500">El análisis IA solo está disponible para misiones completadas.</p>
                            </div>
                        )}
                    </div>
                )}

                {/* Status: Processing or Failed */}
                {mission.status !== 'completed' && (
                    <div className="bg-white p-8 rounded-2xl border border-slate-200 text-center">
                        {mission.status === 'processing' || mission.status === 'starting' ? (
                            <>
                                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-blue-100 flex items-center justify-center animate-pulse">
                                    <span className="material-icons-round text-3xl text-blue-600">sync</span>
                                </div>
                                <h3 className="text-xl font-bold text-slate-800 mb-2">Procesando...</h3>
                                <p className="text-slate-500">
                                    El video está siendo analizado. Esta página se actualizará automáticamente cuando termine.
                                </p>
                                <button
                                    onClick={loadMission}
                                    className="mt-4 px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-sm"
                                >
                                    Actualizar estado
                                </button>
                            </>
                        ) : mission.status === 'failed' ? (
                            <>
                                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-100 flex items-center justify-center">
                                    <span className="material-icons-round text-3xl text-red-600">error</span>
                                </div>
                                <h3 className="text-xl font-bold text-slate-800 mb-2">Error en el procesamiento</h3>
                                <p className="text-slate-500 mb-4">{mission.error || 'Error desconocido'}</p>
                            </>
                        ) : (
                            <>
                                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-yellow-100 flex items-center justify-center">
                                    <span className="material-icons-round text-3xl text-yellow-600">schedule</span>
                                </div>
                                <h3 className="text-xl font-bold text-slate-800 mb-2">En cola</h3>
                                <p className="text-slate-500">La misión está esperando para ser procesada.</p>
                            </>
                        )}
                    </div>
                )}
            </div>
        </>
    );
}

// ─── Analysis View Component ─────────────────────────────────────────────────

function IndexGauge({ value, size = 'lg' }: { value: number; size?: 'sm' | 'lg' }) {
    const color = value >= 80 ? 'text-emerald-600' : value >= 60 ? 'text-yellow-600' : value >= 40 ? 'text-orange-600' : 'text-red-600';
    const bgColor = value >= 80 ? 'bg-emerald-100' : value >= 60 ? 'bg-yellow-100' : value >= 40 ? 'bg-orange-100' : 'bg-red-100';
    const ringColor = value >= 80 ? 'border-emerald-400' : value >= 60 ? 'border-yellow-400' : value >= 40 ? 'border-orange-400' : 'border-red-400';

    if (size === 'sm') {
        return (
            <div className={`w-12 h-12 rounded-full ${bgColor} border-2 ${ringColor} flex items-center justify-center`}>
                <span className={`text-sm font-bold ${color}`}>{value}</span>
            </div>
        );
    }

    return (
        <div className={`w-24 h-24 rounded-full ${bgColor} border-4 ${ringColor} flex items-center justify-center`}>
            <div className="text-center">
                <span className={`text-2xl font-bold ${color}`}>{value}</span>
                <p className="text-[10px] text-slate-500 -mt-1">/ 100</p>
            </div>
        </div>
    );
}

function AnalysisView({ analysis, missionName }: { analysis: AgentAnalysis; missionName: string }) {
    const [copiedWhatsapp, setCopiedWhatsapp] = useState(false);
    const [expandedAgent, setExpandedAgent] = useState<string | null>(
        analysis.agentes_activados?.[0] || null
    );

    const copyWhatsapp = () => {
        navigator.clipboard.writeText(analysis.para_el_cliente?.mensaje_whatsapp || '');
        setCopiedWhatsapp(true);
        setTimeout(() => setCopiedWhatsapp(false), 2000);
    };

    return (
        <div className="space-y-6">
            {/* Executive Summary + Index */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                <div className="flex items-start gap-6">
                    <IndexGauge value={analysis.indice_general} />
                    <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                            <span className="material-icons-round text-primary">psychology</span>
                            <h3 className="font-bold text-slate-800">Resumen Ejecutivo</h3>
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${getGeneralEstadoStyle(analysis.indice_general)}`}>
                                {getGeneralEstadoLabel(analysis.indice_general)}
                            </span>
                        </div>
                        <p className="text-slate-600 leading-relaxed">{analysis.resumen_ejecutivo}</p>
                        <div className="flex flex-wrap gap-2 mt-3">
                            {analysis.agentes_activados?.map((agent) => {
                                const config = DETECTION_TYPE_CONFIG[agent as keyof typeof DETECTION_TYPE_CONFIG];
                                return (
                                    <span key={agent} className="flex items-center gap-1 text-xs bg-slate-100 px-2 py-1 rounded-full text-slate-600">
                                        {config?.emoji || '🔍'} {config?.label || agent}
                                    </span>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div>

            {/* Agent Analysis Cards */}
            {analysis.analisis_por_agente && Object.entries(analysis.analisis_por_agente).map(([agentKey, agentData]) => {
                const config = DETECTION_TYPE_CONFIG[agentKey as keyof typeof DETECTION_TYPE_CONFIG];
                const estadoConfig = ESTADO_CONFIG[agentData.estado as keyof typeof ESTADO_CONFIG] || ESTADO_CONFIG.normal;
                const isExpanded = expandedAgent === agentKey;

                return (
                    <div key={agentKey} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                        <button
                            onClick={() => setExpandedAgent(isExpanded ? null : agentKey)}
                            className="w-full p-6 flex items-center gap-4 hover:bg-slate-50 transition-colors"
                        >
                            <IndexGauge value={agentData.indice} size="sm" />
                            <div className="flex-1 text-left">
                                <div className="flex items-center gap-2">
                                    <span className="material-icons-round text-lg text-slate-600">{config?.icon || 'search'}</span>
                                    <h3 className="font-bold text-slate-800">Agente {config?.label || agentKey}</h3>
                                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${estadoConfig.bgColor} ${estadoConfig.color}`}>
                                        {estadoConfig.label}
                                    </span>
                                </div>
                                <p className="text-sm text-slate-500 mt-1">
                                    {agentData.hallazgos?.[0] || 'Sin hallazgos'}
                                </p>
                            </div>
                            <span className={`material-icons-round text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
                                expand_more
                            </span>
                        </button>

                        {isExpanded && (
                            <div className="border-t border-slate-100 p-6 space-y-4">
                                {/* Hallazgos */}
                                {agentData.hallazgos?.length > 0 && (
                                    <div>
                                        <h4 className="text-sm font-bold text-slate-700 mb-2 flex items-center gap-1">
                                            <span className="material-icons-round text-sm text-slate-400">checklist</span>
                                            Hallazgos
                                        </h4>
                                        <ul className="space-y-1">
                                            {agentData.hallazgos.map((h, i) => (
                                                <li key={i} className="text-sm text-slate-600 flex items-start gap-2">
                                                    <span className="text-emerald-500 mt-0.5">•</span>
                                                    {h}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}

                                {/* Anomalias */}
                                {agentData.anomalias?.length > 0 && (
                                    <div>
                                        <h4 className="text-sm font-bold text-slate-700 mb-2 flex items-center gap-1">
                                            <span className="material-icons-round text-sm text-orange-500">warning</span>
                                            Anomalías
                                        </h4>
                                        <div className="space-y-2">
                                            {agentData.anomalias.map((a, i) => {
                                                const sevConfig = SEVERIDAD_CONFIG[a.severidad as keyof typeof SEVERIDAD_CONFIG] || SEVERIDAD_CONFIG.baja;
                                                return (
                                                    <div key={i} className={`p-3 rounded-lg border ${sevConfig.borderColor} ${sevConfig.bgColor}`}>
                                                        <div className="flex items-start justify-between gap-2">
                                                            <p className={`text-sm font-medium ${sevConfig.color}`}>{a.descripcion}</p>
                                                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${sevConfig.bgColor} ${sevConfig.color}`}>
                                                                {sevConfig.label}
                                                            </span>
                                                        </div>
                                                        {a.accion_recomendada && (
                                                            <p className="text-xs text-slate-600 mt-1">→ {a.accion_recomendada}</p>
                                                        )}
                                                        {a.gps && (
                                                            <p className="text-xs font-mono text-slate-400 mt-1">
                                                                📍 {a.gps[0]?.toFixed(5)}, {a.gps[1]?.toFixed(5)}
                                                            </p>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                                {/* Recomendaciones */}
                                {agentData.recomendaciones?.length > 0 && (
                                    <div>
                                        <h4 className="text-sm font-bold text-slate-700 mb-2 flex items-center gap-1">
                                            <span className="material-icons-round text-sm text-blue-500">lightbulb</span>
                                            Recomendaciones
                                        </h4>
                                        <ul className="space-y-1">
                                            {agentData.recomendaciones.map((r, i) => (
                                                <li key={i} className="text-sm text-slate-600 flex items-start gap-2">
                                                    <span className="text-blue-500 mt-0.5">→</span>
                                                    {r}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                );
            })}

            {/* Alerts */}
            {analysis.alertas?.length > 0 && (
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                    <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                        <span className="material-icons-round text-orange-500">notifications_active</span>
                        Alertas ({analysis.alertas.length})
                    </h3>
                    <div className="space-y-3">
                        {analysis.alertas.map((alerta, i) => {
                            const sevConfig = SEVERIDAD_CONFIG[alerta.severidad as keyof typeof SEVERIDAD_CONFIG] || SEVERIDAD_CONFIG.baja;
                            return (
                                <div key={i} className={`p-4 rounded-xl border ${sevConfig.borderColor} ${sevConfig.bgColor} ${alerta.severidad === 'critica' ? 'animate-pulse' : ''}`}>
                                    <div className="flex items-start justify-between gap-2">
                                        <div>
                                            <h4 className={`font-bold text-sm ${sevConfig.color}`}>{alerta.titulo}</h4>
                                            <p className="text-sm text-slate-600 mt-1">{alerta.descripcion}</p>
                                        </div>
                                        <span className={`text-xs px-2 py-1 rounded-full font-bold whitespace-nowrap ${sevConfig.bgColor} ${sevConfig.color} border ${sevConfig.borderColor}`}>
                                            {sevConfig.label}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-4 mt-2 text-xs text-slate-500">
                                        {alerta.lat && alerta.lon && (
                                            <span className="font-mono">📍 {alerta.lat.toFixed(5)}, {alerta.lon.toFixed(5)}</span>
                                        )}
                                        {alerta.requiere_accion && (
                                            <span className="text-red-600 font-medium">Requiere acción</span>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Tasks */}
            {analysis.tareas?.length > 0 && (
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                    <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                        <span className="material-icons-round text-primary">task_alt</span>
                        Tareas Generadas ({analysis.tareas.length})
                    </h3>
                    <div className="space-y-3">
                        {analysis.tareas.map((tarea, i) => {
                            const prioConfig = PRIORIDAD_CONFIG[tarea.prioridad as keyof typeof PRIORIDAD_CONFIG] || PRIORIDAD_CONFIG.baja;
                            return (
                                <div key={i} className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="flex-1">
                                            <h4 className="font-bold text-sm text-slate-800">{tarea.titulo}</h4>
                                            <p className="text-sm text-slate-600 mt-1">{tarea.descripcion}</p>
                                        </div>
                                        <div className="flex flex-col items-end gap-1">
                                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${prioConfig.bgColor} ${prioConfig.color}`}>
                                                {prioConfig.label}
                                            </span>
                                            {tarea.plazo && (
                                                <span className="text-xs text-slate-400">⏱ {tarea.plazo}</span>
                                            )}
                                        </div>
                                    </div>
                                    {tarea.gps && (
                                        <p className="text-xs font-mono text-slate-400 mt-2">
                                            📍 {tarea.gps[0]?.toFixed(5)}, {tarea.gps[1]?.toFixed(5)}
                                        </p>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Statistics */}
            {analysis.estadisticas_calculadas && (
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                    <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                        <span className="material-icons-round text-primary">calculate</span>
                        Estadísticas Calculadas
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {analysis.estadisticas_calculadas.centroide_grupo && (
                            <div className="p-3 bg-slate-50 rounded-lg">
                                <p className="text-xs text-slate-500 uppercase font-bold">Centroide del grupo</p>
                                <p className="font-mono text-sm text-slate-700 mt-1">
                                    {analysis.estadisticas_calculadas.centroide_grupo[0]?.toFixed(5)}, {analysis.estadisticas_calculadas.centroide_grupo[1]?.toFixed(5)}
                                </p>
                            </div>
                        )}
                        {analysis.estadisticas_calculadas.deteccion_mas_alejada && (
                            <div className="p-3 bg-slate-50 rounded-lg">
                                <p className="text-xs text-slate-500 uppercase font-bold">Detección más alejada</p>
                                <p className="text-sm text-slate-700 mt-1">
                                    Track #{analysis.estadisticas_calculadas.deteccion_mas_alejada.track_id} — {analysis.estadisticas_calculadas.deteccion_mas_alejada.distancia_m}m
                                </p>
                            </div>
                        )}
                        <div className="p-3 bg-slate-50 rounded-lg">
                            <p className="text-xs text-slate-500 uppercase font-bold">Variación vs histórico</p>
                            <p className="text-sm font-bold text-slate-700 mt-1">
                                {analysis.estadisticas_calculadas.variacion_vs_historico || 'N/A'}
                            </p>
                        </div>
                        <div className="p-3 bg-slate-50 rounded-lg">
                            <p className="text-xs text-slate-500 uppercase font-bold">Zonas críticas afectadas</p>
                            <p className="text-sm text-slate-700 mt-1">
                                {analysis.estadisticas_calculadas.zonas_criticas_afectadas?.length > 0
                                    ? analysis.estadisticas_calculadas.zonas_criticas_afectadas.join(', ')
                                    : 'Ninguna'}
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* WhatsApp Message */}
            {analysis.para_el_cliente && (
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                    <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                        <span className="material-icons-round text-green-600">chat</span>
                        Mensaje para el Cliente
                    </h3>
                    <div className="bg-[#DCF8C6] p-4 rounded-xl rounded-tl-none max-w-lg border border-green-200">
                        <pre className="text-sm text-slate-800 whitespace-pre-wrap font-sans leading-relaxed">
                            {analysis.para_el_cliente.mensaje_whatsapp}
                        </pre>
                    </div>
                    <div className="flex items-center gap-4 mt-3">
                        <button
                            onClick={copyWhatsapp}
                            className="flex items-center gap-2 text-sm text-slate-500 hover:text-primary transition-colors"
                        >
                            <span className="material-icons-round text-sm">
                                {copiedWhatsapp ? 'check' : 'content_copy'}
                            </span>
                            {copiedWhatsapp ? 'Copiado' : 'Copiar mensaje'}
                        </button>
                        <div className="text-xs text-slate-400">
                            Urgencia: <span className="font-medium">{analysis.para_el_cliente.nivel_urgencia}</span>
                        </div>
                    </div>
                    {analysis.para_el_cliente.proxima_accion && (
                        <div className="mt-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
                            <p className="text-xs font-bold text-blue-700 uppercase">Próxima acción</p>
                            <p className="text-sm text-blue-800 mt-1">{analysis.para_el_cliente.proxima_accion}</p>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

function getGeneralEstadoStyle(indice: number): string {
    if (indice >= 80) return 'bg-emerald-100 text-emerald-700';
    if (indice >= 60) return 'bg-yellow-100 text-yellow-700';
    if (indice >= 40) return 'bg-orange-100 text-orange-700';
    return 'bg-red-100 text-red-700';
}

function getGeneralEstadoLabel(indice: number): string {
    if (indice >= 80) return 'Normal';
    if (indice >= 60) return 'Atención';
    if (indice >= 40) return 'Alerta';
    return 'Crítico';
}