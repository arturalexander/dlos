'use client';

import { useState, useEffect } from 'react';
import { collection, query, orderBy, getDocs } from 'firebase/firestore';
import { formatDate } from '@/lib/utils';
import { db } from '@/lib/firebase';
import Link from 'next/link';

// Farm coordinates — Cáceres
const FARM_LAT = 39.928;
const FARM_LON = -5.653;

// WMO weather code → icon + description
function getWeatherInfo(code: number): { icon: string; desc: string } {
  if (code === 0)  return { icon: 'wb_sunny',         desc: 'Despejado' };
  if (code <= 3)   return { icon: 'partly_cloudy_day', desc: 'Parcialmente nublado' };
  if (code <= 48)  return { icon: 'foggy',             desc: 'Niebla' };
  if (code <= 67)  return { icon: 'rainy',             desc: 'Lluvia' };
  if (code <= 77)  return { icon: 'ac_unit',           desc: 'Nieve' };
  if (code <= 82)  return { icon: 'water_drop',        desc: 'Chubascos' };
  return              { icon: 'thunderstorm',           desc: 'Tormenta' };
}

// Simplified fire risk index (0–100) based on temperature, humidity, wind
function calcFireRisk(temp: number, humidity: number, windKmh: number) {
  const tF = Math.max(0, Math.min(1, (temp - 15) / 25));        // peaks at 40 °C
  const hF = Math.max(0, Math.min(1, (85 - humidity) / 65));    // peaks at 20 % RH
  const wF = Math.max(0, Math.min(1, windKmh / 60));            // peaks at 60 km/h
  const score = Math.round((tF * 0.45 + hF * 0.40 + wF * 0.15) * 100);

  if (score >= 70) return { level: 'EXTREMO',  score, textColor: 'text-red-600',    bgColor: 'bg-red-50',    borderColor: 'border-red-200',    barColor: 'bg-red-500',    dotColor: 'bg-red-500' };
  if (score >= 50) return { level: 'ALTO',     score, textColor: 'text-orange-600', bgColor: 'bg-orange-50', borderColor: 'border-orange-200', barColor: 'bg-orange-500', dotColor: 'bg-orange-500' };
  if (score >= 25) return { level: 'MODERADO', score, textColor: 'text-yellow-700', bgColor: 'bg-yellow-50', borderColor: 'border-yellow-200', barColor: 'bg-yellow-500', dotColor: 'bg-yellow-500' };
  return                   { level: 'BAJO',    score, textColor: 'text-emerald-600', bgColor: 'bg-emerald-50', borderColor: 'border-emerald-200', barColor: 'bg-emerald-500', dotColor: 'bg-emerald-500' };
}

interface WeatherData {
  temperature: number;
  humidity: number;
  windSpeed: number;
  weatherCode: number;
  precipitation: number;
}

interface RecentMission {
  id: string;
  missionName: string;
  siteName: string;
  status: string;
  totalCows?: number;
  createdAt: any;
  analysisStatus?: string;
}

interface Stats {
  totalMissions: number;
  completedMissions: number;
  totalCows: number;
  processingNow: number;
}

export default function Home() {
  const [recentMissions, setRecentMissions] = useState<RecentMission[]>([]);
  const [stats, setStats] = useState<Stats>({ totalMissions: 0, completedMissions: 0, totalCows: 0, processingNow: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    loadData();
    loadWeather();
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const loadWeather = async () => {
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${FARM_LAT}&longitude=${FARM_LON}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code,precipitation&timezone=Europe%2FMadrid&wind_speed_unit=kmh`;
      const res = await fetch(url);
      const data = await res.json();
      const c = data.current;
      setWeather({
        temperature:  Math.round(c.temperature_2m),
        humidity:     Math.round(c.relative_humidity_2m),
        windSpeed:    Math.round(c.wind_speed_10m),
        weatherCode:  c.weather_code,
        precipitation: c.precipitation,
      });
    } catch {
      // weather is non-critical
    }
  };

  const loadData = async () => {
    try {
      // Single query for all missions — derive both recent list and stats from it
      const q = query(collection(db, 'processing_jobs'), orderBy('createdAt', 'desc'));
      const snapshot = await getDocs(q);

      const allDocs = snapshot.docs;
      let totalCows = 0, completed = 0, processing = 0;
      const missions: RecentMission[] = [];

      allDocs.forEach((doc) => {
        const data = doc.data();
        if (missions.length < 6) {
          missions.push({
            id: doc.id,
            missionName: data.missionName || 'Sin nombre',
            siteName: data.siteName || 'Sin sitio',
            status: data.status || 'unknown',
            totalCows: data.results?.totalCows,
            createdAt: data.createdAt,
            analysisStatus: data.analysisStatus,
          });
        }
        if (data.status === 'completed') { completed++; totalCows += data.results?.totalCows || 0; }
        if (['processing', 'starting', 'queued'].includes(data.status)) processing++;
      });

      setRecentMissions(missions);
      setStats({ totalMissions: allDocs.length, completedMissions: completed, totalCows, processingNow: processing });
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const fmtDate = (ts: any) => formatDate(ts, /* short */ true);

  const fireRisk    = weather ? calcFireRisk(weather.temperature, weather.humidity, weather.windSpeed) : null;
  const weatherInfo = weather ? getWeatherInfo(weather.weatherCode) : null;
  const dateStr     = now.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
  const timeStr     = now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

  return (
    <>
      {/* ── Header ── */}
      <header className="h-16 border-b border-slate-200 flex items-center justify-between px-4 lg:px-8 bg-white/80 backdrop-blur-md shrink-0 sticky top-0 z-40">
        <div>
          <h2 className="text-xl font-bold leading-tight">Dashboard</h2>
          <p className="text-xs text-slate-500 capitalize hidden sm:block">{dateStr} · {timeStr}</p>
        </div>
        <div className="flex items-center gap-2 lg:gap-3">
          {/* Fire risk badge shown when high/extreme */}
          {fireRisk && (fireRisk.level === 'ALTO' || fireRisk.level === 'EXTREMO') && (
            <div className={`hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border ${fireRisk.bgColor} ${fireRisk.textColor} ${fireRisk.borderColor} ring-pulse-orange`}>
              <span className="material-icons-round text-sm">local_fire_department</span>
              Riesgo {fireRisk.level}
            </div>
          )}
          {stats.processingNow > 0 && (
            <div className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-blue-50 text-blue-600 border border-blue-200">
              <span className="material-icons-round text-sm animate-spin" style={{ animationDuration: '2s' }}>sync</span>
              {stats.processingNow} procesando
            </div>
          )}
          <Link
            href="/misiones"
            className="flex items-center gap-2 bg-primary/10 text-primary px-3 py-2 rounded-xl font-semibold hover:bg-primary/20 transition-colors text-sm"
          >
            <span className="material-icons-round text-base">flight_takeoff</span>
            <span className="hidden md:inline">Ver Misiones</span>
          </Link>
        </div>
      </header>

      {/* ── Content ── */}
      <div className="flex-1 overflow-y-auto p-4 lg:p-8 space-y-6 hide-scrollbar pb-24 lg:pb-8">

        {/* Stats row */}
        <section className="grid grid-cols-2 md:grid-cols-4 gap-3 lg:gap-4">
          <StatCard icon="pets"         iconBg="bg-emerald-500/10" iconColor="text-emerald-600" label="Vacas Detectadas"  value={isLoading ? null : stats.totalCows}            sub="total histórico" />
          <StatCard icon="flight_takeoff" iconBg="bg-blue-500/10"  iconColor="text-blue-600"   label="Misiones"          value={isLoading ? null : stats.completedMissions}   sub="completadas" />
          <StatCard icon="sync"         iconBg="bg-purple-500/10"  iconColor="text-purple-600" label="En Proceso"        value={isLoading ? null : stats.processingNow}        sub="ahora"  badge={stats.processingNow > 0 ? 'ACTIVO' : undefined} badgeColor="text-purple-600 bg-purple-50 border border-purple-200" pulseBadge />
          <StatCard icon="calculate"    iconBg="bg-orange-500/10"  iconColor="text-orange-600" label="Promedio"          value={isLoading || stats.completedMissions === 0 ? null : Math.round(stats.totalCows / stats.completedMissions)} sub="vacas/misión" />
        </section>

        {/* Main 2-col grid */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-5">

          {/* Left — recent missions */}
          <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <span className="material-icons-round text-primary text-lg">history</span>
                Misiones Recientes
              </h3>
              <Link href="/misiones" className="text-xs text-primary font-semibold hover:underline flex items-center gap-0.5">
                Ver todas <span className="material-icons-round text-sm">chevron_right</span>
              </Link>
            </div>

            {isLoading ? (
              <div className="p-6 space-y-3">
                {[1,2,3].map(i => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="skeleton w-9 h-9 rounded-xl" />
                    <div className="flex-1 space-y-1.5">
                      <div className="skeleton h-3.5 w-3/4" />
                      <div className="skeleton h-3 w-1/2" />
                    </div>
                  </div>
                ))}
              </div>
            ) : recentMissions.length === 0 ? (
              <div className="p-10 text-center text-slate-400">
                <span className="material-icons-round text-5xl text-slate-200">inbox</span>
                <p className="mt-3 font-medium">Sin misiones todavía</p>
                <p className="text-xs mt-1">Las misiones aparecerán cuando FlytBase envíe datos</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {recentMissions.map((m) => {
                  const isOk  = m.status === 'completed';
                  const isRun = m.status === 'processing' || m.status === 'starting';
                  const isFail = m.status === 'failed';
                  return (
                    <Link
                      key={m.id}
                      href={`/mision/${m.id}`}
                      className="flex items-center gap-3 px-5 py-3.5 hover:bg-slate-50 transition-colors group"
                    >
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-all ${
                        isOk  ? 'bg-emerald-50 text-emerald-600 group-hover:bg-emerald-500 group-hover:text-white' :
                        isRun ? 'bg-blue-50 text-blue-600' :
                        isFail? 'bg-red-50 text-red-500' :
                                'bg-slate-100 text-slate-500'
                      }`}>
                        <span className={`material-icons-round text-base ${isRun ? 'animate-spin' : ''}`} style={isRun ? { animationDuration: '2s' } : {}}>
                          {isOk ? 'check_circle' : isRun ? 'sync' : isFail ? 'error' : 'flight'}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm text-slate-800 truncate">
                          {m.missionName.replace('dlos_', '')}
                        </p>
                        <p className="text-xs text-slate-400 truncate">{m.siteName} · {fmtDate(m.createdAt)}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {isOk && m.totalCows !== undefined && (
                          <>
                            {m.analysisStatus === 'completed' && (
                              <span className="material-icons-round text-sm text-primary" title="Análisis IA completado">smart_toy</span>
                            )}
                            <div className="text-right">
                              <p className="text-base font-bold text-emerald-600">{m.totalCows}</p>
                              <p className="text-[10px] text-slate-400 font-bold uppercase">vacas</p>
                            </div>
                          </>
                        )}
                        {isRun && (
                          <span className="text-[11px] font-bold text-blue-600 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-lg animate-pulse">Procesando</span>
                        )}
                        {isFail && (
                          <span className="text-[11px] font-bold text-red-500 bg-red-50 border border-red-200 px-2 py-0.5 rounded-lg">Error</span>
                        )}
                      </div>
                      <span className="material-icons-round text-slate-200 group-hover:text-primary transition-colors">chevron_right</span>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right column */}
          <div className="flex flex-col gap-4">

            {/* Weather + Fire Risk */}
            <WeatherCard weather={weather} fireRisk={fireRisk} weatherInfo={weatherInfo} />

            {/* Quick access */}
            <div className="grid grid-cols-2 gap-3">
              <QuickLink href="/misiones" icon="flight_takeoff" label="Misiones"   color="bg-blue-500" />
              <QuickLink href="/agentes"  icon="smart_toy"      label="Agentes IA" color="bg-purple-500" />
              <QuickLink href="/mapa"     icon="map"            label="Mapa"       color="bg-emerald-500" />
              <QuickLink href="#"         icon="photo_library"  label="Capturas"   color="bg-orange-500" />
            </div>

            {/* System status */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
              <h4 className="font-bold text-xs text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <span className="material-icons-round text-sm">monitor_heart</span>
                Estado del Sistema
              </h4>
              <div className="space-y-2">
                {[
                  { icon: 'cloud',     label: 'Firebase'    },
                  { icon: 'memory',    label: 'Vast.ai GPU' },
                  { icon: 'smart_toy', label: 'Gemini AI'   },
                  { icon: 'send',      label: 'Telegram'    },
                ].map(s => (
                  <div key={s.label} className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-xs text-slate-600">
                      <span className="material-icons-round text-sm text-slate-400">{s.icon}</span>
                      {s.label}
                    </span>
                    <span className="flex items-center gap-1.5 text-emerald-600 text-xs font-semibold">
                      <span className="w-1.5 h-1.5 rounded-full dot-online" />
                      Activo
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Módulos del sistema — resumen de todo */}
        <section>
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2">
            <span className="material-icons-round text-sm">grid_view</span>
            Módulos del sistema
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <ModuleCard href="/misiones" icon="flight_takeoff" iconColor="bg-blue-500"    label="Detección IA"   sublabel="YOLO v8 · FlytBase"   status="online" metric={isLoading ? '—' : `${stats.completedMissions} misiones`} />
            <ModuleCard href="/agentes"  icon="smart_toy"      iconColor="bg-purple-500"  label="Agentes IA"     sublabel="Gemini 2.0 Flash"      status="online" metric="Análisis activo" />
            <ModuleCard href="/mapa"     icon="map"            iconColor="bg-emerald-500" label="Mapa Finca"     sublabel="16 vuelos · Cáceres"    status="online" metric={fireRisk ? `Riesgo ${fireRisk.level}` : 'Cargando...'} metricColor={fireRisk?.textColor} />
            <ModuleCard href="/mapa"     icon="local_fire_department" iconColor="bg-red-500"    label="Cámaras Fuego"  sublabel="4 cámaras · FLIR"      status="warning" metric="1 alerta activa" metricColor="text-orange-600" />
            <ModuleCard href="/mapa"     icon="notifications_active"  iconColor="bg-orange-500" label="Alertas"        sublabel="Telegram Multi-canal"  status="online" metric="Bot activo" />
            <ModuleCard href="#"         icon="memory"         iconColor="bg-slate-600"   label="GPU / YOLO"     sublabel="Vast.ai · RTX 4090"    status="online" metric="Disponible" />
          </div>
        </section>

        {/* Cómo funciona — compacto */}
        <section className="bg-gradient-to-br from-slate-900 to-slate-800 p-5 rounded-2xl text-white">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-bold text-sm">Pipeline de detección</h3>
              <p className="text-white/40 text-xs mt-0.5">Flujo automático end-to-end</p>
            </div>
            <div className="w-8 h-8 bg-white/10 rounded-xl flex items-center justify-center">
              <span className="material-icons-round text-base">auto_awesome</span>
            </div>
          </div>
          <div className="flex items-center gap-1 flex-wrap">
            {[
              { icon: 'flight',     label: 'Dron FlytBase' },
              { icon: 'memory',     label: 'GPU YOLO v8'   },
              { icon: 'smart_toy',  label: 'Gemini AI'     },
              { icon: 'send',       label: 'Telegram'      },
            ].map((s, i, arr) => (
              <div key={s.label} className="flex items-center gap-1">
                <div className="flex items-center gap-1.5 bg-white/10 px-3 py-1.5 rounded-lg">
                  <span className="material-icons-round text-sm text-white/60">{s.icon}</span>
                  <span className="text-xs font-semibold text-white/80">{s.label}</span>
                </div>
                {i < arr.length - 1 && (
                  <span className="material-icons-round text-white/25 text-sm">arrow_forward</span>
                )}
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function StatCard({ icon, iconBg, iconColor, label, value, sub, badge, badgeColor, pulseBadge }: {
  icon: string; iconBg: string; iconColor: string; label: string;
  value: number | null; sub: string; badge?: string; badgeColor?: string; pulseBadge?: boolean;
}) {
  return (
    <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-all">
      <div className="flex items-start justify-between mb-3">
        <div className={`p-2 ${iconBg} ${iconColor} rounded-xl`}>
          <span className="material-icons-round">{icon}</span>
        </div>
        {badge && (
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-lg ${badgeColor} ${pulseBadge ? 'animate-pulse' : ''}`}>
            {badge}
          </span>
        )}
      </div>
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">{label}</p>
      <div className="flex items-baseline gap-1.5">
        {value === null ? (
          <div className="skeleton h-8 w-16" />
        ) : (
          <h3 className="text-3xl font-black text-slate-900">{value}</h3>
        )}
        <span className="text-xs text-slate-400">{sub}</span>
      </div>
    </div>
  );
}

function WeatherCard({ weather, fireRisk, weatherInfo }: {
  weather: WeatherData | null;
  fireRisk: ReturnType<typeof calcFireRisk> | null;
  weatherInfo: { icon: string; desc: string } | null;
}) {
  if (!weather) {
    return (
      <div className="bg-gradient-to-br from-slate-800 to-slate-700 rounded-2xl p-5 text-white">
        <p className="text-xs text-white/50 font-semibold uppercase tracking-wider mb-3">Meteorología · Finca</p>
        <div className="flex items-center gap-2 text-white/50 text-sm">
          <div className="w-5 h-5 border-2 border-white/20 border-t-white/70 rounded-full animate-spin" />
          Cargando datos...
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      {/* Dark weather header */}
      <div className="bg-gradient-to-br from-slate-800 to-slate-700 p-4 text-white">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[10px] text-white/50 font-bold uppercase tracking-widest">Finca · Cáceres</p>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="text-4xl font-black">{weather.temperature}°</span>
              <span className="text-white/50 text-sm font-medium">C</span>
            </div>
          </div>
          <div className="text-right">
            <span className="material-icons-round text-5xl text-white/70">{weatherInfo?.icon}</span>
            <p className="text-xs text-white/50 mt-0.5">{weatherInfo?.desc}</p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 mt-3">
          {[
            { label: 'Hum.', value: `${weather.humidity}%` },
            { label: 'Viento', value: `${weather.windSpeed} km/h` },
            { label: 'Prec.', value: `${weather.precipitation} mm` },
          ].map(m => (
            <div key={m.label} className="bg-white/10 rounded-lg px-2 py-1.5 text-center">
              <p className="text-[9px] text-white/40 uppercase font-bold">{m.label}</p>
              <p className="text-sm font-bold">{m.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Fire risk bar */}
      {fireRisk && (
        <div className={`px-4 py-3 ${fireRisk.bgColor} border-t ${fireRisk.borderColor}`}>
          <div className="flex items-center justify-between mb-2">
            <span className={`flex items-center gap-1 text-xs font-bold ${fireRisk.textColor}`}>
              <span className="material-icons-round text-sm">local_fire_department</span>
              Riesgo de Incendio
            </span>
            <span className={`text-xs font-black px-2 py-0.5 rounded-md bg-white/80 ${fireRisk.textColor}`}>
              {fireRisk.level}
            </span>
          </div>
          <div className="h-1.5 bg-white/60 rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all duration-500 ${fireRisk.barColor}`} style={{ width: `${fireRisk.score}%` }} />
          </div>
          <p className={`text-[10px] mt-1.5 ${fireRisk.textColor} opacity-60`}>
            Índice {fireRisk.score}/100 · calculado con datos Open-Meteo
          </p>
        </div>
      )}
    </div>
  );
}

function QuickLink({ href, icon, label, color }: { href: string; icon: string; label: string; color: string }) {
  return (
    <Link href={href} className="bg-white rounded-xl border border-slate-200 p-3 hover:shadow-md transition-all flex items-center gap-2.5 group">
      <div className={`w-8 h-8 ${color} rounded-lg flex items-center justify-center text-white shrink-0 group-hover:scale-110 transition-transform`}>
        <span className="material-icons-round text-sm">{icon}</span>
      </div>
      <span className="text-sm font-semibold text-slate-700">{label}</span>
    </Link>
  );
}

function ModuleCard({ href, icon, iconColor, label, sublabel, status, metric, metricColor }: {
  href: string; icon: string; iconColor: string; label: string; sublabel: string;
  status: 'online' | 'warning' | 'offline'; metric: string; metricColor?: string;
}) {
  const statusDot = status === 'online' ? 'dot-online' : status === 'warning' ? 'dot-warning' : 'dot-offline';
  const statusLabel = status === 'online' ? 'Activo' : status === 'warning' ? 'Atención' : 'Offline';
  return (
    <Link href={href} className="bg-white rounded-xl border border-slate-200 p-3.5 hover:shadow-md transition-all group flex flex-col gap-2.5">
      <div className="flex items-start justify-between">
        <div className={`w-8 h-8 ${iconColor} rounded-lg flex items-center justify-center text-white group-hover:scale-110 transition-transform`}>
          <span className="material-icons-round text-sm">{icon}</span>
        </div>
        <div className="flex items-center gap-1">
          <span className={`w-1.5 h-1.5 rounded-full ${statusDot}`} />
          <span className="text-[9px] font-bold text-slate-400 uppercase">{statusLabel}</span>
        </div>
      </div>
      <div>
        <p className="text-xs font-bold text-slate-800 leading-tight">{label}</p>
        <p className="text-[10px] text-slate-400 mt-0.5 truncate">{sublabel}</p>
      </div>
      <p className={`text-[10px] font-semibold truncate ${metricColor || 'text-primary'}`}>{metric}</p>
    </Link>
  );
}
