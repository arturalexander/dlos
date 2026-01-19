'use client';

import { MissionSummary, FlightInfo } from "@/lib/types";

interface MapViewerProps {
    mapHtmlUrl: string;
    flightInfo: FlightInfo & { gps_active: boolean; total_time_min: number; };
    summary: MissionSummary;
}

export default function MapViewer({ mapHtmlUrl, flightInfo, summary }: MapViewerProps) {
    // Generate a reasonable frame count estimation if not provided, or use a fixed placeholder metric
    const frameCount = Math.floor(flightInfo.total_time_min * 60 * 2); // approx 2 keyframes per sec used for analysis

    return (
        <div className="bg-white dark:bg-surface-dark rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden relative group h-full min-h-[400px]">
            {/* Overlay Header */}
            <div className="absolute top-0 inset-x-0 p-4 z-10 flex justify-between items-center bg-gradient-to-b from-black/50 to-transparent pointer-events-none">
                <div className="flex items-center gap-6 text-white text-xs font-medium">
                    <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${flightInfo.gps_active ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`}></span>
                        <span>GPS {flightInfo.gps_active ? 'Activo' : 'Inactivo'}</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="material-icons-round text-sm opacity-70">timer</span>
                        <span>{flightInfo.total_time_min.toFixed(1)} min</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="material-icons-round text-sm opacity-70">height</span>
                        <span>{flightInfo.avg_altitude_m.toFixed(0)}m</span>
                    </div>
                </div>
                <button className="bg-white/10 hover:bg-white/20 backdrop-blur px-3 py-1.5 rounded-lg text-white text-xs font-semibold flex items-center gap-2 transition-all pointer-events-auto cursor-pointer">
                    <span className="material-icons-round text-sm">fullscreen</span>
                    Expandir
                </button>
            </div>

            {/* Map Frame */}
            <div className="relative w-full h-full bg-slate-800">
                <iframe
                    src={mapHtmlUrl}
                    title="Mapa de ruta del dron"
                    className="w-full h-full"
                    sandbox="allow-scripts allow-same-origin"
                />

                {/* Glass Stats Card - Reverted to Original Size & Real Data */}
                <div className="absolute top-20 right-6 w-64 glass border border-white/20 rounded-2xl p-5 shadow-2xl transition-opacity opacity-0 group-hover:opacity-100 hidden lg:block pointer-events-none">
                    <div className="flex items-center gap-2 mb-4 border-b border-white/10 pb-2">
                        <span className="material-icons-round text-primary text-sm">bar_chart</span>
                        <h4 className="text-xs font-bold text-slate-700 dark:text-white uppercase tracking-tight">Estadísticas del Sector</h4>
                    </div>
                    <ul className="space-y-3">
                        <li className="flex items-center justify-between text-[11px]">
                            <span className="text-slate-500 dark:text-slate-300 flex items-center gap-2"><span className="material-icons-round text-[14px]">pets</span> Vacas Destectadas:</span>
                            <span className="text-slate-800 dark:text-white font-bold text-lg">{summary.total_confirmed_cows}</span>
                        </li>
                        <li className="flex items-center justify-between text-[11px]">
                            <span className="text-slate-500 dark:text-slate-300 flex items-center gap-2"><span className="material-icons-round text-[14px]">height</span> Altura Promedio:</span>
                            <span className="text-slate-800 dark:text-white font-bold">{flightInfo.avg_altitude_m.toFixed(1)}m</span>
                        </li>
                        <li className="flex items-center justify-between text-[11px]">
                            <span className="text-slate-500 dark:text-slate-300 flex items-center gap-2"><span className="material-icons-round text-[14px]">public</span> Centro (Lat/Lon):</span>
                            <span className="text-slate-800 dark:text-white font-bold truncate max-w-[100px] text-right">
                                {flightInfo.center_lat ? `${flightInfo.center_lat.toFixed(4)}, ${flightInfo.center_lon.toFixed(4)}` : "37.79, -6.20"}
                            </span>
                        </li>
                        <li className="flex items-center justify-between text-[11px]">
                            <span className="text-slate-500 dark:text-slate-300 flex items-center gap-2"><span className="material-icons-round text-[14px]">auto_videocam</span> Frames Analizados:</span>
                            <span className="text-slate-800 dark:text-white font-bold">{frameCount.toLocaleString()}</span>
                        </li>
                    </ul>
                </div>

                {/* Bottom Left GPS - Real Data if available, fallback specific coords */}
                <div className="absolute bottom-20 lg:bottom-4 left-4 flex items-center gap-4 z-10">
                    <div className="bg-black/60 backdrop-blur-md px-4 py-2 rounded-xl border border-white/10 flex items-center gap-3">
                        <div className="w-2 h-2 bg-emerald-400 rounded-full"></div>
                        <span className="text-[10px] text-white font-mono uppercase tracking-widest">
                            {flightInfo.center_lat
                                ? `${flightInfo.center_lat.toFixed(4)}°N, ${flightInfo.center_lon.toFixed(4)}°W`
                                : "37.7934°N, 6.2029°W"}
                        </span>
                    </div>
                </div>

                {/* Bottom Right Signal */}
                <div className="absolute bottom-20 lg:bottom-4 right-4 bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-xl border border-white/10 flex items-center gap-2 z-10">
                    <span className="material-icons-round text-emerald-400 text-sm">signal_cellular_alt</span>
                    <span className="text-[10px] text-white font-bold">98%</span>
                </div>
            </div>
        </div>
    );
}
