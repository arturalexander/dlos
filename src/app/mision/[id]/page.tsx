'use client';

import { useParams } from 'next/navigation';
import { useState, useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import Link from 'next/link';
import Image from 'next/image';

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
    const missionId = params.id as string;

    const [mission, setMission] = useState<MissionData | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<'resumen' | 'capturas' | 'datos'>('resumen');
    const [selectedCapture, setSelectedCapture] = useState<string | null>(null);

    useEffect(() => {
        loadMission();
    }, [missionId]);

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
                    <span className="text-4xl animate-pulse">🐄</span>
                    <p className="mt-4 text-slate-500">Cargando misión...</p>
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
                    {(['resumen', 'capturas', 'datos'] as const).map((tab) => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={`px-4 py-3 text-sm font-medium border-b-2 transition-all whitespace-nowrap ${activeTab === tab
                                ? 'border-primary text-primary'
                                : 'border-transparent text-slate-500 hover:text-slate-700'
                                }`}
                        >
                            {tab === 'resumen' && '📊 Resumen'}
                            {tab === 'capturas' && '📸 Capturas'}
                            {tab === 'datos' && '📋 Datos'}
                        </button>
                    ))}
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 lg:p-8 hide-scrollbar pb-24 lg:pb-8">
                {/* Tab: Resumen - KPIs + MAPA */}
                {activeTab === 'resumen' && results && (
                    <div className="space-y-6">
                        {/* KPIs */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                                <div className="flex items-center gap-2 mb-2">
                                    <div className="p-2 bg-emerald-100 rounded-lg">
                                        <span className="material-icons-round text-emerald-600">pets</span>
                                    </div>
                                </div>
                                <p className="text-xs text-slate-500 uppercase font-bold">Vacas Detectadas</p>
                                <p className="text-3xl font-bold text-slate-800">{results.totalCows}</p>
                            </div>

                            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                                <div className="flex items-center gap-2 mb-2">
                                    <div className="p-2 bg-blue-100 rounded-lg">
                                        <span className="material-icons-round text-blue-600">timer</span>
                                    </div>
                                </div>
                                <p className="text-xs text-slate-500 uppercase font-bold">Tiempo Proceso</p>
                                <p className="text-3xl font-bold text-slate-800">
                                    {mission.processingTimeSeconds
                                        ? `${(mission.processingTimeSeconds / 60).toFixed(1)}m`
                                        : '-'}
                                </p>
                            </div>

                            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                                <div className="flex items-center gap-2 mb-2">
                                    <div className="p-2 bg-purple-100 rounded-lg">
                                        <span className="material-icons-round text-purple-600">height</span>
                                    </div>
                                </div>
                                <p className="text-xs text-slate-500 uppercase font-bold">Altitud Media</p>
                                <p className="text-3xl font-bold text-slate-800">
                                    {results.flightInfo?.avg_altitude_m?.toFixed(0) || '-'}m
                                </p>
                            </div>

                            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                                <div className="flex items-center gap-2 mb-2">
                                    <div className="p-2 bg-orange-100 rounded-lg">
                                        <span className="material-icons-round text-orange-600">group</span>
                                    </div>
                                </div>
                                <p className="text-xs text-slate-500 uppercase font-bold">Máx. Simultáneas</p>
                                <p className="text-3xl font-bold text-slate-800">
                                    {results.summary?.max_simultaneous || '-'}
                                </p>
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

                {/* Tab: Capturas */}
                {activeTab === 'capturas' && results && (
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
                                            {key.replace(/_/g, ' ')}
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