'use client';

// Deteccion de incendios — Simulacion + preparado para cámaras reales
// TODO: Conectar con API de cámara termográfica (FLIR, Hikvision, empresa proveedora)
// TODO: Conectar con stream RTSP/WebRTC para feed en tiempo real

import { useState, useEffect, useCallback } from 'react';

// ── Weather API (Open-Meteo, free, no API key) ────────────────────────────────
const FARM_LAT = 39.928;
const FARM_LON = -5.653;

interface WeatherData {
  temperature: number;
  humidity: number;
  windSpeed: number;
  weatherCode: number;
  precipitation: number;
  updatedAt: Date;
}

interface FireRisk {
  level: 'BAJO' | 'MODERADO' | 'ALTO' | 'EXTREMO';
  score: number;
  textColor: string;
  bgColor: string;
  borderColor: string;
  barColor: string;
}

function calcFireRisk(temp: number, hum: number, wind: number): FireRisk {
  const tF = Math.max(0, Math.min(1, (temp - 15) / 25));
  const hF = Math.max(0, Math.min(1, (85 - hum) / 65));
  const wF = Math.max(0, Math.min(1, wind / 60));
  const score = Math.round((tF * 0.45 + hF * 0.40 + wF * 0.15) * 100);
  if (score >= 70) return { level: 'EXTREMO',  score, textColor: 'text-red-400',    bgColor: 'bg-red-950/60',    borderColor: 'border-red-800/60',    barColor: 'bg-red-500' };
  if (score >= 50) return { level: 'ALTO',     score, textColor: 'text-orange-400', bgColor: 'bg-orange-950/60', borderColor: 'border-orange-800/60', barColor: 'bg-orange-500' };
  if (score >= 25) return { level: 'MODERADO', score, textColor: 'text-yellow-400', bgColor: 'bg-yellow-950/60', borderColor: 'border-yellow-800/60', barColor: 'bg-yellow-500' };
  return                   { level: 'BAJO',    score, textColor: 'text-green-400',  bgColor: 'bg-green-950/60',  borderColor: 'border-green-800/60',  barColor: 'bg-green-500' };
}

function getWeatherIcon(code: number): string {
  if (code === 0) return 'wb_sunny';
  if (code <= 3)  return 'partly_cloudy_day';
  if (code <= 48) return 'foggy';
  if (code <= 67) return 'rainy';
  if (code <= 77) return 'ac_unit';
  if (code <= 82) return 'water_drop';
  return 'thunderstorm';
}

type CamStatus = 'normal' | 'alerta' | 'desconectada';

interface Camera {
  id: string;
  name: string;
  location: string;
  status: CamStatus;
  temp: number;
  humidity: number;
  windSpeed: number;
  lastSeen: Date;
  confidence?: number;
  battery?: number; // future: sensor battery %
}

interface FireEvent {
  id: string;
  cameraId: string;
  cameraName: string;
  timestamp: Date;
  confidence: number;
  maxTemp: number;
  status: 'activa' | 'resuelta' | 'falsa_alarma';
}

const INITIAL_CAMERAS: Camera[] = [
  { id: 'CAM-01', name: 'Norte Dehesa',  location: 'Sector Norte · Parcela 3',       status: 'normal',      temp: 22.3, humidity: 45, windSpeed: 8,  lastSeen: new Date(), battery: 87 },
  { id: 'CAM-02', name: 'Sur Entrada',   location: 'Acceso Principal · Zona 1',      status: 'alerta',      temp: 38.7, humidity: 18, windSpeed: 15, lastSeen: new Date(), confidence: 87, battery: 64 },
  { id: 'CAM-03', name: 'Este Río',      location: 'Ribera del Río · Sector E',      status: 'normal',      temp: 24.1, humidity: 62, windSpeed: 5,  lastSeen: new Date(), battery: 95 },
  { id: 'CAM-04', name: 'Oeste Bosque',  location: 'Zona Arbolada · Sector O',       status: 'desconectada',temp: 0,    humidity: 0,  windSpeed: 0,  lastSeen: new Date(Date.now() - 6 * 3600000) },
];

const INITIAL_EVENTS: FireEvent[] = [
  { id: 'e1', cameraId: 'CAM-02', cameraName: 'Sur Entrada',  timestamp: new Date(Date.now() - 5 * 60000),        confidence: 87, maxTemp: 38.7, status: 'activa' },
  { id: 'e2', cameraId: 'CAM-01', cameraName: 'Norte Dehesa', timestamp: new Date(Date.now() - 2 * 3600000),      confidence: 62, maxTemp: 31.2, status: 'falsa_alarma' },
  { id: 'e3', cameraId: 'CAM-03', cameraName: 'Este Río',     timestamp: new Date(Date.now() - 26 * 3600000),     confidence: 91, maxTemp: 45.1, status: 'resuelta' },
  { id: 'e4', cameraId: 'CAM-01', cameraName: 'Norte Dehesa', timestamp: new Date(Date.now() - 3 * 24 * 3600000), confidence: 78, maxTemp: 39.0, status: 'resuelta' },
];

interface FuegoTabProps {
  onAlarm?: (count: number) => void;
}

// Thermal color gradient for temperature display
function getThermalColor(temp: number): string {
  if (temp >= 40) return '#ff2200';
  if (temp >= 35) return '#ff6600';
  if (temp >= 30) return '#ff9900';
  if (temp >= 25) return '#ffcc00';
  return '#00aaff';
}

export default function FuegoTab({ onAlarm }: FuegoTabProps) {
  const [cameras, setCameras] = useState<Camera[]>(INITIAL_CAMERAS);
  const [events, setEvents] = useState<FireEvent[]>(INITIAL_EVENTS);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [sentResults, setSentResults] = useState<Record<string, { ok: boolean; channels: number }>>({});
  const [selectedCam, setSelectedCam] = useState<string | null>('CAM-02');
  const [weather, setWeather] = useState<WeatherData | null>(null);

  // Fetch real weather data
  useEffect(() => {
    const fetchWeather = async () => {
      try {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${FARM_LAT}&longitude=${FARM_LON}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code,precipitation&timezone=Europe%2FMadrid&wind_speed_unit=kmh`;
        const res = await fetch(url);
        const data = await res.json();
        const c = data.current;
        setWeather({
          temperature:   Math.round(c.temperature_2m),
          humidity:      Math.round(c.relative_humidity_2m),
          windSpeed:     Math.round(c.wind_speed_10m),
          weatherCode:   c.weather_code,
          precipitation: c.precipitation,
          updatedAt:     new Date(),
        });
      } catch {
        // non-critical
      }
    };
    fetchWeather();
    const interval = setInterval(fetchWeather, 15 * 60 * 1000); // refresh every 15 min
    return () => clearInterval(interval);
  }, []);

  // Notify parent of active alarm count
  useEffect(() => {
    onAlarm?.(cameras.filter(c => c.status === 'alerta').length);
  }, [cameras, onAlarm]);

  // Simulate live sensor drift
  useEffect(() => {
    const iv = setInterval(() => {
      setCameras(prev => prev.map(cam => {
        if (cam.status === 'desconectada') return cam;
        const drift = (Math.random() - 0.45) * 0.3;
        return { ...cam, temp: Math.max(18, Math.min(55, cam.temp + drift)) };
      }));
    }, 4000);
    return () => clearInterval(iv);
  }, []);

  const sendAlert = useCallback(async (cam: Camera) => {
    setSendingId(cam.id);
    try {
      const res = await fetch('/api/blasson/alarma', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipo: 'fuego', severidad: 'alta',
          fuente: `${cam.id} — ${cam.name}`,
          mensaje: `Posible incendio en ${cam.location}. T°: ${cam.temp.toFixed(1)}°C, Humedad: ${cam.humidity}%, Viento: ${cam.windSpeed} km/h.${cam.confidence ? ` Confianza IA: ${cam.confidence}%.` : ''}`,
          ubicacion: cam.location,
          confianza: cam.confidence,
        }),
      });
      const data = await res.json();
      setSentResults(prev => ({ ...prev, [cam.id]: { ok: data.status === 'success', channels: data.channelsSent ?? 0 } }));
    } catch {
      setSentResults(prev => ({ ...prev, [cam.id]: { ok: false, channels: 0 } }));
    }
    setSendingId(null);
  }, []);

  const resolveAlarm = (id: string) => {
    setCameras(prev => prev.map(c => c.id === id ? { ...c, status: 'normal', confidence: undefined } : c));
    setEvents(prev => prev.map(e => e.cameraId === id && e.status === 'activa' ? { ...e, status: 'resuelta' } : e));
  };

  const markFalse = (id: string) => {
    setCameras(prev => prev.map(c => c.id === id ? { ...c, status: 'normal', confidence: undefined } : c));
    setEvents(prev => prev.map(e => e.cameraId === id && e.status === 'activa' ? { ...e, status: 'falsa_alarma' } : e));
  };

  const formatTime = (d: Date) => {
    const diff = Date.now() - d.getTime();
    if (diff < 60000)  return 'Ahora';
    if (diff < 3600000) return `${Math.floor(diff / 60000)} min`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;
    return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
  };

  const alertCams = cameras.filter(c => c.status === 'alerta');
  const selected = cameras.find(c => c.id === selectedCam) ?? cameras[0];
  const sr = selected ? sentResults[selected.id] : undefined;
  const isSending = sendingId === selected?.id;
  const fireRisk = weather ? calcFireRisk(weather.temperature, weather.humidity, weather.windSpeed) : null;

  return (
    <div className="h-full overflow-y-auto bg-slate-950">

      {/* Alert banner */}
      {alertCams.length > 0 && (
        <div className="bg-red-600 px-4 py-2.5 flex items-center gap-3">
          <span className="material-icons-round animate-pulse text-lg">local_fire_department</span>
          <p className="font-black text-sm">
            ALERTA ACTIVA — {alertCams.map(c => c.name).join(', ')}
          </p>
          <span className="ml-auto text-red-200 text-xs">{new Date().toLocaleTimeString('es-ES')}</span>
        </div>
      )}

      {/* Weather + fire risk strip */}
      <div className="bg-slate-900 border-b border-white/10 px-4 py-2.5">
        {weather ? (
          <div className="flex items-center gap-4 flex-wrap">
            {/* Weather */}
            <div className="flex items-center gap-2">
              <span className="material-icons-round text-base text-slate-400">{getWeatherIcon(weather.weatherCode)}</span>
              <span className="text-sm font-bold text-white">{weather.temperature}°C</span>
              <span className="text-slate-500 text-xs hidden sm:inline">Finca · Cáceres</span>
            </div>
            <div className="flex items-center gap-3 text-xs text-slate-400">
              <span className="flex items-center gap-1">
                <span className="material-icons-round text-xs">water_drop</span>
                {weather.humidity}% hum
              </span>
              <span className="flex items-center gap-1">
                <span className="material-icons-round text-xs">air</span>
                {weather.windSpeed} km/h
              </span>
              {weather.precipitation > 0 && (
                <span className="flex items-center gap-1">
                  <span className="material-icons-round text-xs">rainy</span>
                  {weather.precipitation}mm
                </span>
              )}
            </div>
            {/* Fire risk badge */}
            {fireRisk && (
              <div className={`ml-auto flex items-center gap-2 px-3 py-1 rounded-lg ${fireRisk.bgColor} border ${fireRisk.borderColor}`}>
                <span className={`material-icons-round text-sm ${fireRisk.textColor}`}>local_fire_department</span>
                <div>
                  <p className={`text-[10px] font-black uppercase tracking-wider ${fireRisk.textColor}`}>
                    Riesgo {fireRisk.level}
                  </p>
                  <div className="h-1 w-20 bg-white/10 rounded-full mt-0.5 overflow-hidden">
                    <div className={`h-full rounded-full ${fireRisk.barColor}`} style={{ width: `${fireRisk.score}%` }} />
                  </div>
                </div>
                <span className={`text-lg font-black ${fireRisk.textColor}`}>{fireRisk.score}</span>
              </div>
            )}
            <span className="text-[10px] text-slate-700 hidden lg:block">
              Open-Meteo · {weather.updatedAt.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-slate-600 text-xs">
            <div className="w-3 h-3 border border-slate-600 border-t-slate-400 rounded-full animate-spin" />
            Cargando meteorología...
          </div>
        )}
      </div>

      <div className="flex flex-col lg:flex-row h-full min-h-0">

        {/* ── Left panel: camera list ── */}
        <div className="lg:w-72 xl:w-80 shrink-0 border-r border-white/10 bg-slate-900 flex flex-col">

          <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-slate-300">Cámaras</p>
              <p className="text-[10px] text-slate-500">{cameras.filter(c => c.status !== 'desconectada').length}/{cameras.length} online</p>
            </div>
            <div className="flex gap-1.5">
              <span className="flex items-center gap-1 text-[10px] text-green-400">
                <span className="w-1.5 h-1.5 bg-green-500 rounded-full" />{cameras.filter(c => c.status === 'normal').length} ok
              </span>
              {alertCams.length > 0 && (
                <span className="flex items-center gap-1 text-[10px] text-red-400">
                  <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />{alertCams.length} alerta
                </span>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-white/5">
            {cameras.map(cam => (
              <button
                key={cam.id}
                onClick={() => setSelectedCam(cam.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-white/5 ${selectedCam === cam.id ? 'bg-white/10 border-l-2 border-primary' : ''}`}
              >
                {/* Status dot */}
                <div className="shrink-0 relative">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                    cam.status === 'alerta'       ? 'bg-red-900' :
                    cam.status === 'desconectada' ? 'bg-slate-800' : 'bg-slate-700'
                  }`}>
                    <span className={`material-icons-round text-sm ${
                      cam.status === 'alerta'       ? 'text-red-400 animate-pulse' :
                      cam.status === 'desconectada' ? 'text-slate-600' : 'text-slate-400'
                    }`}>
                      {cam.status === 'desconectada' ? 'videocam_off' : 'videocam'}
                    </span>
                  </div>
                  <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border border-slate-900 ${
                    cam.status === 'alerta'       ? 'bg-red-500 animate-pulse' :
                    cam.status === 'desconectada' ? 'bg-slate-600' : 'bg-green-500'
                  }`} />
                </div>

                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-semibold truncate ${
                    cam.status === 'alerta' ? 'text-red-300' :
                    cam.status === 'desconectada' ? 'text-slate-600' : 'text-slate-200'
                  }`}>{cam.name}</p>
                  <p className="text-[10px] text-slate-500 truncate">{cam.id} · {cam.location.split('·')[0].trim()}</p>
                </div>

                {cam.status !== 'desconectada' && (
                  <div className="text-right shrink-0">
                    <p className="text-xs font-bold font-mono" style={{ color: getThermalColor(cam.temp) }}>
                      {cam.temp.toFixed(1)}°
                    </p>
                    <p className="text-[10px] text-slate-600">{cam.humidity}%</p>
                  </div>
                )}
                {cam.status === 'desconectada' && (
                  <span className="text-[10px] text-slate-600">OFFLINE</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* ── Main: selected camera detail ── */}
        {selected && (
          <div className="flex-1 flex flex-col min-w-0 bg-slate-950">

            {/* Camera header */}
            <div className="px-5 py-3 border-b border-white/10 flex items-center gap-3">
              <span className={`text-sm font-black ${
                selected.status === 'alerta' ? 'text-red-400' :
                selected.status === 'desconectada' ? 'text-slate-500' : 'text-slate-300'
              }`}>{selected.name}</span>
              <span className="text-slate-600 text-sm">·</span>
              <span className="text-slate-500 text-xs">{selected.location}</span>
              <div className="ml-auto flex items-center gap-2">
                <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                  selected.status === 'alerta'       ? 'bg-red-500/20 text-red-400' :
                  selected.status === 'desconectada' ? 'bg-slate-800 text-slate-500' :
                                                       'bg-green-500/20 text-green-400'
                }`}>
                  {selected.status === 'alerta' ? '● ALERTA' : selected.status === 'desconectada' ? '● OFFLINE' : '● OK'}
                </span>
                <span className="text-slate-600 text-xs font-mono">{new Date().toLocaleTimeString('es-ES')}</span>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-5 bg-slate-950">

              {/* Simulated camera feed */}
              <div className={`relative rounded-2xl overflow-hidden aspect-video max-w-2xl ${
                selected.status === 'alerta'       ? 'bg-gradient-to-br from-red-950 via-orange-900 to-red-950' :
                selected.status === 'desconectada' ? 'bg-slate-900' :
                                                     'bg-gradient-to-br from-slate-800 to-slate-900'
              }`}>
                {/* Thermal overlay for alert */}
                {selected.status === 'alerta' && (
                  <>
                    <div className="absolute inset-0 flex items-end justify-center pb-8 opacity-30">
                      <div className="w-32 h-32 rounded-full bg-orange-500 blur-3xl animate-pulse" />
                    </div>
                    <div className="absolute inset-0 flex items-end justify-start pl-12 pb-16 opacity-20">
                      <div className="w-20 h-20 rounded-full bg-yellow-400 blur-2xl animate-pulse" style={{ animationDelay: '0.5s' }} />
                    </div>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="material-icons-round text-8xl text-orange-300/50 animate-pulse">local_fire_department</span>
                    </div>
                  </>
                )}

                {selected.status === 'desconectada' && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                    <span className="material-icons-round text-5xl text-slate-700">videocam_off</span>
                    <p className="text-slate-600 text-sm font-medium">Sin señal</p>
                    <p className="text-slate-700 text-xs">Última conexión: {formatTime(selected.lastSeen)}</p>
                  </div>
                )}

                {selected.status === 'normal' && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                    <span className="material-icons-round text-4xl text-slate-600">videocam</span>
                    <p className="text-slate-500 text-xs">Simulación — conectar stream RTSP</p>
                  </div>
                )}

                {/* Overlays */}
                {selected.status !== 'desconectada' && (
                  <>
                    {/* Camera ID */}
                    <div className="absolute top-3 left-3 bg-black/60 backdrop-blur-sm px-2 py-1 rounded-lg flex items-center gap-2">
                      <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
                      <span className="text-white/80 text-xs font-mono">{selected.id}</span>
                    </div>

                    {/* Temperature thermal */}
                    <div className="absolute top-3 right-3 bg-black/60 backdrop-blur-sm px-2.5 py-1.5 rounded-xl text-center">
                      <p className="font-black font-mono text-lg leading-none" style={{ color: getThermalColor(selected.temp) }}>
                        {selected.temp.toFixed(1)}°C
                      </p>
                      <p className="text-[9px] text-white/40 mt-0.5">TEMP</p>
                    </div>

                    {/* AI confidence for alert */}
                    {selected.status === 'alerta' && selected.confidence !== undefined && (
                      <div className="absolute bottom-3 left-3 bg-red-500/80 backdrop-blur-sm px-3 py-1.5 rounded-xl flex items-center gap-2">
                        <span className="material-icons-round text-white text-sm">smart_toy</span>
                        <div>
                          <p className="text-white text-xs font-black">Confianza IA: {selected.confidence}%</p>
                          <p className="text-red-200 text-[9px]">POSIBLE INCENDIO</p>
                        </div>
                      </div>
                    )}

                    {/* Timestamp */}
                    <div className="absolute bottom-3 right-3 bg-black/50 px-2 py-0.5 rounded text-[10px] text-white/40 font-mono">
                      {new Date().toLocaleTimeString('es-ES')}
                    </div>
                  </>
                )}
              </div>

              {/* Sensor metrics */}
              {selected.status !== 'desconectada' && (
                <div className="grid grid-cols-4 gap-3 max-w-2xl">
                  {[
                    { label: 'Temperatura', value: `${selected.temp.toFixed(1)}°C`, icon: 'thermostat',   warn: selected.temp > 30, color: getThermalColor(selected.temp) },
                    { label: 'Humedad',     value: `${selected.humidity}%`,          icon: 'water_drop',   warn: selected.humidity < 25 },
                    { label: 'Viento',      value: `${selected.windSpeed} km/h`,     icon: 'air',          warn: selected.windSpeed > 20 },
                    { label: 'Batería',     value: `${selected.battery ?? '--'}%`,   icon: 'battery_4_bar', warn: (selected.battery ?? 100) < 20 },
                  ].map(m => (
                    <div key={m.label} className={`rounded-xl p-3 border ${m.warn ? 'bg-orange-950/50 border-orange-800/50' : 'bg-white/5 border-white/10'}`}>
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className={`material-icons-round text-xs ${m.warn ? 'text-orange-400' : 'text-slate-500'}`}>{m.icon}</span>
                        <p className="text-[10px] text-slate-500">{m.label}</p>
                      </div>
                      <p className="text-base font-black" style={m.color ? { color: m.color } : { color: m.warn ? '#fb923c' : '#e2e8f0' }}>
                        {m.value}
                      </p>
                    </div>
                  ))}
                </div>
              )}

              {/* Alert actions */}
              {selected.status === 'alerta' && (
                <div className="bg-red-950/50 border border-red-800/50 rounded-2xl p-5 max-w-2xl">
                  <div className="flex items-center gap-2 mb-4">
                    <span className="material-icons-round text-red-400">warning</span>
                    <h3 className="font-black text-red-300">Acciones de respuesta</h3>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => sendAlert(selected)}
                      disabled={isSending}
                      className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all ${
                        sr?.ok
                          ? 'bg-green-600 text-white'
                          : 'bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-60'
                      }`}
                    >
                      <span className="material-icons-round text-base">{isSending ? 'hourglass_empty' : sr?.ok ? 'check_circle' : 'send'}</span>
                      {isSending ? 'Enviando...' : sr?.ok ? `Enviado a ${sr.channels} canal${sr.channels !== 1 ? 'es' : ''}` : 'Alertar por Telegram'}
                    </button>
                    <button
                      onClick={() => resolveAlarm(selected.id)}
                      className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold bg-green-900/60 hover:bg-green-800/60 text-green-300 border border-green-800/50 transition-colors"
                    >
                      <span className="material-icons-round text-base">check_circle</span>
                      Incendio controlado
                    </button>
                    <button
                      onClick={() => markFalse(selected.id)}
                      className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
                    >
                      <span className="material-icons-round text-base">cancel</span>
                      Falsa alarma
                    </button>
                  </div>
                </div>
              )}

              {/* Detection history */}
              <div className="bg-white/5 rounded-2xl border border-white/10 overflow-hidden max-w-2xl">
                <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-300">Historial de detecciones</h3>
                  <span className="text-xs text-slate-600">Últimos 7 días</span>
                </div>
                {events.filter(e => e.cameraId === selected.id).length === 0 ? (
                  <div className="py-8 text-center text-slate-700 text-sm">Sin detecciones</div>
                ) : (
                  <div className="divide-y divide-white/5">
                    {events.filter(e => e.cameraId === selected.id).map(evt => (
                      <div key={evt.id} className="flex items-center gap-3 px-4 py-3">
                        <span className={`material-icons-round text-sm ${
                          evt.status === 'activa' ? 'text-red-400' : evt.status === 'resuelta' ? 'text-green-400' : 'text-slate-600'
                        }`}>
                          {evt.status === 'activa' ? 'local_fire_department' : evt.status === 'resuelta' ? 'check_circle' : 'cancel'}
                        </span>
                        <div className="flex-1">
                          <p className="text-xs text-slate-400">{formatTime(evt.timestamp)} · T° máx: <span className="font-mono" style={{ color: getThermalColor(evt.maxTemp) }}>{evt.maxTemp}°C</span> · IA: {evt.confidence}%</p>
                        </div>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          evt.status === 'activa' ? 'bg-red-900/60 text-red-400' :
                          evt.status === 'resuelta' ? 'bg-green-900/60 text-green-400' :
                          'bg-slate-800 text-slate-500'
                        }`}>
                          {evt.status === 'activa' ? 'ACTIVA' : evt.status === 'resuelta' ? 'RESUELTA' : 'FALSA'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
