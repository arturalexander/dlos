'use client';
import { useEffect, useRef } from 'react';
import 'maplibre-gl/dist/maplibre-gl.css';

const FARM_LAT =  37.79234586219361;
const FARM_LNG = -6.204572703283015;

export interface DronePoint {
  lat: number;
  lng: number;
  course: number;        // grados 0-360
  altitudeMSL: number;
  heightAGL: number;
  speedKmh: number;
  flightStatus: string;
}

interface Props {
  point: DronePoint | null;
  trail: [number, number][];  // [lng, lat] para MapLibre
}

export default function DroneMap({ point, trail }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef       = useRef<any>(null);
  const markerRef    = useRef<any>(null);
  const initializedRef = useRef(false);

  // Inicializar mapa
  useEffect(() => {
    if (!containerRef.current || initializedRef.current) return;
    initializedRef.current = true;

    import('maplibre-gl').then(({ default: maplibregl }) => {
      const map = new maplibregl.Map({
        container: containerRef.current!,
        style: {
          version: 8,
          sources: {
            esri: {
              type: 'raster',
              tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
              tileSize: 256,
              attribution: '© Esri',
              maxzoom: 19,
            },
          },
          layers: [{ id: 'esri-satellite', type: 'raster', source: 'esri' }],
        },
        center: [FARM_LNG, FARM_LAT],
        zoom: 14,
        attributionControl: false,
      });

      map.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'top-right');

      map.on('load', () => {
        // Trail (recorrido del vuelo)
        map.addSource('trail', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        });
        map.addLayer({
          id: 'trail-line',
          type: 'line',
          source: 'trail',
          paint: {
            'line-color': '#f59e0b',
            'line-width': 2.5,
            'line-opacity': 0.8,
            'line-dasharray': [3, 2],
          },
        });

        // Círculo de posición (halo)
        map.addSource('drone-halo', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        });
        map.addLayer({
          id: 'drone-halo-circle',
          type: 'circle',
          source: 'drone-halo',
          paint: {
            'circle-radius': 22,
            'circle-color': '#f59e0b',
            'circle-opacity': 0.15,
            'circle-stroke-color': '#f59e0b',
            'circle-stroke-width': 1.5,
            'circle-stroke-opacity': 0.5,
          },
        });
      });

      mapRef.current = map;
    });

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        markerRef.current = null;
        initializedRef.current = false;
      }
    };
  }, []);

  // Actualizar posición del dron
  useEffect(() => {
    if (!mapRef.current || !point) return;
    const map = mapRef.current;
    if (!map.isStyleLoaded()) return;

    const lngLat: [number, number] = [point.lng, point.lat];

    import('maplibre-gl').then(({ default: maplibregl }) => {
      if (!markerRef.current) {
        // Crear marker HTML del dron
        const el = document.createElement('div');
        el.id = 'drone-marker-el';
        el.style.cssText = `
          width: 44px; height: 44px;
          display: flex; align-items: center; justify-content: center;
          transition: transform 0.5s ease;
        `;
        el.innerHTML = `
          <div style="
            width: 40px; height: 40px;
            background: #f59e0b;
            border-radius: 50%;
            border: 3px solid white;
            box-shadow: 0 0 0 3px rgba(245,158,11,0.35), 0 4px 16px rgba(0,0,0,0.4);
            display: flex; align-items: center; justify-content: center;
            animation: dronePulse 2s ease-in-out infinite;
          ">
            <span class="material-icons-round" style="color:white;font-size:20px;transform:rotate(${point.course - 45}deg);transition:transform 0.5s ease;">flight</span>
          </div>
        `;

        // Añadir keyframes de pulso al documento
        if (!document.getElementById('drone-pulse-style')) {
          const style = document.createElement('style');
          style.id = 'drone-pulse-style';
          style.textContent = `
            @keyframes dronePulse {
              0%, 100% { box-shadow: 0 0 0 3px rgba(245,158,11,0.35), 0 4px 16px rgba(0,0,0,0.4); }
              50%       { box-shadow: 0 0 0 8px rgba(245,158,11,0.15), 0 4px 16px rgba(0,0,0,0.4); }
            }
          `;
          document.head.appendChild(style);
        }

        const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
          .setLngLat(lngLat)
          .addTo(map);

        markerRef.current = { marker, el };
      } else {
        // Actualizar posición y rotación
        markerRef.current.marker.setLngLat(lngLat);
        const icon = markerRef.current.el.querySelector('.material-icons-round');
        if (icon) icon.style.transform = `rotate(${point.course - 45}deg)`;
      }

      // Suave pan al dron si está fuera de la vista
      const bounds = map.getBounds();
      if (!bounds.contains(lngLat)) {
        map.easeTo({ center: lngLat, duration: 800 });
      }

      // Actualizar halo
      (map.getSource('drone-halo') as any)?.setData({
        type: 'FeatureCollection',
        features: [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: lngLat } }],
      });
    });
  }, [point]);

  // Actualizar trail
  useEffect(() => {
    if (!mapRef.current || !trail.length) return;
    const map = mapRef.current;
    if (!map.isStyleLoaded()) return;

    (map.getSource('trail') as any)?.setData({
      type: 'FeatureCollection',
      features: trail.length > 1 ? [{
        type: 'Feature',
        properties: {},
        geometry: { type: 'LineString', coordinates: trail },
      }] : [],
    });
  }, [trail]);

  return (
    <div ref={containerRef} className="w-full h-full" />
  );
}
