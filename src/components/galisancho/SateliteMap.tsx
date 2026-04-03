'use client';
// Mapa satélite — MapLibre GL + ESRI tiles + heatmap vacas + áreas de misión + pins/anotaciones/zonas

import { useEffect, useRef } from 'react';
import 'maplibre-gl/dist/maplibre-gl.css';

const LAT =  37.79234586219361;
const LNG = -6.204572703283015;

export interface MissionGeo {
  id: string;
  name: string;
  date: string;
  totalCows: number;
  totalPersons: number;
  totalVehicles: number;
  centerLat: number | null;
  centerLon: number | null;
  bounds: { minLat: number; maxLat: number; minLon: number; maxLon: number } | null;
  cowPoints: [number, number][];
  avgAltitude: number | null;
  videoS3Key?: string;
}

export interface MapItem {
  id: string;
  type: 'pin' | 'annotation';
  name: string;
  color: string;
  icon?: string;
  tag?: string;
  lat: number;
  lng: number;
  coordinates?: [number, number][]; // for polygon zones
  createdAt: string;
}

function fmtDate(iso: string) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
}

function buildCowGeoJSON(missions: MissionGeo[]) {
  return {
    type: 'FeatureCollection' as const,
    features: missions.flatMap(m =>
      m.cowPoints.map(([lat, lon]) => ({
        type: 'Feature' as const,
        properties: {},
        geometry: { type: 'Point' as const, coordinates: [lon, lat] },
      }))
    ),
  };
}

function buildCentersGeoJSON(missions: MissionGeo[]) {
  return {
    type: 'FeatureCollection' as const,
    features: missions
      .filter(m => m.centerLat !== null && m.centerLon !== null)
      .map(m => ({
        type: 'Feature' as const,
        properties: { name: m.name, totalCows: m.totalCows, date: m.date, id: m.id },
        geometry: { type: 'Point' as const, coordinates: [m.centerLon!, m.centerLat!] },
      })),
  };
}

function buildFlightGeoJSON(track: [number, number][]) {
  return {
    type: 'FeatureCollection' as const,
    features: track.length > 1 ? [{
      type: 'Feature' as const,
      properties: {},
      geometry: {
        type: 'LineString' as const,
        coordinates: track.map(([lat, lon]) => [lon, lat]),
      },
    }] : [],
  };
}

function buildFlightEndpointsGeoJSON(track: [number, number][]) {
  if (track.length < 2) return { type: 'FeatureCollection' as const, features: [] };
  return {
    type: 'FeatureCollection' as const,
    features: [
      { type: 'Feature' as const, properties: { role: 'start' }, geometry: { type: 'Point' as const, coordinates: [track[0][1], track[0][0]] } },
      { type: 'Feature' as const, properties: { role: 'end'   }, geometry: { type: 'Point' as const, coordinates: [track[track.length - 1][1], track[track.length - 1][0]] } },
    ],
  };
}

function buildBoundsGeoJSON(missions: MissionGeo[]) {
  return {
    type: 'FeatureCollection' as const,
    features: missions
      .filter(m => m.bounds)
      .map(m => ({
        type: 'Feature' as const,
        properties: { name: m.name, totalCows: m.totalCows },
        geometry: {
          type: 'Polygon' as const,
          coordinates: [[
            [m.bounds!.minLon, m.bounds!.minLat],
            [m.bounds!.maxLon, m.bounds!.minLat],
            [m.bounds!.maxLon, m.bounds!.maxLat],
            [m.bounds!.minLon, m.bounds!.maxLat],
            [m.bounds!.minLon, m.bounds!.minLat],
          ]],
        },
      })),
  };
}

interface SateliteMapProps {
  missions?: MissionGeo[];
  flightTrack?: [number, number][];
  mapItems?: MapItem[];
  showPins?: boolean;
  showAnnotations?: boolean;
  showCenters?: boolean;
  showBounds?: boolean;
  showHeatmap?: boolean;
  showRoute?: boolean;
  placingMode?: 'pin' | 'annotation' | null;
  onMapClick?: (lat: number, lng: number) => void;
  drawingPoints?: [number, number][];
  onDelete?: (id: string) => void;
}

export default function SateliteMap({
  missions = [],
  flightTrack = [],
  mapItems = [],
  showPins = true,
  showAnnotations = true,
  showCenters = false,
  showBounds = false,
  showHeatmap = true,
  showRoute = true,
  placingMode = null,
  onMapClick,
  drawingPoints,
  onDelete,
}: SateliteMapProps) {
  const containerRef    = useRef<HTMLDivElement>(null);
  const mapRef          = useRef<any>(null);
  const missionsRef     = useRef<MissionGeo[]>(missions);
  const flightTrackRef  = useRef<[number, number][]>(flightTrack);
  const mlRef           = useRef<any>(null);           // { Marker, Popup }
  const itemMarkersRef  = useRef<{ marker: any; type: string }[]>([]);
  const placingModeRef  = useRef(placingMode);
  const onMapClickRef   = useRef(onMapClick);
  const onDeleteRef     = useRef(onDelete);
  const drawingPointsRef = useRef(drawingPoints);

  missionsRef.current    = missions;
  flightTrackRef.current = flightTrack;
  placingModeRef.current = placingMode;
  onMapClickRef.current  = onMapClick;
  onDeleteRef.current    = onDelete;
  drawingPointsRef.current = drawingPoints;

  // Actualiza fuentes GeoJSON existentes sin recrear capas
  function updateMapData(map: any, ms: MissionGeo[]) {
    if (map.getSource('cow-heatmap'))    (map.getSource('cow-heatmap') as any).setData(buildCowGeoJSON(ms));
    if (map.getSource('mission-centers'))(map.getSource('mission-centers') as any).setData(buildCentersGeoJSON(ms));
    if (map.getSource('mission-bounds')) (map.getSource('mission-bounds') as any).setData(buildBoundsGeoJSON(ms));
  }

  // Añade fuentes y capas al cargar el mapa por primera vez
  function addMapLayers(map: any, Popup: any) {
    const ms = missionsRef.current;

    // ── Heatmap de vacas ──
    map.addSource('cow-heatmap', { type: 'geojson', data: buildCowGeoJSON(ms) });
    map.addLayer({
      id: 'cow-heatmap-layer',
      type: 'heatmap',
      source: 'cow-heatmap',
      paint: {
        'heatmap-weight':     1,
        'heatmap-intensity':  1.5,
        'heatmap-radius':     35,
        'heatmap-color': [
          'interpolate', ['linear'], ['heatmap-density'],
          0,   'rgba(0,0,200,0)',
          0.2, 'rgba(0,200,255,0.55)',
          0.4, 'rgba(0,230,100,0.70)',
          0.6, 'rgba(255,230,0,0.80)',
          0.8, 'rgba(255,100,0,0.90)',
          1,   'rgba(220,0,0,1)',
        ],
        'heatmap-opacity': 0.82,
      },
    });

    // Puntos individuales a zoom alto
    map.addLayer({
      id: 'cow-points',
      type: 'circle',
      source: 'cow-heatmap',
      minzoom: 16,
      paint: {
        'circle-radius':       6,
        'circle-color':        '#ef4444',
        'circle-stroke-width': 1.5,
        'circle-stroke-color': '#fff',
        'circle-opacity':      0.9,
      },
    });

    // ── Área de cobertura por misión — solo borde, sin relleno ──
    map.addSource('mission-bounds', { type: 'geojson', data: buildBoundsGeoJSON(ms) });
    map.addLayer({
      id: 'mission-bounds-line',
      type: 'line',
      source: 'mission-bounds',
      layout: { visibility: 'none' },
      paint: { 'line-color': '#06b6d4', 'line-width': 1.5, 'line-dasharray': [3, 2] },
    });

    // ── Centros de misión ──
    map.addSource('mission-centers', { type: 'geojson', data: buildCentersGeoJSON(ms) });
    map.addLayer({
      id: 'mission-center-halo',
      type: 'circle',
      source: 'mission-centers',
      layout: { visibility: 'none' },
      paint: { 'circle-radius': 22, 'circle-color': '#06b6d4', 'circle-opacity': 0.18 },
    });
    map.addLayer({
      id: 'mission-center-dot',
      type: 'circle',
      source: 'mission-centers',
      layout: { visibility: 'none' },
      paint: {
        'circle-radius':       12,
        'circle-color':        '#06b6d4',
        'circle-stroke-width': 2.5,
        'circle-stroke-color': '#fff',
        'circle-opacity':      0.95,
      },
    });

    // ── Ruta de vuelo ──
    map.addSource('flight-path', { type: 'geojson', data: buildFlightGeoJSON([]) });
    map.addLayer({
      id: 'flight-path-line',
      type: 'line',
      source: 'flight-path',
      paint: { 'line-color': '#ef4444', 'line-width': 4, 'line-opacity': 0.9, 'line-dasharray': [5, 3] },
    });

    map.addSource('flight-endpoints', { type: 'geojson', data: buildFlightEndpointsGeoJSON([]) });
    map.addLayer({
      id: 'flight-start',
      type: 'circle',
      source: 'flight-endpoints',
      filter: ['==', ['get', 'role'], 'start'],
      paint: { 'circle-radius': 7, 'circle-color': '#22c55e', 'circle-stroke-width': 2, 'circle-stroke-color': '#fff' },
    });
    map.addLayer({
      id: 'flight-end',
      type: 'circle',
      source: 'flight-endpoints',
      filter: ['==', ['get', 'role'], 'end'],
      paint: { 'circle-radius': 7, 'circle-color': '#ef4444', 'circle-stroke-width': 2, 'circle-stroke-color': '#fff' },
    });

    // ── Zone annotation fills ──
    map.addSource('zone-fills', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({
      id: 'zone-fill-layer',
      type: 'fill',
      source: 'zone-fills',
      paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.18 },
    });
    map.addLayer({
      id: 'zone-line-layer',
      type: 'line',
      source: 'zone-fills',
      paint: { 'line-color': ['get', 'color'], 'line-width': 2, 'line-opacity': 0.8 },
    });

    // ── Drawing preview ──
    map.addSource('drawing-preview', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({
      id: 'drawing-fill-layer',
      type: 'fill',
      source: 'drawing-preview',
      paint: { 'fill-color': '#8b5cf6', 'fill-opacity': 0.15 },
    });
    map.addLayer({
      id: 'drawing-line-layer',
      type: 'line',
      source: 'drawing-preview',
      paint: { 'line-color': '#8b5cf6', 'line-width': 2, 'line-dasharray': [4, 3] },
    });
    map.addLayer({
      id: 'drawing-dots-layer',
      type: 'circle',
      source: 'drawing-preview',
      filter: ['==', '$type', 'Point'],
      paint: { 'circle-radius': 5, 'circle-color': '#8b5cf6', 'circle-stroke-width': 2, 'circle-stroke-color': '#fff' },
    });

    // ── Zone click popup with delete ──
    map.on('click', 'zone-fill-layer', (e: any) => {
      if (placingModeRef.current) return;
      const p = e.features[0].properties;
      const popupEl = document.createElement('div');
      popupEl.style.cssText = 'font-family:system-ui;padding:12px 14px;min-width:160px';
      popupEl.innerHTML = `
        <div style="font-weight:800;color:#0f172a;font-size:13px;margin-bottom:8px">✏️ ${p.name}</div>
        <div style="font-size:11px;color:#94a3b8;margin-bottom:10px">Zona anotada</div>`;
      const btn = document.createElement('button');
      btn.innerHTML = '<span style="font-size:11px;display:flex;align-items:center;gap:5px"><span class="material-icons-round" style="font-size:14px">delete</span>Borrar zona</span>';
      btn.style.cssText = `width:100%;padding:7px 10px;border-radius:8px;background:#fef2f2;border:1px solid #fecaca;color:#ef4444;font-weight:700;font-size:11px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:4px`;
      btn.onclick = () => { if (onDeleteRef.current) onDeleteRef.current(p.id); };
      popupEl.appendChild(btn);
      new Popup({ closeButton: true, offset: 10 })
        .setLngLat(e.lngLat)
        .setDOMContent(popupEl)
        .addTo(map);
    });
    map.on('mouseenter', 'zone-fill-layer', () => { if (!placingModeRef.current) map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', 'zone-fill-layer', () => { if (!placingModeRef.current) map.getCanvas().style.cursor = ''; });

    // Popup al clicar centro de misión
    map.on('click', 'mission-center-dot', (e: any) => {
      if (placingModeRef.current) return;
      const p = e.features[0].properties;
      // Buscar datos completos de la misión en el ref
      const full = missionsRef.current.find(m => m.id === p.id);
      const altStr    = full?.avgAltitude ? `${full.avgAltitude.toFixed(0)} m` : '—';
      const ptsStr    = full?.cowPoints.length ?? 0;
      const libraryUrl = `/mision/${p.id}`;
      new Popup({ closeButton: true, offset: 16, maxWidth: '260px' })
        .setLngLat(e.lngLat)
        .setHTML(`
          <div style="font-family:system-ui;padding:4px 2px;min-width:220px">
            <div style="font-weight:800;color:#0f172a;font-size:13px;margin-bottom:8px;line-height:1.3">${p.name}</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:10px">
              <div style="background:#f8fafc;border-radius:8px;padding:7px 10px">
                <div style="font-size:9px;color:#94a3b8;font-weight:600;text-transform:uppercase;letter-spacing:.05em">Vacas</div>
                <div style="font-size:18px;font-weight:900;color:#06b6d4;line-height:1.2">${p.totalCows}</div>
              </div>
              <div style="background:#f8fafc;border-radius:8px;padding:7px 10px">
                <div style="font-size:9px;color:#94a3b8;font-weight:600;text-transform:uppercase;letter-spacing:.05em">Altitud</div>
                <div style="font-size:15px;font-weight:800;color:#334155;line-height:1.3">${altStr}</div>
              </div>
            </div>
            <div style="font-size:10px;color:#64748b;margin-bottom:4px">📅 ${fmtDate(p.date)}</div>
            <div style="font-size:10px;color:#64748b;margin-bottom:12px">📍 ${ptsStr} puntos GPS registrados</div>
            <a href="${libraryUrl}"
               style="display:flex;align-items:center;justify-content:center;gap:6px;background:#0ea5e9;color:#fff;font-size:11px;font-weight:700;padding:8px 14px;border-radius:8px;text-decoration:none;width:100%;box-sizing:border-box">
              <svg xmlns="http://www.w3.org/2000/svg" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M19 19H5V5h7V3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z"/></svg>
              Ver misión en librería
            </a>
          </div>`)
        .addTo(map);
    });
    map.on('mouseenter', 'mission-center-dot', () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', 'mission-center-dot', () => {
      if (!placingModeRef.current) map.getCanvas().style.cursor = '';
    });

    // ── Click en mapa para colocar pin/anotación ──
    map.on('click', (e: any) => {
      if (placingModeRef.current && onMapClickRef.current) {
        onMapClickRef.current(e.lngLat.lat, e.lngLat.lng);
      }
    });
  }

  // Inicialización del mapa (una sola vez)
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    import('maplibre-gl').then(({ Map, Marker, NavigationControl, Popup }) => {
      if (!containerRef.current || mapRef.current) return;

      mlRef.current = { Marker, Popup };

      const style: any = {
        version: 8,
        sources: {
          satellite: {
            type: 'raster',
            tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
            tileSize: 256,
            attribution: '© ESRI, Maxar, Earthstar Geographics',
          },
          labels: {
            type: 'raster',
            tiles: ['https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}'],
            tileSize: 256,
          },
        },
        layers: [
          { id: 'satellite-layer', type: 'raster', source: 'satellite' },
          { id: 'labels-layer',    type: 'raster', source: 'labels'    },
        ],
      };

      const map = new Map({
        container: containerRef.current!,
        style,
        center:  [LNG, LAT],
        zoom:    14.5,
        pitch:   40,
        bearing: 0,
        maxPitch: 80,
      });
      mapRef.current = map;
      map.addControl(new NavigationControl({ visualizePitch: true }), 'top-right');

      // Marcador finca — small red home pin
      const el = document.createElement('div');
      el.innerHTML = `
        <div style="display:flex;flex-direction:column;align-items:center;filter:drop-shadow(0 2px 8px rgba(0,0,0,0.4));cursor:pointer">
          <div style="width:36px;height:36px;border-radius:10px;background:#007BFF;display:flex;align-items:center;justify-content:center;border:2px solid white">
            <span class="material-icons-round" style="color:white;font-size:20px">flight</span>
          </div>
          <div style="width:2px;height:6px;background:#007BFF"></div>
          <div style="width:5px;height:5px;border-radius:50%;background:#007BFF"></div>
        </div>`;
      new Marker({ element: el, anchor: 'bottom' })
        .setLngLat([LNG, LAT])
        .setPopup(
          new Popup({ offset: 10, closeButton: false })
            .setHTML(`<div style="background:#fff;padding:12px 14px;border-radius:10px;min-width:180px;font-family:system-ui">
              <div style="font-weight:700;color:#0f172a;font-size:13px;margin-bottom:6px">🏠 Finca Galisancho</div>
              <div style="font-size:11px;color:#64748b;line-height:1.8">
                <div>🌍 37.7923°N, -6.2046°W</div>
                <div style="color:#06B6D4;font-weight:600;margin-top:4px">● Monitoreo activo</div>
              </div>
            </div>`)
        )
        .addTo(map);

      map.on('load', () => {
        addMapLayers(map, Popup);
        // Aplicar datos de ruta si ya estaban disponibles antes de que el mapa cargara
        const tr = flightTrackRef.current;
        if (tr.length > 0) {
          (map.getSource('flight-path') as any)?.setData(buildFlightGeoJSON(tr));
          (map.getSource('flight-endpoints') as any)?.setData(buildFlightEndpointsGeoJSON(tr));
          map.setLayoutProperty('flight-path-line', 'visibility', 'visible');
          map.setLayoutProperty('flight-start',     'visibility', 'visible');
          map.setLayoutProperty('flight-end',       'visibility', 'visible');
        }
        setTimeout(() => {
          map.easeTo({ pitch: 40, bearing: 0, zoom: 15.2, duration: 2000 });
        }, 500);
      });
    });

    return () => { mapRef.current?.remove(); mapRef.current = null; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Actualizar datos cuando cambian las misiones
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    updateMapData(map, missions);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [missions]);

  // Actualizar ruta de vuelo — sin isStyleLoaded() para evitar el bug de 'load' que no vuelve a disparar
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const applyTrack = (track: [number, number][]) => {
      try {
        (map.getSource('flight-path') as any)?.setData(buildFlightGeoJSON(track));
        (map.getSource('flight-endpoints') as any)?.setData(buildFlightEndpointsGeoJSON(track));
        if (map.getLayer('flight-path-line')) {
          const vis = track.length > 1 ? 'visible' : 'none';
          map.setLayoutProperty('flight-path-line', 'visibility', vis);
          map.setLayoutProperty('flight-start',     'visibility', vis);
          map.setLayoutProperty('flight-end',       'visibility', vis);
        }
      } catch (e) { console.warn('[SateliteMap] track apply error:', e); }
    };

    // Si la fuente ya existe, actualizar directamente
    if (map.getSource('flight-path')) {
      applyTrack(flightTrack);
      return;
    }

    // Si no existe todavía (mapa cargando), esperar con retry
    let attempts = 0;
    const interval = setInterval(() => {
      attempts++;
      if (map.getSource('flight-path')) {
        clearInterval(interval);
        applyTrack(flightTrackRef.current);
      } else if (attempts > 50) {
        clearInterval(interval); // máx 5 segundos
      }
    }, 100);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flightTrack]);

  // Visibilidad capas centros, bounds y zones
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      const vis = (v: boolean) => v ? 'visible' : 'none';
      if (map.getLayer('mission-center-halo')) map.setLayoutProperty('mission-center-halo', 'visibility', vis(showCenters));
      if (map.getLayer('mission-center-dot'))  map.setLayoutProperty('mission-center-dot',  'visibility', vis(showCenters));
      if (map.getLayer('mission-bounds-line')) map.setLayoutProperty('mission-bounds-line', 'visibility', vis(showBounds));
      if (map.getLayer('zone-fill-layer')) map.setLayoutProperty('zone-fill-layer', 'visibility', vis(showAnnotations));
      if (map.getLayer('zone-line-layer')) map.setLayoutProperty('zone-line-layer', 'visibility', vis(showAnnotations));
    };
    if (map.isStyleLoaded()) apply(); else map.once('load', apply);
  }, [showCenters, showBounds, showAnnotations]);

  // Visibilidad capas (heatmap + ruta) — retry sin depender de isStyleLoaded
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const vis = (v: boolean) => v ? 'visible' : 'none';
    const apply = () => {
      try {
        if (map.getLayer('cow-heatmap-layer')) map.setLayoutProperty('cow-heatmap-layer', 'visibility', vis(showHeatmap));
        if (map.getLayer('cow-points'))        map.setLayoutProperty('cow-points',        'visibility', vis(showHeatmap));
        if (map.getLayer('flight-path-line'))  map.setLayoutProperty('flight-path-line',  'visibility', flightTrackRef.current.length > 1 ? vis(showRoute) : 'none');
        if (map.getLayer('flight-start'))      map.setLayoutProperty('flight-start',      'visibility', flightTrackRef.current.length > 1 ? vis(showRoute) : 'none');
        if (map.getLayer('flight-end'))        map.setLayoutProperty('flight-end',        'visibility', flightTrackRef.current.length > 1 ? vis(showRoute) : 'none');
      } catch (e) { console.warn('[SateliteMap] visibility apply error:', e); }
    };
    // Intentar inmediatamente, si las capas aún no existen reintentar
    apply();
    let attempts = 0;
    const interval = setInterval(() => {
      attempts++;
      apply();
      if (attempts > 30) clearInterval(interval);
    }, 200);
    return () => clearInterval(interval);
  }, [showHeatmap, showRoute]);

  // Cursor para modo de colocación
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.getCanvas().style.cursor = placingMode ? 'crosshair' : '';
  }, [placingMode]);

  // Renderizar pins como marcadores HTML; anotaciones/zonas via GeoJSON layers
  useEffect(() => {
    const map = mapRef.current;
    const ml  = mlRef.current;
    if (!map || !ml) return;

    // Eliminar marcadores anteriores
    itemMarkersRef.current.forEach(({ marker }) => marker.remove());
    itemMarkersRef.current = [];

    mapItems.forEach(item => {
      if (item.type === 'pin' && !showPins) return;
      if (item.type === 'annotation') {
        // Annotation zones are rendered via GeoJSON source, not HTML markers
        return;
      }

      // Only render HTML markers for pins
      const el = document.createElement('div');
      el.style.cursor = 'pointer';

      el.innerHTML = `
        <div style="display:flex;flex-direction:column;align-items:center;filter:drop-shadow(0 3px 8px rgba(0,0,0,0.35))">
          <div style="background:white;border:1.5px solid ${item.color};border-radius:6px;padding:2px 6px;font-size:10px;font-weight:700;color:#0f172a;white-space:nowrap;margin-bottom:3px;font-family:system-ui">${item.name}${item.tag ? `<span style="color:${item.color};margin-left:4px">${item.tag}</span>` : ''}</div>
          <div style="width:34px;height:34px;border-radius:50%;background:${item.color};display:flex;align-items:center;justify-content:center;border:2.5px solid white">
            <span class="material-icons-round" style="color:white;font-size:18px">${item.icon || 'place'}</span>
          </div>
          <div style="width:2px;height:6px;background:${item.color}"></div>
          <div style="width:5px;height:5px;border-radius:50%;background:${item.color}"></div>
        </div>`;

      const popupEl = document.createElement('div');
      popupEl.style.cssText = 'font-family:system-ui;padding:12px 14px;min-width:160px';
      const nameDiv = document.createElement('div');
      nameDiv.style.cssText = 'font-weight:800;color:#0f172a;font-size:13px;margin-bottom:4px';
      nameDiv.textContent = item.name;
      popupEl.appendChild(nameDiv);
      if (item.tag) {
        const tagSpan = document.createElement('span');
        tagSpan.style.cssText = `font-size:10px;background:${item.color}22;color:${item.color};border-radius:6px;padding:2px 6px;display:inline-block;font-weight:600;margin-bottom:8px`;
        tagSpan.textContent = item.tag;
        popupEl.appendChild(tagSpan);
      }
      const coordDiv = document.createElement('div');
      coordDiv.style.cssText = 'font-size:11px;color:#94a3b8;margin-bottom:10px';
      coordDiv.textContent = `${Number(item.lat).toFixed(4)}°N, ${Number(item.lng).toFixed(4)}°E`;
      popupEl.appendChild(coordDiv);
      const deleteBtn = document.createElement('button');
      deleteBtn.style.cssText = `width:100%;padding:7px 10px;border-radius:8px;background:#fef2f2;border:1px solid #fecaca;color:#ef4444;font-weight:700;font-size:11px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:4px`;
      deleteBtn.innerHTML = '<span class="material-icons-round" style="font-size:14px">delete</span>Borrar pin';
      deleteBtn.onclick = () => {
        if (onDeleteRef.current) {
          onDeleteRef.current(item.id);
          marker.remove();
        }
      };
      popupEl.appendChild(deleteBtn);

      const popup = new ml.Popup({ closeButton: true, offset: [0, -10] });
      popup.setDOMContent(popupEl);

      const marker = new ml.Marker({ element: el, anchor: 'bottom' })
        .setLngLat([item.lng, item.lat])
        .setPopup(popup)
        .addTo(map);

      el.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!placingModeRef.current) marker.togglePopup();
      });

      itemMarkersRef.current.push({ marker, type: item.type });
    });

    // Update zone fills source
    const zoneFeatures = mapItems
      .filter(item => item.type === 'annotation' && item.coordinates && item.coordinates.length >= 3 && showAnnotations)
      .map(item => ({
        type: 'Feature' as const,
        properties: { id: item.id, name: item.name, color: item.color },
        geometry: {
          type: 'Polygon' as const,
          coordinates: [[...item.coordinates!.map(([lat, lng]) => [lng, lat]), [item.coordinates![0][1], item.coordinates![0][0]]]],
        },
      }));

    if (map.getSource('zone-fills')) {
      (map.getSource('zone-fills') as any).setData({ type: 'FeatureCollection', features: zoneFeatures });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapItems, showPins, showAnnotations]);

  // Drawing preview useEffect
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    if (!map.getSource('drawing-preview')) return;

    const pts = drawingPoints ?? [];
    if (pts.length === 0) {
      (map.getSource('drawing-preview') as any).setData({ type: 'FeatureCollection', features: [] });
      return;
    }

    const coords = pts.map(([lat, lng]) => [lng, lat]);
    const features: any[] = [];

    // Draw polygon fill if 3+ points
    if (pts.length >= 3) {
      features.push({
        type: 'Feature',
        properties: {},
        geometry: { type: 'Polygon', coordinates: [[...coords, coords[0]]] },
      });
    }
    // Draw line connecting points
    if (pts.length >= 2) {
      features.push({
        type: 'Feature',
        properties: {},
        geometry: { type: 'LineString', coordinates: [...coords, coords[0]] },
      });
    }
    // Draw vertex dots
    coords.forEach(c => {
      features.push({
        type: 'Feature',
        properties: {},
        geometry: { type: 'Point', coordinates: c },
      });
    });

    (map.getSource('drawing-preview') as any).setData({ type: 'FeatureCollection', features });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawingPoints]);

  return (
    <>
      <style>{`
        .maplibregl-ctrl-group{background:#fff!important;border:1px solid #e2e8f0!important;border-radius:10px!important;box-shadow:0 2px 8px rgba(0,0,0,0.1)!important}
        .maplibregl-ctrl-group button{background:#fff!important;border-bottom:1px solid #f1f5f9!important}
        .maplibregl-ctrl-group button:hover{background:#f8fafc!important}
        .maplibregl-popup-content{padding:0!important;border-radius:12px!important;box-shadow:0 8px 30px rgba(0,0,0,0.15)!important;border:none!important;overflow:hidden}
        .maplibregl-popup-tip{border-top-color:#fff!important}
      `}</style>
      <div ref={containerRef} style={{ width: '100%', height: '100%', borderRadius: 'inherit' }} />
    </>
  );
}
