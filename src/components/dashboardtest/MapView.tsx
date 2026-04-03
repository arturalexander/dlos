'use client';

// MapView — MapLibre GL JS (WebGL, 3D pitch/bearing)
// Tiles: CartoDB dark matter (free, no API key)
// Loaded dynamically (no SSR) from ConexionesTab

import { useEffect, useRef } from 'react';
import 'maplibre-gl/dist/maplibre-gl.css';

// ── Coordinates (lng, lat for MapLibre) ───────────────────────────────────────
const CENTER:  [number, number] = [-5.6530, 39.9280];
const DOCK_A:  [number, number] = [-5.6445, 39.9345];
const DOCK_B:  [number, number] = [-5.6625, 39.9215];
const CAMERA:  [number, number] = [-5.6512, 39.9288];

// Free CartoDB dark matter style — no API key needed
const STYLE_URL = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }

/** Approximate geographic circle as GeoJSON polygon */
function geoCircle(lon: number, lat: number, radiusKm: number, pts = 64) {
  const coords: [number, number][] = [];
  for (let i = 0; i <= pts; i++) {
    const angle = (i / pts) * 2 * Math.PI;
    const dLon  = (radiusKm / 111.320) * Math.cos(angle) / Math.cos(lat * Math.PI / 180);
    const dLat  = (radiusKm / 110.574) * Math.sin(angle);
    coords.push([lon + dLon, lat + dLat]);
  }
  return coords;
}

/** Create styled HTML element for a marker */
function makeEl(html: string): HTMLElement {
  const el = document.createElement('div');
  el.innerHTML = html;
  return el;
}

const DOCK_HTML = (label: string) => `
  <div style="
    background:rgba(10,14,23,0.92);
    border:2px solid #0073E6;
    border-radius:10px;
    padding:7px 12px;
    color:#0073E6;
    font:700 11px/1.3 system-ui;
    white-space:nowrap;
    box-shadow:0 0 20px rgba(0,115,230,0.55),0 4px 12px rgba(0,0,0,0.6);
    text-align:center;
    cursor:pointer;
  ">
    <div style="font-size:20px;margin-bottom:2px">🏠</div>
    <div>${label}</div>
    <div style="font-size:9px;color:rgba(0,115,230,0.6);margin-top:1px">DJI Dock 2</div>
  </div>`;

const DRONE_HTML = `
  <div style="position:relative;width:48px;height:48px">
    <div style="
      position:absolute;inset:0;border-radius:50%;
      border:2px solid rgba(0,115,230,0.5);
      animation:dRing 1.6s ease-out infinite;
    "></div>
    <div style="
      position:absolute;inset:8px;border-radius:50%;
      background:rgba(10,14,23,0.95);
      border:2px solid #0073E6;
      display:flex;align-items:center;justify-content:center;
      font-size:20px;
      box-shadow:0 0 24px rgba(0,115,230,0.8),0 0 6px rgba(0,115,230,0.4);
      cursor:pointer;
    ">🛩️</div>
  </div>
  <style>
    @keyframes dRing{0%{transform:scale(1);opacity:.7}100%{transform:scale(2);opacity:0}}
  </style>`;

const CAMERA_HTML = `
  <div style="position:relative;width:56px;height:56px">
    <svg style="position:absolute;inset:0;width:100%;height:100%;animation:rSpin 4s linear infinite" viewBox="0 0 56 56">
      <circle cx="28" cy="28" r="26" fill="none" stroke="rgba(239,68,68,0.25)" stroke-width="1.5" stroke-dasharray="4 3"/>
      <path d="M28,28 L28,4 A24,24 0 0,1 49,17 Z" fill="rgba(239,68,68,0.2)"/>
    </svg>
    <div style="
      position:absolute;inset:14px;border-radius:50%;
      background:rgba(10,14,23,0.95);
      border:2px solid #ef4444;
      display:flex;align-items:center;justify-content:center;
      font-size:16px;
      box-shadow:0 0 22px rgba(239,68,68,0.7),0 0 6px rgba(239,68,68,0.3);
      cursor:pointer;
    ">📡</div>
  </div>
  <style>
    @keyframes rSpin{from{transform:rotate(0)}to{transform:rotate(360deg)}}
  </style>`;

export default function MapView() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef       = useRef<any>(null);
  const droneRef     = useRef<any>(null);
  const progRef      = useRef(0);
  const dirRef       = useRef(1);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    import('maplibre-gl').then(({ Map, Marker, NavigationControl, Popup }) => {
      if (!containerRef.current || mapRef.current) return;

      const map = new Map({
        container: containerRef.current!,
        style: STYLE_URL,
        center: CENTER,
        zoom: 13.8,
        pitch: 48,       // ← 3D tilt
        bearing: -18,    // ← slight rotation
        // antialias enabled via canvas options below
      });

      mapRef.current = map;

      // Navigation controls (zoom + compass + pitch)
      map.addControl(new NavigationControl({ visualizePitch: true }), 'top-right');

      map.on('load', () => {
        // ── Finca boundary ──
        map.addSource('finca', {
          type: 'geojson',
          data: {
            type: 'Feature',
            geometry: {
              type: 'Polygon',
              coordinates: [[
                [-5.668, 39.937], [-5.638, 39.937],
                [-5.638, 39.919], [-5.668, 39.919],
                [-5.668, 39.937],
              ]],
            },
            properties: {},
          },
        });
        map.addLayer({ id: 'finca-fill', type: 'fill', source: 'finca', paint: { 'fill-color': '#0073E6', 'fill-opacity': 0.04 } });
        map.addLayer({ id: 'finca-line', type: 'line', source: 'finca', paint: { 'line-color': '#0073E6', 'line-width': 1.5, 'line-dasharray': [5, 3], 'line-opacity': 0.6 } });

        // ── Camera coverage circle ──
        map.addSource('cam-cov', {
          type: 'geojson',
          data: {
            type: 'Feature',
            geometry: { type: 'Polygon', coordinates: [geoCircle(CAMERA[0], CAMERA[1], 0.9)] },
            properties: {},
          },
        });
        map.addLayer({ id: 'cam-fill', type: 'fill', source: 'cam-cov', paint: { 'fill-color': '#ef4444', 'fill-opacity': 0.06 } });
        map.addLayer({ id: 'cam-line', type: 'line', source: 'cam-cov', paint: { 'line-color': '#ef4444', 'line-width': 1, 'line-dasharray': [4, 4], 'line-opacity': 0.45 } });

        // ── Drone flight path ──
        map.addSource('path', {
          type: 'geojson',
          data: { type: 'Feature', geometry: { type: 'LineString', coordinates: [DOCK_A, DOCK_B] }, properties: {} },
        });
        map.addLayer({ id: 'path-line', type: 'line', source: 'path', paint: { 'line-color': '#0073E6', 'line-width': 1.5, 'line-dasharray': [5, 4], 'line-opacity': 0.3 } });

        // ── 3D building extrusion (where available) ──
        map.addLayer({
          id: 'buildings-3d',
          type: 'fill-extrusion',
          source: 'carto',
          'source-layer': 'building',
          paint: {
            'fill-extrusion-color': '#1e293b',
            'fill-extrusion-height': ['get', 'height'],
            'fill-extrusion-base': ['get', 'min_height'],
            'fill-extrusion-opacity': 0.7,
          },
        } as any);

        // ── Markers ──

        // Dock A
        new Marker({ element: makeEl(DOCK_HTML('Dock A')), anchor: 'bottom' })
          .setLngLat(DOCK_A)
          .setPopup(new Popup({ offset: 25 }).setHTML('<div style="background:#111827;color:#e2e8f0;padding:10px 14px;border-radius:8px;font-size:12px"><b>Dock A — Zona Norte</b><br>DJI Dock 2 · Online<br>Drone: <b>Matrice 4TD</b></div>'))
          .addTo(map);

        // Dock B
        new Marker({ element: makeEl(DOCK_HTML('Dock B')), anchor: 'bottom' })
          .setLngLat(DOCK_B)
          .setPopup(new Popup({ offset: 25 }).setHTML('<div style="background:#111827;color:#e2e8f0;padding:10px 14px;border-radius:8px;font-size:12px"><b>Dock B — Zona Sur</b><br>DJI Dock 2 · Online<br>Cargando — 78%</div>'))
          .addTo(map);

        // Camera
        new Marker({ element: makeEl(CAMERA_HTML), anchor: 'center' })
          .setLngLat(CAMERA)
          .setPopup(new Popup({ offset: 30 }).setHTML('<div style="background:#111827;color:#e2e8f0;padding:10px 14px;border-radius:8px;font-size:12px"><b>Cámara SR7 · 360°</b><br>FLIR Térmica + RGB<br><span style="color:#10b981">● Online 24/7</span></div>'))
          .addTo(map);

        // Drone (animated)
        const droneMarker = new Marker({ element: makeEl(DRONE_HTML), anchor: 'center' })
          .setLngLat(DOCK_A)
          .setPopup(new Popup({ offset: 30 }).setHTML('<div style="background:#111827;color:#e2e8f0;padding:10px 14px;border-radius:8px;font-size:12px"><b>DJI Matrice 4TD</b><br>Estado: En vuelo · Alt 120m<br>Batería: 72%</div>'))
          .addTo(map);
        droneRef.current = droneMarker;

        // ── Smooth intro camera animation ──
        setTimeout(() => {
          map.easeTo({ pitch: 55, bearing: -10, zoom: 14.2, duration: 2200, easing: (t) => t < 0.5 ? 2*t*t : -1+(4-2*t)*t });
        }, 800);

        // ── Drone animation loop ──
        const interval = setInterval(() => {
          progRef.current += 0.0022 * dirRef.current;
          if (progRef.current >= 1) { progRef.current = 1; dirRef.current = -1; }
          if (progRef.current <= 0) { progRef.current = 0; dirRef.current  =  1; }
          const lng = lerp(DOCK_A[0], DOCK_B[0], progRef.current);
          const lat = lerp(DOCK_A[1], DOCK_B[1], progRef.current);
          droneRef.current?.setLngLat([lng, lat]);
        }, 50);

        // cleanup interval on style unload
        map.once('remove', () => clearInterval(interval));
      });
    });

    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  return (
    <>
      <style>{`
        .maplibregl-canvas { border-radius: 0 0 12px 12px; }
        .maplibregl-ctrl-group { background: #111827 !important; border: 1px solid #1e293b !important; border-radius: 8px !important; }
        .maplibregl-ctrl-group button { background: #111827 !important; border-bottom: 1px solid #1e293b !important; }
        .maplibregl-ctrl-group button:hover { background: #1e293b !important; }
        .maplibregl-ctrl-icon { filter: invert(0.7) !important; }
        .maplibregl-popup-content { background: #111827 !important; border: 1px solid #1e293b !important; padding: 0 !important; border-radius: 10px !important; box-shadow: 0 8px 32px rgba(0,0,0,0.6) !important; }
        .maplibregl-popup-tip { border-top-color: #111827 !important; }
        .maplibregl-ctrl-compass .maplibregl-ctrl-icon { filter: none !important; }
        .maplibregl-ctrl-pitch-toggle { background-color: #0073E6 !important; }
      `}</style>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
    </>
  );
}
