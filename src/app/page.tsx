'use client';

import { useState, useEffect } from 'react';
import { collection, query, orderBy, limit, getDocs, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import Link from 'next/link';

interface RecentMission {
  id: string;
  missionName: string;
  siteName: string;
  status: string;
  totalCows?: number;
  createdAt: any;
}

interface Stats {
  totalMissions: number;
  completedMissions: number;
  totalCows: number;
  processingNow: number;
}

export default function Home() {
  const [recentMissions, setRecentMissions] = useState<RecentMission[]>([]);
  const [stats, setStats] = useState<Stats>({
    totalMissions: 0,
    completedMissions: 0,
    totalCows: 0,
    processingNow: 0,
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const jobsRef = collection(db, 'processing_jobs');
      const q = query(jobsRef, orderBy('createdAt', 'desc'), limit(5));
      const snapshot = await getDocs(q);

      const missions: RecentMission[] = [];
      let totalCows = 0;
      let completed = 0;
      let processing = 0;

      snapshot.forEach((doc) => {
        const data = doc.data();
        missions.push({
          id: doc.id,
          missionName: data.missionName || 'Sin nombre',
          siteName: data.siteName || 'Sin sitio',
          status: data.status || 'unknown',
          totalCows: data.results?.totalCows,
          createdAt: data.createdAt,
        });

        if (data.status === 'completed') {
          completed++;
          totalCows += data.results?.totalCows || 0;
        }
        if (['processing', 'starting', 'queued'].includes(data.status)) {
          processing++;
        }
      });

      // Get total count
      const allJobsSnapshot = await getDocs(collection(db, 'processing_jobs'));
      let allTotalCows = 0;
      let allCompleted = 0;
      let allProcessing = 0;

      allJobsSnapshot.forEach((doc) => {
        const data = doc.data();
        if (data.status === 'completed') {
          allCompleted++;
          allTotalCows += data.results?.totalCows || 0;
        }
        if (['processing', 'starting', 'queued'].includes(data.status)) {
          allProcessing++;
        }
      });

      setRecentMissions(missions);
      setStats({
        totalMissions: allJobsSnapshot.size,
        completedMissions: allCompleted,
        totalCows: allTotalCows,
        processingNow: allProcessing,
      });
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const formatDate = (timestamp: any) => {
    if (!timestamp) return 'N/A';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString('es-ES', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <span className="w-2 h-2 bg-emerald-500 rounded-full"></span>;
      case 'processing':
      case 'starting':
        return <span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></span>;
      case 'failed':
        return <span className="w-2 h-2 bg-red-500 rounded-full"></span>;
      default:
        return <span className="w-2 h-2 bg-yellow-500 rounded-full"></span>;
    }
  };

  return (
    <>
      <header className="h-16 border-b border-slate-200 flex items-center justify-between px-4 lg:px-8 bg-white/50 backdrop-blur-md shrink-0 sticky top-0 z-40">
        <div>
          <h2 className="text-xl font-bold">Dashboard</h2>
          <p className="text-xs text-slate-500">Resumen de actividad</p>
        </div>
        <div className="flex items-center gap-4">
          <button className="w-10 h-10 flex items-center justify-center text-slate-500 hover:bg-slate-100 rounded-full relative transition-colors hidden md:flex">
            <span className="material-icons-round">notifications</span>
            {stats.processingNow > 0 && (
              <span className="absolute top-2 right-2 w-2 h-2 bg-blue-500 rounded-full border border-white animate-pulse"></span>
            )}
          </button>
          <div className="h-8 w-[1px] bg-slate-200 hidden md:block"></div>
          <Link
            href="/misiones"
            className="flex items-center gap-2 bg-primary/10 text-primary px-3 py-1.5 lg:px-4 lg:py-2 rounded-lg font-medium hover:bg-primary/20 transition-colors"
          >
            <span className="material-icons-round text-sm">flight_takeoff</span>
            <span className="hidden md:inline">Ver Misiones</span>
          </Link>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4 lg:p-8 space-y-6 lg:space-y-8 hide-scrollbar pb-24 lg:pb-8">
        {/* Stats Cards */}
        <section className="grid grid-cols-2 md:grid-cols-4 gap-4 lg:gap-6">
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-all">
            <div className="flex justify-between items-start mb-4">
              <div className="p-2 bg-emerald-500/10 text-emerald-500 rounded-lg">
                <span className="material-icons-round">pets</span>
              </div>
            </div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Vacas Totales</p>
            <div className="flex items-baseline gap-2">
              <h3 className="text-3xl font-bold">{isLoading ? '-' : stats.totalCows}</h3>
              <span className="text-sm text-slate-500 font-medium">detectadas</span>
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-all">
            <div className="flex justify-between items-start mb-4">
              <div className="p-2 bg-blue-500/10 text-blue-500 rounded-lg">
                <span className="material-icons-round">flight_takeoff</span>
              </div>
            </div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Misiones</p>
            <div className="flex items-baseline gap-2">
              <h3 className="text-3xl font-bold">{isLoading ? '-' : stats.completedMissions}</h3>
              <span className="text-sm text-slate-500 font-medium">completadas</span>
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-all">
            <div className="flex justify-between items-start mb-4">
              <div className="p-2 bg-purple-500/10 text-purple-500 rounded-lg">
                <span className="material-icons-round">sync</span>
              </div>
              {stats.processingNow > 0 && (
                <span className="text-xs font-bold text-purple-500 bg-purple-500/10 px-2 py-0.5 rounded animate-pulse">
                  ACTIVO
                </span>
              )}
            </div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">En Proceso</p>
            <div className="flex items-baseline gap-2">
              <h3 className="text-3xl font-bold">{isLoading ? '-' : stats.processingNow}</h3>
              <span className="text-sm text-slate-500 font-medium">ahora</span>
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-all">
            <div className="flex justify-between items-start mb-4">
              <div className="p-2 bg-orange-500/10 text-orange-500 rounded-lg">
                <span className="material-icons-round">calculate</span>
              </div>
            </div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Promedio</p>
            <div className="flex items-baseline gap-2">
              <h3 className="text-3xl font-bold">
                {isLoading || stats.completedMissions === 0
                  ? '-'
                  : Math.round(stats.totalCows / stats.completedMissions)}
              </h3>
              <span className="text-sm text-slate-500 font-medium">vacas/misión</span>
            </div>
          </div>
        </section>

        {/* Recent Missions */}
        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-slate-100 flex items-center justify-between">
            <h3 className="font-bold text-slate-800 flex items-center gap-2">
              <span className="material-icons-round text-primary">history</span>
              Misiones Recientes
            </h3>
            <Link
              href="/misiones"
              className="text-sm text-primary font-medium hover:underline flex items-center gap-1"
            >
              Ver todas
              <span className="material-icons-round text-sm">arrow_forward</span>
            </Link>
          </div>

          {isLoading ? (
            <div className="p-8 text-center text-slate-500">
              <span className="text-2xl animate-pulse">🐄</span>
              <p className="mt-2">Cargando...</p>
            </div>
          ) : recentMissions.length === 0 ? (
            <div className="p-8 text-center text-slate-500">
              <span className="material-icons-round text-4xl text-slate-300">inbox</span>
              <p className="mt-2">No hay misiones todavía</p>
              <p className="text-xs mt-1">Las misiones aparecerán aquí cuando FlytBase envíe datos</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {recentMissions.map((mission) => (
                <Link
                  key={mission.id}
                  href={`/mision/${mission.id}`}
                  className="flex items-center gap-4 p-4 hover:bg-slate-50 transition-colors group"
                >
                  <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 group-hover:bg-primary group-hover:text-white transition-colors">
                    <span className="material-icons-round">flight</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      {getStatusBadge(mission.status)}
                      <p className="font-medium text-slate-800 truncate">
                        {mission.missionName.replace('dlos_', '')}
                      </p>
                    </div>
                    <p className="text-xs text-slate-500 truncate">
                      {mission.siteName} • {formatDate(mission.createdAt)}
                    </p>
                  </div>
                  {mission.status === 'completed' && mission.totalCows !== undefined && (
                    <div className="text-right">
                      <p className="text-lg font-bold text-emerald-600">{mission.totalCows}</p>
                      <p className="text-xs text-slate-500">vacas</p>
                    </div>
                  )}
                  {mission.status === 'processing' && (
                    <div className="text-right">
                      <span className="text-xs font-bold text-blue-600 bg-blue-100 px-2 py-1 rounded animate-pulse">
                        Procesando
                      </span>
                    </div>
                  )}
                  <span className="material-icons-round text-slate-300 group-hover:text-primary transition-colors">
                    chevron_right
                  </span>
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* Quick Info */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-gradient-to-br from-primary to-cyan-600 p-6 rounded-2xl text-white">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="font-bold text-lg">¿Cómo funciona?</h3>
                <p className="text-white/70 text-sm mt-1">Sistema automático de detección</p>
              </div>
              <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
                <span className="material-icons-round text-2xl">auto_awesome</span>
              </div>
            </div>
            <ol className="space-y-2 text-sm text-white/90">
              <li className="flex items-center gap-2">
                <span className="w-5 h-5 bg-white/20 rounded-full flex items-center justify-center text-xs font-bold">1</span>
                FlytBase envía video del dron
              </li>
              <li className="flex items-center gap-2">
                <span className="w-5 h-5 bg-white/20 rounded-full flex items-center justify-center text-xs font-bold">2</span>
                GPU procesa con YOLO
              </li>
              <li className="flex items-center gap-2">
                <span className="w-5 h-5 bg-white/20 rounded-full flex items-center justify-center text-xs font-bold">3</span>
                Notificación en Telegram
              </li>
            </ol>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-slate-200">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="font-bold text-lg text-slate-800">Sistema DLOS.AI</h3>
                <p className="text-slate-500 text-sm mt-1">Estado de conexiones</p>
              </div>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between py-2">
                <span className="flex items-center gap-2 text-sm text-slate-600">
                  <span className="material-icons-round text-lg">cloud</span>
                  Firebase
                </span>
                <span className="flex items-center gap-1 text-emerald-600 text-sm font-medium">
                  <span className="w-2 h-2 bg-emerald-500 rounded-full"></span>
                  Conectado
                </span>
              </div>
              <div className="flex items-center justify-between py-2">
                <span className="flex items-center gap-2 text-sm text-slate-600">
                  <span className="material-icons-round text-lg">memory</span>
                  Vast.ai GPU
                </span>
                <span className="flex items-center gap-1 text-emerald-600 text-sm font-medium">
                  <span className="w-2 h-2 bg-emerald-500 rounded-full"></span>
                  Disponible
                </span>
              </div>
              <div className="flex items-center justify-between py-2">
                <span className="flex items-center gap-2 text-sm text-slate-600">
                  <span className="material-icons-round text-lg">send</span>
                  Telegram Bot
                </span>
                <span className="flex items-center gap-1 text-emerald-600 text-sm font-medium">
                  <span className="w-2 h-2 bg-emerald-500 rounded-full"></span>
                  Activo
                </span>
              </div>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}