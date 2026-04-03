'use client';

// /library — Capturas · Biblioteca de media para Finca Galisancho
// Vídeos y fotos de drones DJI vía FlightHub2 → S3 (dlosai-media-prod)
// Thumbnails: primer frame via canvas (vídeos) o presigned URL directo (fotos)
// Vídeos se cargan SOLO al hacer click para evitar egress innecesario

import { useState, useEffect, useRef } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────
interface MediaItem {
  key: string;
  name: string;
  type: 'video' | 'photo';
  date: string;
  dateTime: string;
  size: number;
  sizeFormatted: string;
  duration: string | null;
  mission: string;
  thumbnailUrl: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtDate(iso: string) {
  return new Date(iso + 'T12:00:00').toLocaleDateString('es-ES', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}

// ── Video presigned URL queue (max 3 concurrent) ──────────────────────────────
type UrlEntry = { key: string; resolve: (url: string | null) => void };
const urlQueue: UrlEntry[] = [];
let urlRunning = 0;
const URL_CONCURRENCY = 3;

function enqueueUrl(key: string): Promise<string | null> {
  return new Promise(resolve => {
    urlQueue.push({ key, resolve });
    drainUrlQueue();
  });
}

function drainUrlQueue() {
  while (urlRunning < URL_CONCURRENCY && urlQueue.length > 0) {
    const entry = urlQueue.shift()!;
    urlRunning++;
    fetch(`/api/media/url?key=${encodeURIComponent(entry.key)}`)
      .then(r => r.json())
      .then(d => entry.resolve(d.url ?? null))
      .catch(() => entry.resolve(null))
      .finally(() => { urlRunning--; drainUrlQueue(); });
  }
}

// ── Media Card ────────────────────────────────────────────────────────────────
function MediaCard({ item, onClick }: { item: MediaItem; onClick: () => void }) {
  const cardRef  = useRef<HTMLDivElement>(null);
  const [visible, setVisible]     = useState(false);
  const [videoUrl, setVideoUrl]   = useState<string | null>(null);
  const started = useRef(false);
  const isVideo = item.type === 'video';

  // Intersection observer — load only when in viewport
  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setVisible(true); obs.disconnect(); } },
      { rootMargin: '300px' }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // For videos: fetch presigned URL when visible so <video> can render first frame
  useEffect(() => {
    if (!visible || !isVideo || started.current) return;
    started.current = true;
    enqueueUrl(item.key).then(url => { if (url) setVideoUrl(url); });
  }, [visible, isVideo, item.key]);

  // Photos use thumbnailUrl directly from the API (presigned URL of the image itself)
  const photoThumb = !isVideo ? item.thumbnailUrl : null;

  return (
    <div
      ref={cardRef}
      onClick={onClick}
      className="group bg-white border border-slate-200 rounded-2xl overflow-hidden cursor-pointer transition-all duration-200 hover:shadow-lg hover:shadow-primary/10 hover:border-primary/40 hover:-translate-y-0.5"
    >
      {/* Thumbnail */}
      <div className="aspect-video bg-slate-100 relative overflow-hidden">

        {/* Photo: img tag with presigned URL */}
        {!isVideo && photoThumb && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photoThumb}
            alt={item.name}
            loading="lazy"
            className="w-full h-full object-cover"
          />
        )}

        {/* Video: native <video> renders first frame automatically */}
        {isVideo && videoUrl && (
          <video
            src={videoUrl}
            muted
            playsInline
            preload="metadata"
            className="w-full h-full object-cover"
          />
        )}

        {/* Placeholder while loading */}
        {(isVideo ? !videoUrl : !photoThumb) && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200">
            <span className="material-icons-round text-4xl text-slate-300 mb-1">
              {isVideo ? 'videocam' : 'image'}
            </span>
            {visible && (
              <span className="text-[10px] text-slate-400 animate-pulse">Cargando...</span>
            )}
          </div>
        )}

        {/* Play overlay */}
        {isVideo && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/30 transition-all duration-200">
            <div className="w-12 h-12 rounded-full bg-primary/90 flex items-center justify-center opacity-0 group-hover:opacity-100 scale-90 group-hover:scale-100 transition-all duration-200 shadow-lg shadow-primary/40">
              <span className="material-icons-round text-white text-xl ml-0.5">play_arrow</span>
            </div>
          </div>
        )}

        {/* Type badge */}
        <div className={`absolute top-2 left-2 flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold ${
          isVideo ? 'bg-primary/90 text-white' : 'bg-emerald-500/90 text-white'
        }`}>
          <span className="material-icons-round" style={{ fontSize: 11 }}>{isVideo ? 'videocam' : 'image'}</span>
          {isVideo ? 'Vídeo' : 'Foto'}
        </div>

        {/* Duration */}
        {item.duration && (
          <div className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded-md bg-black/70 text-white text-[10px] font-mono">
            {item.duration}
          </div>
        )}
      </div>

      {/* Info */}
      <div className="px-4 py-3">
        <p className="text-sm font-semibold text-slate-800 truncate mb-1">{item.name}</p>
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-slate-400">{fmtTime(item.dateTime)}</span>
          <span className="text-xs text-slate-400 font-mono">{item.sizeFormatted}</span>
        </div>
        {item.mission !== 'Raíz' && (
          <p className="text-[11px] text-slate-400 mt-1 truncate flex items-center gap-1">
            <span className="material-icons-round" style={{ fontSize: 11 }}>folder</span>
            {item.mission}
          </p>
        )}
      </div>
    </div>
  );
}

// ── Video Modal ───────────────────────────────────────────────────────────────
function VideoModal({ item, onClose }: { item: MediaItem; onClose: () => void }) {
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(false);

  useEffect(() => {
    fetch(`/api/media/url?key=${encodeURIComponent(item.key)}`)
      .then(r => r.json()).then(d => { setVideoUrl(d.url); setLoading(false); })
      .catch(() => { setError(true); setLoading(false); });
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [item.key, onClose]);

  return (
    <div onClick={onClose} className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div onClick={e => e.stopPropagation()} className="bg-white rounded-2xl overflow-hidden w-full max-w-4xl shadow-2xl">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3">
          <div className="w-9 h-9 bg-primary/10 rounded-xl flex items-center justify-center shrink-0">
            <span className="material-icons-round text-lg text-primary">videocam</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-slate-900 truncate">{item.name}</p>
            <p className="text-xs text-slate-400 mt-0.5">{item.mission} · {item.sizeFormatted}{item.duration ? ` · ${item.duration}` : ''}</p>
          </div>
          <button onClick={onClose} className="w-9 h-9 flex items-center justify-center rounded-xl bg-slate-100 hover:bg-red-50 hover:text-red-500 text-slate-500 transition-colors">
            <span className="material-icons-round text-lg">close</span>
          </button>
        </div>
        <div className="aspect-video bg-black flex items-center justify-center">
          {loading && (
            <div className="text-center">
              <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-sm text-slate-400">Generando enlace seguro...</p>
            </div>
          )}
          {error && (
            <div className="text-center">
              <span className="material-icons-round text-4xl text-red-400 mb-2">error_outline</span>
              <p className="text-sm text-red-400">Error al cargar el vídeo</p>
            </div>
          )}
          {videoUrl && <video src={videoUrl} controls autoPlay className="w-full h-full object-contain" />}
        </div>
        <div className="px-5 py-3 border-t border-slate-100 flex items-center gap-3">
          <span className="material-icons-round text-sm text-slate-400">lock</span>
          <span className="text-xs text-slate-400">URL segura · expira en 1 hora · no pública</span>
          {videoUrl && (
            <a href={videoUrl} download={item.name} className="ml-auto flex items-center gap-1.5 text-xs font-semibold text-primary hover:text-primary/80 transition-colors">
              <span className="material-icons-round text-sm">download</span>Descargar
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Photo Modal ───────────────────────────────────────────────────────────────
function PhotoModal({ item, onClose }: { item: MediaItem; onClose: () => void }) {
  const [imgUrl, setImgUrl]   = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/media/url?key=${encodeURIComponent(item.key)}`)
      .then(r => r.json()).then(d => { setImgUrl(d.url); setLoading(false); })
      .catch(() => setLoading(false));
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [item.key, onClose]);

  return (
    <div onClick={onClose} className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div onClick={e => e.stopPropagation()} className="bg-white rounded-2xl overflow-hidden max-w-5xl w-full shadow-2xl">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3">
          <div className="w-9 h-9 bg-emerald-50 rounded-xl flex items-center justify-center shrink-0">
            <span className="material-icons-round text-lg text-emerald-600">image</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-slate-900 truncate">{item.name}</p>
            <p className="text-xs text-slate-400 mt-0.5">{item.mission} · {item.sizeFormatted}</p>
          </div>
          <button onClick={onClose} className="w-9 h-9 flex items-center justify-center rounded-xl bg-slate-100 hover:bg-red-50 hover:text-red-500 text-slate-500 transition-colors">
            <span className="material-icons-round text-lg">close</span>
          </button>
        </div>
        <div className="bg-slate-50 flex items-center justify-center min-h-64 max-h-[75vh] overflow-hidden">
          {loading ? (
            <div className="py-16 text-center">
              <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-sm text-slate-400">Cargando imagen...</p>
            </div>
          ) : imgUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imgUrl} alt={item.name} className="max-w-full max-h-[75vh] object-contain" />
          ) : (
            <div className="py-16 text-center">
              <span className="material-icons-round text-4xl text-slate-300 mb-2">broken_image</span>
              <p className="text-sm text-slate-400">No se pudo cargar la imagen</p>
            </div>
          )}
        </div>
        {imgUrl && (
          <div className="px-5 py-3 border-t border-slate-100 flex justify-end">
            <a href={imgUrl} download={item.name} className="flex items-center gap-1.5 text-xs font-semibold text-primary hover:text-primary/80 transition-colors">
              <span className="material-icons-round text-sm">download</span>Descargar
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────
function SkeletonCard() {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
      <div className="aspect-video bg-slate-100 skeleton" />
      <div className="px-4 py-3 space-y-2">
        <div className="h-3.5 bg-slate-100 rounded-lg skeleton w-3/4" />
        <div className="h-3 bg-slate-100 rounded-lg skeleton w-1/2" />
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function LibraryPage() {
  const [items, setItems]       = useState<MediaItem[]>([]);
  const [grouped, setGrouped]   = useState<Record<string, MediaItem[]>>({});
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [filter, setFilter]     = useState<'all' | 'video' | 'photo'>('all');
  const [search, setSearch]     = useState('');
  const [selected, setSelected] = useState<MediaItem | null>(null);
  const [total, setTotal]       = useState(0);
  const [syncing, setSyncing]   = useState(false);
  const [syncMsg, setSyncMsg]   = useState<string | null>(null);

  async function syncRoutes() {
    setSyncing(true);
    setSyncMsg(null);
    try {
      const res  = await fetch('/api/routes/sync', { method: 'POST' });
      const data = await res.json();
      if (data.ok) {
        setSyncMsg(`${data.synced} rutas sincronizadas`);
      } else {
        setSyncMsg(data.error ?? 'Error desconocido');
      }
    } catch (e) {
      setSyncMsg(String(e));
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncMsg(null), 4000);
    }
  }

  useEffect(() => {
    fetch('/api/media/list')
      .then(r => r.json())
      .then(d => {
        if (d.error) { setError(d.error); return; }
        setItems(d.items ?? []);
        setGrouped(d.grouped ?? {});
        setTotal(d.total ?? 0);
      })
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  const filteredGrouped = Object.fromEntries(
    Object.entries(grouped)
      .map(([date, its]) => [
        date,
        (its as MediaItem[]).filter(item => {
          const matchType   = filter === 'all' || item.type === filter;
          const matchSearch = !search ||
            item.name.toLowerCase().includes(search.toLowerCase()) ||
            item.mission.toLowerCase().includes(search.toLowerCase());
          return matchType && matchSearch;
        }),
      ])
      .filter(([, its]) => (its as MediaItem[]).length > 0)
  );

  const visibleCount = Object.values(filteredGrouped).flat().length;
  const videoCount   = items.filter(i => i.type === 'video').length;
  const photoCount   = items.filter(i => i.type === 'photo').length;

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50 pb-20 lg:pb-8">

      {/* ── Header ── */}
      <div className="bg-white border-b border-slate-200 px-4 sm:px-6 py-5">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-black text-slate-900">Capturas</h1>
            <p className="text-sm text-slate-500">Finca Galisancho · Biblioteca de media · S3</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Sincronizar rutas */}
            <div className="relative">
              <button
                onClick={syncRoutes}
                disabled={syncing}
                className="flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 disabled:opacity-60 text-slate-600 px-3 py-1.5 rounded-xl text-xs font-bold transition-colors"
                title="Sincronizar nombres de rutas desde FlightHub2"
              >
                <span className={`material-icons-round ${syncing ? 'animate-spin' : ''}`} style={{ fontSize: 14 }}>sync</span>
                <span className="hidden sm:inline">{syncing ? 'Sincronizando...' : 'Sincronizar rutas'}</span>
              </button>
              {syncMsg && (
                <div className={`absolute right-0 top-full mt-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap shadow-md z-10 ${
                  syncMsg.includes('Error') || syncMsg.includes('error')
                    ? 'bg-red-50 text-red-600 border border-red-200'
                    : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                }`}>
                  {syncMsg}
                </div>
              )}
            </div>

            {!loading && !error && (
              <>
                <div className="flex items-center gap-1.5 bg-primary/10 text-primary px-3 py-1.5 rounded-xl text-xs font-bold">
                  <span className="material-icons-round" style={{ fontSize: 14 }}>folder</span>
                  {total} archivos
                </div>
                {videoCount > 0 && (
                  <div className="flex items-center gap-1.5 bg-slate-100 text-slate-600 px-3 py-1.5 rounded-xl text-xs font-bold">
                    <span className="material-icons-round" style={{ fontSize: 14 }}>videocam</span>
                    {videoCount} vídeos
                  </div>
                )}
                {photoCount > 0 && (
                  <div className="flex items-center gap-1.5 bg-emerald-50 text-emerald-600 px-3 py-1.5 rounded-xl text-xs font-bold">
                    <span className="material-icons-round" style={{ fontSize: 14 }}>image</span>
                    {photoCount} fotos
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Search + filters */}
        <div className="mt-4 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1 max-w-sm">
            <span className="material-icons-round absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg pointer-events-none">search</span>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar por nombre o misión..."
              className="w-full pl-10 pr-4 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition"
            />
          </div>
          <div className="flex items-center gap-1.5">
            {([
              ['all',   'Todo',   'grid_view'],
              ['video', 'Vídeos', 'videocam' ],
              ['photo', 'Fotos',  'image'    ],
            ] as const).map(([id, label, icon]) => (
              <button
                key={id}
                onClick={() => setFilter(id)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all ${
                  filter === id
                    ? 'bg-primary text-white shadow-sm shadow-primary/30'
                    : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                }`}
              >
                <span className="material-icons-round" style={{ fontSize: 14 }}>{icon}</span>
                <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Content ── */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">

        {/* Loading */}
        {loading && (
          <div>
            <div className="h-4 w-48 bg-slate-200 rounded-lg skeleton mb-4" />
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4">
              {Array.from({ length: 10 }).map((_, i) => <SkeletonCard key={i} />)}
            </div>
          </div>
        )}

        {/* Error */}
        {!loading && error && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-6 max-w-lg mx-auto mt-8 text-center">
            <span className="material-icons-round text-4xl text-red-400 mb-3">cloud_off</span>
            <p className="text-sm font-bold text-red-600 mb-2">Error al conectar con S3</p>
            <p className="text-xs text-red-400 font-mono break-all">{error}</p>
          </div>
        )}

        {/* Empty */}
        {!loading && !error && visibleCount === 0 && (
          <div className="text-center py-20">
            <span className="material-icons-round text-5xl text-slate-300 mb-4">perm_media</span>
            <p className="text-base font-bold text-slate-500">
              {total === 0 ? 'El bucket aún no tiene archivos' : 'No se encontraron archivos'}
            </p>
            <p className="text-sm text-slate-400 mt-1">
              {total === 0
                ? 'Las capturas de FlightHub2 aparecerán aquí automáticamente'
                : 'Prueba a cambiar los filtros o el término de búsqueda'}
            </p>
          </div>
        )}

        {/* Grouped by date */}
        {!loading && !error && (Object.entries(filteredGrouped) as [string, MediaItem[]][]).map(([date, dateItems]) => (
          <div key={date} className="mb-10">
            <div className="flex items-center gap-3 mb-4">
              <span className="text-xs font-black uppercase tracking-[0.15em] text-slate-500 capitalize shrink-0">
                {fmtDate(date)}
              </span>
              <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full shrink-0">
                {dateItems.length}
              </span>
              <div className="flex-1 h-px bg-slate-200" />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4">
              {dateItems.map(item => (
                <MediaCard key={item.key} item={item} onClick={() => setSelected(item)} />
              ))}
            </div>
          </div>
        ))}

        {!loading && !error && visibleCount > 0 && (
          <p className="text-center text-xs text-slate-400 py-4">
            {visibleCount} de {total} archivos · dlosai-media-prod · Finca Galisancho
          </p>
        )}
      </div>

      {/* Modals */}
      {selected?.type === 'video' && <VideoModal item={selected} onClose={() => setSelected(null)} />}
      {selected?.type === 'photo' && <PhotoModal item={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
