'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState, useCallback, useRef } from 'react';
import type { MissionGeo, MapItem } from '@/components/galisancho/SateliteMap';

const SateliteMap = dynamic(() => import('@/components/galisancho/SateliteMap'), { ssr: false });

const LAT =  37.79234586219361;
const LNG = -6.204572703283015;

// Hook: detecta si el chat de Antonia está abierto (para ocultar botones solapados)
function useChatOpen() {
  const [chatOpen, setChatOpen] = useState(false);
  useEffect(() => {
    const handler = (e: Event) => setChatOpen((e as CustomEvent<{ open: boolean }>).detail.open);
    window.addEventListener('chatia:toggle', handler);
    return () => window.removeEventListener('chatia:toggle', handler);
  }, []);
  return chatOpen;
}

// ── Helpers de semana ─────────────────────────────────────────────────────────
function getWeekStart(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  return d;
}
function weekToISO(d: Date) { return d.toISOString().split('T')[0]; }
function formatWeekRange(weekStart: Date): string {
  const end = new Date(weekStart);
  end.setDate(end.getDate() + 6);
  const fmt = (d: Date) => d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
  return `${fmt(weekStart)} — ${fmt(end)} ${end.getFullYear()}`;
}
function fmtDate(iso: string) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });
}

// ── Meteorología ──────────────────────────────────────────────────────────────
interface Weather {
  temp: number; feels: number; humidity: number;
  wind: number; windDir: number; code: number; precip: number;
}
function wmoIcon(code: number) {
  if (code === 0)  return { icon: '☀️', label: 'Despejado' };
  if (code <= 2)   return { icon: '⛅', label: 'Parcialmente nublado' };
  if (code <= 3)   return { icon: '☁️', label: 'Nublado' };
  if (code <= 49)  return { icon: '🌫️', label: 'Niebla' };
  if (code <= 67)  return { icon: '🌧️', label: 'Lluvia' };
  if (code <= 77)  return { icon: '❄️', label: 'Nieve' };
  if (code <= 82)  return { icon: '🌦️', label: 'Chubascos' };
  return { icon: '⛈️', label: 'Tormenta' };
}
function calcFireRisk(temp: number, hum: number, wind: number) {
  const s = Math.round(
    (Math.max(0, Math.min(1, (temp - 15) / 25)) * 0.45 +
     Math.max(0, Math.min(1, (85 - hum) / 65))  * 0.40 +
     Math.max(0, Math.min(1, wind / 60))         * 0.15) * 100
  );
  if (s >= 70) return { label: 'Extremo',  color: 'text-red-600',    bg: 'bg-red-50',    score: s };
  if (s >= 50) return { label: 'Alto',     color: 'text-orange-600', bg: 'bg-orange-50', score: s };
  if (s >= 25) return { label: 'Moderado', color: 'text-yellow-600', bg: 'bg-yellow-50', score: s };
  return        { label: 'Bajo',      color: 'text-emerald-600', bg: 'bg-emerald-50', score: s };
}

// ── Opciones Pin ──────────────────────────────────────────────────────────────
const PIN_COLORS = ['#06b6d4', '#8b5cf6', '#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#f97316', '#ec4899'];
const PIN_ICONS = [
  { icon: 'place',          label: 'Ubicación'  },
  { icon: 'pets',           label: 'Animales'   },
  { icon: 'water_drop',     label: 'Agua'       },
  { icon: 'grass',          label: 'Pasto'      },
  { icon: 'home',           label: 'Casa'       },
  { icon: 'agriculture',    label: 'Cultivo'    },
  { icon: 'forest',         label: 'Arbolado'   },
  { icon: 'warning',        label: 'Aviso'      },
  { icon: 'flag',           label: 'Punto'      },
  { icon: 'star',           label: 'Favorito'   },
  { icon: 'fence',          label: 'Valla'      },
  { icon: 'local_hospital', label: 'Sanidad'    },
];

// ── Página ────────────────────────────────────────────────────────────────────
export default function GalisanchoMapaPage() {
  const chatOpen                          = useChatOpen();
  const [showInfo, setShowInfo]           = useState(false);
  const [weather, setWeather]             = useState<Weather | null>(null);
  const [now, setNow]                     = useState(new Date());
  const [missionFilter, setMissionFilter] = useState<'recent'|'today'|'week'|'month'|'custom'>('recent');
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo]     = useState('');
  const [filterLabel, setFilterLabel] = useState('Recientes');
  const [loadingVideo, setLoadingVideo] = useState<string | null>(null);
  const [missions, setMissions]           = useState<MissionGeo[]>([]);
  const [loadingM, setLoadingM]           = useState(false);
  const [selectedId, setSelectedId]       = useState<string | null>(null);
  const [flightTrack, setFlightTrack]     = useState<[number, number][]>([]);
  const [loadingT, setLoadingT]           = useState(false);

  // Capas / items
  const [mapItems, setMapItems]           = useState<MapItem[]>([]);
  const [showPins, setShowPins]           = useState(true);
  const [showAnnotations, setShowAnnotations] = useState(true);
  const [showHeatmap, setShowHeatmap]     = useState(true);
  const [showRoute, setShowRoute]         = useState(true);

  const [showLayers, setShowLayers]       = useState(false);

  // Modo crear
  const [createMenu, setCreateMenu]       = useState(false);
  const [placingMode, setPlacingMode]     = useState<'pin' | 'annotation' | null>(null);
  const [formType, setFormType]           = useState<'pin' | 'annotation' | null>(null);
  const [pendingCoords, setPendingCoords] = useState<{ lat: number; lng: number } | null>(null);

  // Formulario pin
  const [pinName, setPinName]             = useState('');
  const [pinColor, setPinColor]           = useState('#06b6d4');
  const [pinIcon, setPinIcon]             = useState('place');
  const [pinTag, setPinTag]               = useState('');

  // Formulario anotación
  const [annoText, setAnnoText]           = useState('');
  const [annoColor, setAnnoColor]         = useState('#06b6d4');

  const [saving, setSaving]               = useState(false);
  const [drawingPoints, setDrawingPoints] = useState<[number, number][]>([]);
  const finalizedPointsRef               = useRef<[number, number][]>([]); // captura síncrona al finalizar zona
  const [sidebarOpen, setSidebarOpen]     = useState(true);


  // Meteorología
  useEffect(() => {
    fetch(`https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LNG}&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,wind_direction_10m,weather_code,precipitation&timezone=Europe%2FMadrid&wind_speed_unit=kmh`)
      .then(r => r.json()).then(d => {
        const c = d.current;
        setWeather({ temp: Math.round(c.temperature_2m), feels: Math.round(c.apparent_temperature), humidity: Math.round(c.relative_humidity_2m), wind: Math.round(c.wind_speed_10m), windDir: Math.round(c.wind_direction_10m), code: c.weather_code, precip: c.precipitation });
      }).catch(() => {});
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  // Misiones con filtro
  const fetchMissions = useCallback(async (filter: string, from?: string, to?: string) => {
    setLoadingM(true);
    try {
      let url = `/api/missions/geo?filter=${filter}&limit=25`;
      if (filter === 'custom' && from) url += `&from=${from}`;
      if (filter === 'custom' && to)   url += `&to=${to}`;
      const r = await fetch(url);
      const d = await r.json();
      setMissions(d.missions ?? []);
    } catch { setMissions([]); }
    finally  { setLoadingM(false); }
  }, []);

  useEffect(() => {
    if (missionFilter === 'custom') return; // solo se lanza manualmente
    fetchMissions(missionFilter);
  }, [missionFilter, fetchMissions]);

  // Ruta GPS al seleccionar misión
  useEffect(() => {
    if (!selectedId) { setFlightTrack([]); return; }
    setLoadingT(true);
    fetch(`/api/missions/${selectedId}/track`)
      .then(r => r.json())
      .then(d => setFlightTrack(d.track ?? []))
      .catch(() => setFlightTrack([]))
      .finally(() => setLoadingT(false));
  }, [selectedId]);

  // Cargar map items
  const loadMapItems = useCallback(async () => {
    try {
      const r = await fetch('/api/map-items');
      const d = await r.json();
      setMapItems(d.items ?? []);
    } catch { /* silencioso */ }
  }, []);

  useEffect(() => { loadMapItems(); }, [loadMapItems]);

  // Guardar pin
  async function savePin() {
    if (!pendingCoords || !pinName.trim()) return;
    setSaving(true);
    try {
      await fetch('/api/map-items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'pin', name: pinName.trim(), color: pinColor, icon: pinIcon, tag: pinTag.trim(), lat: pendingCoords.lat, lng: pendingCoords.lng }),
      });
      await loadMapItems();
      closeForm();
    } finally { setSaving(false); }
  }

  // Guardar anotación
  async function saveAnnotation() {
    if (!pendingCoords || !annoText.trim()) return;
    setSaving(true);
    try {
      await fetch('/api/map-items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'annotation',
          name: annoText.trim(),
          color: annoColor,
          lat: pendingCoords.lat,
          lng: pendingCoords.lng,
          coordinates: finalizedPointsRef.current, // ref síncrono, inmune a race conditions
        }),
      });
      await loadMapItems();
      closeForm();
    } finally { setSaving(false); }
  }

  function closeForm() {
    setPendingCoords(null);
    setFormType(null);
    setDrawingPoints([]);
    setPinName(''); setPinColor('#06b6d4'); setPinIcon('place'); setPinTag('');
    setAnnoText(''); setAnnoColor('#06b6d4');
  }

  function handleMapClick(lat: number, lng: number) {
    if (formType === 'pin') {
      setPendingCoords({ lat, lng });
      setPlacingMode(null);
    } else if (formType === 'annotation') {
      setDrawingPoints(pts => [...pts, [lat, lng] as [number, number]]);
      // Keep placingMode active for more clicks
    }
  }

  function finalizeZone() {
    if (drawingPoints.length < 3) return;
    // Captura síncrona ANTES de cualquier re-render para evitar puntos extra por race condition
    finalizedPointsRef.current = [...drawingPoints];
    const pts = finalizedPointsRef.current;
    const lat = pts.reduce((s, p) => s + p[0], 0) / pts.length;
    const lng = pts.reduce((s, p) => s + p[1], 0) / pts.length;
    setPendingCoords({ lat, lng });
    setPlacingMode(null);
  }

  async function openVideo(missionId: string, videoS3Key: string) {
    setLoadingVideo(missionId);
    try {
      const r = await fetch(`/api/media/url?key=${encodeURIComponent(videoS3Key)}`);
      const d = await r.json();
      if (d.url) window.open(d.url, '_blank');
    } catch { /* silencioso */ }
    finally { setLoadingVideo(null); }
  }

  const deleteMapItem = useCallback(async (id: string) => {
    try {
      await fetch(`/api/map-items/${id}`, { method: 'DELETE' });
      await loadMapItems();
    } catch { /* silencioso */ }
  }, [loadMapItems]);

  const fr    = weather ? calcFireRisk(weather.temp, weather.humidity, weather.wind) : null;
  const wInfo = weather ? wmoIcon(weather.code) : { icon: '—', label: '...' };
  const timeStr = now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  const dateStr = now.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
  const totalCows     = missions.reduce((s, m) => s + m.totalCows, 0);
  const totalPersons  = missions.reduce((s, m) => s + (m.totalPersons  ?? 0), 0);
  const totalVehicles = missions.reduce((s, m) => s + (m.totalVehicles ?? 0), 0);

  return (
    <div className="flex-1 flex flex-col lg:flex-row h-full overflow-hidden bg-slate-50">

      {/* ── MAPA ── */}
      <div className="relative min-h-[300px] lg:min-h-0" style={{ flex: sidebarOpen ? '1' : '1 1 100%' }}>
        <SateliteMap
          missions={selectedId ? missions.filter(m => m.id === selectedId) : []}
          flightTrack={flightTrack}
          mapItems={mapItems}
          showPins={showPins}
          showAnnotations={showAnnotations}
          showCenters={false}
          showBounds={false}
          showHeatmap={showHeatmap}
          showRoute={showRoute}
          placingMode={placingMode}
          onMapClick={handleMapClick}
          drawingPoints={drawingPoints}
          onDelete={deleteMapItem}
        />

        {/* Badge finca — desktop siempre visible, mobile colapsable */}
        <div className="absolute top-4 left-4 z-10">
          <div className="hidden lg:block bg-white/95 backdrop-blur-sm rounded-2xl px-4 py-3 shadow-lg border border-slate-100">
            <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-0.5">Finca Galisancho</p>
            <p className="text-sm font-semibold text-slate-800">DJI Dock 3 + Matrice 4TD</p>
            <div className="flex items-center gap-1.5 mt-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-xs text-emerald-600 font-medium">Monitoreo activo</span>
            </div>
          </div>
          <div className="lg:hidden">
            <button
              onClick={() => setShowInfo(v => !v)}
              className="flex items-center gap-1.5 bg-white/95 backdrop-blur-sm rounded-xl px-3 py-2 shadow border border-slate-100 text-slate-700"
            >
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
              <span className="text-xs font-bold">Galisancho</span>
              <span className="material-icons-round text-sm text-slate-400">{showInfo ? 'expand_less' : 'expand_more'}</span>
            </button>
            {showInfo && (
              <div className="mt-1.5 bg-white/95 backdrop-blur-sm rounded-xl px-3 py-2.5 shadow-lg border border-slate-100">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Finca Galisancho</p>
                <p className="text-xs font-semibold text-slate-800">DJI Dock 3 + Matrice 4TD</p>
                <p className="text-[10px] text-emerald-600 font-medium mt-0.5">Monitoreo activo</p>
              </div>
            )}
          </div>
        </div>

        {/* ── Botón CREAR + Capas — esquina inferior derecha del mapa ── */}
        <div className="absolute bottom-4 right-4 z-10 flex flex-col items-end gap-2">

          {/* Panel Capas */}
          {showLayers && (
            <div className="bg-white/95 backdrop-blur-sm rounded-xl shadow-lg border border-slate-100 px-3 py-2.5 min-w-[170px]">
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Capas</p>
              {[
                { label: 'Mapa de calor', count: null,  active: showHeatmap,     set: setShowHeatmap },
                { label: 'Ruta de vuelo', count: null,  active: showRoute,       set: setShowRoute },
                { label: 'Pines',         count: mapItems.filter(i => i.type === 'pin').length,        active: showPins,        set: setShowPins },
                { label: 'Anotaciones',   count: mapItems.filter(i => i.type === 'annotation').length, active: showAnnotations, set: setShowAnnotations },
              ].map(({ label, count, active, set }) => (
                <div key={label} className="flex items-center gap-2 cursor-pointer mb-1.5 last:mb-0" onClick={() => set((v: boolean) => !v)}>
                  <div className={`w-9 h-5 rounded-full transition-colors relative shrink-0 ${active ? 'bg-cyan-500' : 'bg-slate-200'}`}>
                    <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${active ? 'left-4' : 'left-0.5'}`} />
                  </div>
                  <span className="text-xs font-semibold text-slate-700">{label}</span>
                  {count !== null && <span className="text-[10px] text-slate-400">({count})</span>}
                </div>
              ))}
            </div>
          )}

          {/* Menú crear */}
          {createMenu && (
            <div className="bg-white/95 backdrop-blur-sm rounded-xl shadow-lg border border-slate-100 overflow-hidden min-w-[160px]">
              <button
                onClick={() => { setPlacingMode('pin'); setFormType('pin'); setCreateMenu(false); }}
                className="w-full flex items-center gap-2.5 px-4 py-3 hover:bg-slate-50 transition-colors text-left"
              >
                <span className="material-icons-round text-lg text-cyan-500">place</span>
                <div>
                  <p className="text-xs font-bold text-slate-800">Pin</p>
                  <p className="text-[10px] text-slate-400">Marcador con nombre</p>
                </div>
              </button>
              <div className="h-px bg-slate-100" />
              <button
                onClick={() => { setFormType('annotation'); setPlacingMode('annotation'); setDrawingPoints([]); setCreateMenu(false); }}
                className="w-full flex items-center gap-2.5 px-4 py-3 hover:bg-slate-50 transition-colors text-left"
              >
                <span className="material-icons-round text-lg text-violet-500">draw</span>
                <div>
                  <p className="text-xs font-bold text-slate-800">Zona</p>
                  <p className="text-[10px] text-slate-400">Área dibujada en mapa</p>
                </div>
              </button>
            </div>
          )}

          <div className="flex gap-2">
            {/* Botón capas */}
            <button
              onClick={() => setShowLayers(v => !v)}
              className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-lg border transition-all ${showLayers ? 'bg-cyan-500 border-cyan-400 text-white' : 'bg-white/95 border-slate-200 text-slate-600 hover:text-cyan-500'}`}
              title="Capas"
            >
              <span className="material-icons-round text-xl">layers</span>
            </button>

            {/* Botón crear */}
            <button
              onClick={() => { setCreateMenu(v => !v); setPlacingMode(null); }}
              className={`flex items-center gap-2 px-4 h-10 rounded-xl shadow-lg border font-bold text-sm transition-all ${createMenu ? 'bg-slate-700 border-slate-600 text-white' : 'bg-white/95 border-slate-200 text-slate-700 hover:bg-slate-50'}`}
            >
              <span className="material-icons-round text-lg">{createMenu ? 'close' : 'add'}</span>
              Crear
            </button>
          </div>
        </div>

        {/* Toast modo colocación */}
        {placingMode && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 bg-slate-900/90 backdrop-blur text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-xl flex items-center gap-2">
            <span className="material-icons-round text-base animate-pulse text-cyan-400">
              {placingMode === 'pin' ? 'place' : 'draw'}
            </span>
            {placingMode === 'pin' ? 'Haz clic en el mapa para colocar el pin' : 'Haz clic para añadir puntos del área'}
            {placingMode !== 'annotation' && (
              <button onClick={() => { setPlacingMode(null); setFormType(null); }} className="ml-2 text-slate-400 hover:text-white">
                <span className="material-icons-round text-sm">close</span>
              </button>
            )}
          </div>
        )}

        {/* Finalizar zona — floating button when drawing annotation */}
        {formType === 'annotation' && drawingPoints.length >= 1 && !pendingCoords && (
          <div className="absolute bottom-20 right-4 z-20 flex flex-col items-end gap-2">
            <div className="bg-white/95 backdrop-blur-sm rounded-xl shadow-lg border border-slate-100 px-3 py-2 text-xs text-slate-500">
              <span className="font-bold text-violet-600">{drawingPoints.length}</span> puntos · {drawingPoints.length >= 3 ? 'Listo para cerrar' : `Añade ${3 - drawingPoints.length} más`}
            </div>
            {drawingPoints.length >= 3 && (
              <button
                onClick={finalizeZone}
                className="flex items-center gap-2 px-4 py-2.5 bg-violet-600 text-white rounded-xl font-bold text-sm shadow-lg"
              >
                <span className="material-icons-round text-base">check_circle</span>
                Cerrar zona
              </button>
            )}
            <button
              onClick={closeForm}
              className="flex items-center gap-2 px-3 py-2 bg-white/95 border border-slate-200 text-slate-500 rounded-xl font-semibold text-xs shadow"
            >
              <span className="material-icons-round text-sm">close</span>
              Cancelar
            </button>
          </div>
        )}

        {/* Toggle panel — móvil: pill sobre el nav bar; desktop: tab en el borde derecho */}
        {/* Móvil: siempre visible encima del nav bar */}
        <button
          onClick={() => setSidebarOpen(v => !v)}
          className={`lg:hidden fixed bottom-[72px] left-1/2 -translate-x-1/2 z-[60] flex items-center gap-1.5 bg-white/95 backdrop-blur-sm border border-slate-200 shadow-lg rounded-full px-4 py-2 text-slate-600 text-xs font-bold transition-all active:scale-95 ${chatOpen ? 'invisible pointer-events-none' : ''}`}
        >
          <span className="material-icons-round text-base">{sidebarOpen ? 'keyboard_arrow_down' : 'bar_chart'}</span>
          {sidebarOpen ? 'Ocultar panel' : 'Ver rutas'}
        </button>
        {/* Desktop: tab vertical en el borde derecho */}
        <button
          onClick={() => setSidebarOpen(v => !v)}
          className="hidden lg:flex absolute right-0 top-1/2 -translate-y-1/2 z-20 flex-col items-center justify-center bg-white border border-slate-200 shadow rounded-l-xl w-5 h-16 text-slate-400 hover:text-primary hover:bg-slate-50 transition-all"
          title={sidebarOpen ? 'Ocultar panel' : 'Mostrar panel'}
        >
          <span className="material-icons-round text-sm">{sidebarOpen ? 'chevron_right' : 'chevron_left'}</span>
        </button>

      </div>

      {/* ── MODAL CREAR PIN ── */}
      {pendingCoords && formType === 'pin' && (
        <div className="fixed inset-0 z-[70] flex items-end lg:items-center justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={closeForm} />
          <div className="relative bg-white rounded-t-2xl lg:rounded-2xl shadow-2xl w-full max-w-sm mx-0 lg:mx-4 p-5 pb-10 lg:pb-5 z-10 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="material-icons-round text-cyan-500">place</span>
                <h2 className="font-black text-slate-900">Nuevo pin</h2>
              </div>
              <button onClick={closeForm} className="text-slate-400 hover:text-slate-600">
                <span className="material-icons-round">close</span>
              </button>
            </div>

            <div className="text-[10px] text-slate-400 font-mono mb-4 bg-slate-50 rounded-lg px-3 py-1.5">
              {pendingCoords.lat.toFixed(5)}°N, {pendingCoords.lng.toFixed(5)}°E
            </div>

            {/* Nombre */}
            <div className="mb-4">
              <label className="text-xs font-bold text-slate-600 uppercase tracking-wide block mb-1.5">Nombre *</label>
              <input
                type="text"
                value={pinName}
                onChange={e => setPinName(e.target.value)}
                placeholder="Ej. Charca norte, Punto de control..."
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100"
                autoFocus
              />
            </div>

            {/* Color */}
            <div className="mb-4">
              <label className="text-xs font-bold text-slate-600 uppercase tracking-wide block mb-1.5">Color</label>
              <div className="flex gap-2 flex-wrap">
                {PIN_COLORS.map(c => (
                  <button
                    key={c}
                    onClick={() => setPinColor(c)}
                    className={`w-7 h-7 rounded-full transition-transform hover:scale-110 ${pinColor === c ? 'ring-2 ring-offset-2 ring-slate-400 scale-110' : ''}`}
                    style={{ background: c }}
                  />
                ))}
              </div>
            </div>

            {/* Icono */}
            <div className="mb-4">
              <label className="text-xs font-bold text-slate-600 uppercase tracking-wide block mb-1.5">Icono</label>
              <div className="grid grid-cols-6 gap-1.5">
                {PIN_ICONS.map(({ icon, label }) => (
                  <button
                    key={icon}
                    onClick={() => setPinIcon(icon)}
                    title={label}
                    className={`w-full aspect-square rounded-xl flex items-center justify-center transition-all ${pinIcon === icon ? 'ring-2 ring-offset-1 text-white' : 'bg-slate-100 hover:bg-slate-200 text-slate-600'}`}
                    style={pinIcon === icon ? { background: pinColor, boxShadow: `0 0 0 2px ${pinColor}44` } : {}}
                  >
                    <span className="material-icons-round text-lg">{icon}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Tag */}
            <div className="mb-5">
              <label className="text-xs font-bold text-slate-600 uppercase tracking-wide block mb-1.5">Etiqueta <span className="text-slate-300 font-normal normal-case">(opcional)</span></label>
              <input
                type="text"
                value={pinTag}
                onChange={e => setPinTag(e.target.value)}
                placeholder="Ej. zona-norte, urgente..."
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100"
              />
            </div>

            {/* Preview */}
            <div className="mb-4 flex items-center gap-3 bg-slate-50 rounded-xl p-3">
              <div className="w-10 h-10 rounded-full flex items-center justify-center border-2 border-white shadow" style={{ background: pinColor }}>
                <span className="material-icons-round text-white text-xl">{pinIcon}</span>
              </div>
              <div>
                <p className="text-sm font-bold text-slate-800">{pinName || 'Nombre del pin'}</p>
                {pinTag && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md" style={{ background: pinColor + '22', color: pinColor }}>{pinTag}</span>}
              </div>
            </div>

            <button
              onClick={savePin}
              disabled={!pinName.trim() || saving}
              className="w-full py-3 rounded-xl font-bold text-sm text-white transition-all disabled:opacity-40"
              style={{ background: pinName.trim() ? pinColor : '#94a3b8' }}
            >
              {saving ? 'Guardando...' : 'Guardar pin'}
            </button>
          </div>
        </div>
      )}

      {/* ── MODAL CREAR ANOTACIÓN ── */}
      {pendingCoords && formType === 'annotation' && (
        <div className="fixed inset-0 z-[70] flex items-end lg:items-center justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={closeForm} />
          <div className="relative bg-white rounded-t-2xl lg:rounded-2xl shadow-2xl w-full max-w-sm mx-0 lg:mx-4 p-5 pb-10 lg:pb-5 z-10">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="material-icons-round text-violet-500">draw</span>
                <h2 className="font-black text-slate-900">Nueva zona</h2>
              </div>
              <button onClick={closeForm} className="text-slate-400 hover:text-slate-600">
                <span className="material-icons-round">close</span>
              </button>
            </div>

            <div className="text-[10px] text-slate-400 font-mono mb-4 bg-slate-50 rounded-lg px-3 py-1.5">
              {pendingCoords.lat.toFixed(5)}°N, {pendingCoords.lng.toFixed(5)}°E
            </div>

            <div className="mb-4">
              <label className="text-xs font-bold text-slate-600 uppercase tracking-wide block mb-1.5">Texto *</label>
              <input
                type="text"
                value={annoText}
                onChange={e => setAnnoText(e.target.value)}
                placeholder="Ej. Venados echados, Charca..."
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
                autoFocus
              />
            </div>

            <div className="mb-5">
              <label className="text-xs font-bold text-slate-600 uppercase tracking-wide block mb-1.5">Color</label>
              <div className="flex gap-2 flex-wrap">
                {PIN_COLORS.map(c => (
                  <button
                    key={c}
                    onClick={() => setAnnoColor(c)}
                    className={`w-7 h-7 rounded-full transition-transform hover:scale-110 ${annoColor === c ? 'ring-2 ring-offset-2 ring-slate-400 scale-110' : ''}`}
                    style={{ background: c }}
                  />
                ))}
              </div>
            </div>

            {/* Preview */}
            <div className="mb-4 flex justify-center">
              <div className="flex flex-col items-center">
                <div className="bg-white border-2 rounded-lg px-3 py-1.5 text-sm font-bold shadow-md" style={{ borderColor: annoColor, color: '#0f172a' }}>
                  {annoText || 'Texto de la anotación'}
                </div>
                <div className="w-0.5 h-3" style={{ background: annoColor }} />
                <div className="w-1.5 h-1.5 rounded-full" style={{ background: annoColor }} />
              </div>
            </div>

            <button
              onClick={saveAnnotation}
              disabled={!annoText.trim() || saving}
              className="w-full py-3 rounded-xl font-bold text-sm text-white transition-all disabled:opacity-40"
              style={{ background: annoText.trim() ? annoColor : '#94a3b8' }}
            >
              {saving ? 'Guardando...' : 'Guardar zona'}
            </button>
          </div>
        </div>
      )}

      {/* ── PANEL LATERAL — collapsible ── */}
      {sidebarOpen && (
      <div className="w-full lg:w-80 xl:w-96 bg-white border-t lg:border-t-0 lg:border-l border-slate-200 flex flex-col overflow-hidden max-h-[50vh] lg:max-h-none">

        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-base font-black text-slate-900">Mapa de la finca</h1>
              <p className="text-xs text-slate-400 capitalize">{dateStr}</p>
            </div>
            <div className="text-right">
              <p className="text-xl font-black text-slate-900 font-mono">{timeStr}</p>
              <div className="flex items-center gap-1 justify-end mt-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                <span className="text-[10px] text-emerald-600 font-bold uppercase tracking-wide">En vivo</span>
              </div>
            </div>
          </div>
        </div>

        {/* Rutas de vuelo — header + filtro */}
        <div className="px-5 py-3 border-b border-slate-100 shrink-0">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Rutas de vuelo</p>
            {/* Filtro */}
            <div className="relative">
              <button
                onClick={() => setShowFilterMenu(v => !v)}
                className="flex items-center gap-1 text-[11px] font-semibold text-slate-500 hover:text-primary transition-colors bg-slate-100 hover:bg-primary/5 rounded-lg px-2.5 py-1"
              >
                <span className="material-icons-round text-sm">tune</span>
                {filterLabel}
              </button>
              {showFilterMenu && (
                <div className="absolute right-0 top-8 z-30 bg-white rounded-xl shadow-xl border border-slate-100 overflow-hidden w-44">
                  {([
                    ['recent', 'Recientes'],
                    ['today',  'Hoy'],
                    ['week',   'Esta semana'],
                    ['month',  'Este mes'],
                  ] as const).map(([val, label]) => (
                    <button
                      key={val}
                      onClick={() => { setMissionFilter(val); setFilterLabel(label); setShowFilterMenu(false); }}
                      className={`w-full text-left px-3 py-2 text-xs font-semibold transition-colors ${filterLabel === label ? 'bg-primary/10 text-primary' : 'hover:bg-slate-50 text-slate-600'}`}
                    >
                      {label}
                    </button>
                  ))}
                  <div className="border-t border-slate-100 px-3 py-2.5 space-y-1.5">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Rango de fechas</p>
                    <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                      className="w-full text-[11px] border border-slate-200 rounded-lg px-2 py-1.5 text-slate-700" />
                    <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                      className="w-full text-[11px] border border-slate-200 rounded-lg px-2 py-1.5 text-slate-700" />
                    <button
                      onClick={() => { if (dateFrom || dateTo) { setMissionFilter('custom'); setFilterLabel(`${dateFrom} → ${dateTo}`); setShowFilterMenu(false); fetchMissions('custom', dateFrom, dateTo); } }}
                      disabled={!dateFrom && !dateTo}
                      className="w-full text-[11px] font-bold bg-primary text-white rounded-lg py-1.5 hover:bg-primary/90 transition-colors disabled:opacity-40"
                    >
                      Buscar
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {!loadingM && missions.length > 0 && (
            <div className="space-y-1.5">
              <div className="grid grid-cols-4 gap-1.5">
                <div className="bg-primary/5 rounded-xl p-2 text-center">
                  <p className="text-sm font-black text-primary">{missions.length}</p>
                  <p className="text-[9px] text-slate-500 font-semibold">vuelos</p>
                </div>
                <div className="bg-emerald-50 rounded-xl p-2 text-center">
                  <p className="text-sm font-black text-emerald-600">{totalCows}</p>
                  <p className="text-[9px] text-slate-500 font-semibold">vacas</p>
                </div>
                <div className="bg-blue-50 rounded-xl p-2 text-center">
                  <p className="text-sm font-black text-blue-600">{totalPersons}</p>
                  <p className="text-[9px] text-slate-500 font-semibold">personas</p>
                </div>
                <div className="bg-orange-50 rounded-xl p-2 text-center">
                  <p className="text-sm font-black text-orange-600">{totalVehicles}</p>
                  <p className="text-[9px] text-slate-500 font-semibold">vehículos</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Lista de misiones */}
        <div className="flex-1 overflow-y-auto">
          {loadingM ? (
            <div className="px-5 py-4 space-y-3">
              {[1, 2, 3].map(i => <div key={i} className="h-14 bg-slate-100 rounded-xl animate-pulse" />)}
            </div>
          ) : missions.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <span className="material-icons-round text-4xl text-slate-200 mb-3">flight_takeoff</span>
              <p className="text-sm font-bold text-slate-400">Sin misiones</p>
              <p className="text-xs text-slate-300 mt-1">Cambia el filtro para ver misiones anteriores</p>
            </div>
          ) : (
            <div className="px-5 py-4 space-y-2">
              {missions.map((m, i) => {
                const color = '#007BFF';
                const isSelected = selectedId === m.id;
                const dayFmt = (d: string) => d ? new Date(d).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }).toUpperCase() : '';
                const dayKey  = dayFmt(m.date);
                const prevKey = i > 0 ? dayFmt(missions[i - 1].date) : '';
                const showHeader = dayKey && dayKey !== prevKey;
                return (
                  <div key={m.id}>
                    {showHeader && (
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-3 mb-1 first:mt-0">{dayKey}</p>
                    )}
                    <button
                      onClick={() => setSelectedId(isSelected ? null : m.id)}
                      className={`w-full text-left px-3 py-3 rounded-xl border transition-all ${isSelected ? 'border-primary/40 bg-primary/5 shadow-sm' : 'border-slate-100 hover:border-slate-200 hover:bg-slate-50'}`}
                    >
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-10 rounded-full shrink-0" style={{ background: color }} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-slate-800 truncate">{m.name}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-black" style={{ color }}>{m.totalCows}</p>
                        <p className="text-[9px] text-slate-400">anim.</p>
                      </div>
                    </div>
                    {isSelected && (
                      <div className="mt-3 pl-5 space-y-2" onClick={e => e.stopPropagation()}>
                        {/* Info extra */}
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                          {m.avgAltitude && (
                            <>
                              <span className="text-[10px] text-slate-400">Altitud media</span>
                              <span className="text-[10px] font-semibold text-slate-700">{m.avgAltitude.toFixed(0)} m</span>
                            </>
                          )}
                          {m.cowPoints.length > 0 && (
                            <>
                              <span className="text-[10px] text-slate-400">Puntos GPS</span>
                              <span className="text-[10px] font-semibold text-slate-700">{m.cowPoints.length} vacas</span>
                            </>
                          )}
                          {m.bounds && (
                            <>
                              <span className="text-[10px] text-slate-400">Área cubierta</span>
                              <span className="text-[10px] font-semibold text-slate-700">
                                {(
                                  Math.abs(m.bounds.maxLat - m.bounds.minLat) * 111000 *
                                  Math.abs(m.bounds.maxLon - m.bounds.minLon) * 111000 /
                                  10000
                                ).toFixed(1)} ha
                              </span>
                            </>
                          )}
                          <span className="text-[10px] text-slate-400">Ruta dron</span>
                          {loadingT
                            ? <span className="text-[10px] text-slate-300 animate-pulse">cargando…</span>
                            : flightTrack.length > 1
                              ? <span className="text-[10px] font-semibold text-emerald-600">{flightTrack.length} pts GPS</span>
                              : <span className="text-[10px] text-slate-300">sin datos</span>
                          }
                          <span className="text-[10px] text-slate-400">Coordenadas</span>
                          <span className="text-[10px] font-mono text-slate-500">
                            {m.centerLat !== null && m.centerLon !== null
                              ? `${m.centerLat.toFixed(4)}, ${m.centerLon.toFixed(4)}`
                              : '—'}
                          </span>
                        </div>

                        {/* Botones Ver misión / Ver vídeo */}
                        <div className={`mt-1 grid gap-1.5 ${m.videoS3Key ? 'grid-cols-2' : 'grid-cols-1'}`}>
                          <a
                            href={`/mision/${m.id}`}
                            className="flex items-center justify-center gap-1.5 bg-primary/10 hover:bg-primary/20 text-primary text-[11px] font-bold py-1.5 px-3 rounded-lg transition-colors"
                          >
                            <span className="material-icons-round text-sm">open_in_new</span>
                            Ver misión
                          </a>
                          {m.videoS3Key && (
                            <button
                              onClick={e => { e.stopPropagation(); openVideo(m.id, m.videoS3Key!); }}
                              disabled={loadingVideo === m.id}
                              className="flex items-center justify-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold py-1.5 px-3 rounded-lg transition-colors disabled:opacity-50"
                            >
                              <span className="material-icons-round text-sm">{loadingVideo === m.id ? 'hourglass_empty' : 'play_circle'}</span>
                              {loadingVideo === m.id ? 'Cargando...' : 'Ver vídeo'}
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Tiempo */}
        {weather && (
          <div className="px-5 py-4 border-t border-slate-100 shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-2xl">{wInfo.icon}</span>
                <div>
                  <p className="text-base font-black text-slate-900">{weather.temp}°C</p>
                  <p className="text-[10px] text-slate-400">{wInfo.label} · {weather.humidity}% hum.</p>
                </div>
              </div>
              {fr && (
                <div className={`px-2.5 py-1 rounded-lg ${fr.bg}`}>
                  <p className={`text-xs font-black ${fr.color}`}>{fr.label}</p>
                  <p className={`text-[9px] ${fr.color} opacity-70`}>riesgo fuego</p>
                </div>
              )}
              <div className="text-right text-xs text-slate-400">
                <p>💨 {weather.wind} km/h</p>
                <p>🌧️ {weather.precip} mm</p>
              </div>
            </div>
          </div>
        )}
      </div>
      )}
    </div>
  );
}
