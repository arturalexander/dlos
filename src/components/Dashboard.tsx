'use client';

import { MissionSummary, FlightInfo, Captures } from '@/lib/types';

interface DashboardProps {
    summary: MissionSummary;
    flightInfo: FlightInfo;
    captures: Captures;
}

function getDensityLevel(avgDist: number): { level: string; percent: number; color: string } {
    if (avgDist < 100) return { level: 'Alta', percent: 85, color: 'bg-emerald-400' };
    if (avgDist < 200) return { level: 'Media', percent: 50, color: 'bg-accent-orange' };
    return { level: 'Baja', percent: 25, color: 'bg-red-400' };
}

export default function Dashboard({ summary, flightInfo, captures }: DashboardProps) {
    const density = getDensityLevel(captures.most_grouped?.avg_dist || 200);
    const hasLoneCow = captures.lone_cow && captures.lone_cow.frame > 0;
    const coveragePercent = Math.min(100, Math.round((summary.visited_zones / 50) * 100));

    return (
        <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* KPI 1: Inventario */}
            <div className="bg-white dark:bg-surface-dark p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm transition-all hover:shadow-md">
                <div className="flex justify-between items-start mb-4">
                    <div className="p-2 bg-emerald-500/10 text-emerald-500 rounded-lg">
                        <span className="material-icons-round">pets</span>
                    </div>
                    <span className="text-[10px] font-bold text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded uppercase">Activo</span>
                </div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Inventario</p>
                <div className="flex items-baseline gap-2">
                    <h3 className="text-3xl font-bold dark:text-white">{summary.total_confirmed_cows}</h3>
                    <span className="text-sm text-slate-500 font-medium">cabezas</span>
                </div>
            </div>

            {/* KPI 2: Alertas */}
            <div className={`bg-white dark:bg-surface-dark p-6 rounded-2xl border-2 ${hasLoneCow ? 'border-accent-orange/30 card-glow-orange' : 'border-slate-200 dark:border-slate-800'} shadow-sm relative overflow-hidden transition-all hover:shadow-md`}>
                {hasLoneCow && <div className="absolute top-0 right-0 w-24 h-24 bg-accent-orange/5 rounded-full -mr-8 -mt-8"></div>}
                <div className="flex justify-between items-start mb-4">
                    <div className={`p-2 rounded-lg ${hasLoneCow ? 'bg-accent-orange/10 text-accent-orange' : 'bg-slate-100 text-slate-400'}`}>
                        <span className="material-icons-round">warning</span>
                    </div>
                    {hasLoneCow && <div className="w-2 h-2 bg-accent-orange rounded-full animate-pulse"></div>}
                </div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Alertas Activas</p>
                <div className="flex items-baseline gap-2">
                    <h3 className={`text-3xl font-bold ${hasLoneCow ? 'text-accent-orange' : 'dark:text-white'}`}>
                        {hasLoneCow ? '1' : '0'}
                    </h3>
                    {hasLoneCow && (
                        <span className="text-xs font-semibold text-accent-orange uppercase bg-accent-orange/10 px-2 py-0.5 rounded">Vaca Aislada</span>
                    )}
                </div>
            </div>

            {/* KPI 3: Cobertura */}
            <div className="bg-white dark:bg-surface-dark p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm transition-all hover:shadow-md">
                <div className="flex justify-between items-start mb-4">
                    <div className="p-2 bg-blue-500/10 text-blue-500 rounded-lg">
                        <span className="material-icons-round">explore</span>
                    </div>
                </div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Cobertura</p>
                <div className="flex flex-col gap-2">
                    <h3 className="text-3xl font-bold dark:text-white">{coveragePercent}%</h3>
                    <div className="w-full bg-slate-100 dark:bg-slate-700 h-1.5 rounded-full">
                        <div
                            className="bg-primary h-full rounded-full shadow-[0_0_8px_rgba(6,182,212,0.4)] transition-all duration-1000"
                            style={{ width: `${coveragePercent}%` }}
                        />
                    </div>
                </div>
            </div>

            {/* KPI 4: Densidad */}
            <div className="bg-white dark:bg-surface-dark p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm transition-all hover:shadow-md">
                <div className="flex justify-between items-start mb-4">
                    <div className="p-2 bg-purple-500/10 text-purple-500 rounded-lg">
                        <span className="material-icons-round">grid_view</span>
                    </div>
                </div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Densidad</p>
                <div className="flex flex-col gap-2">
                    <h3 className="text-3xl font-bold dark:text-white">{density.level}</h3>
                    <div className="w-full bg-slate-100 dark:bg-slate-700 h-1.5 rounded-full overflow-hidden">
                        <div
                            className={`${density.color} h-full transition-all duration-1000`}
                            style={{ width: `${density.percent}%` }}
                        />
                    </div>
                </div>
            </div>
        </section>
    );
}
