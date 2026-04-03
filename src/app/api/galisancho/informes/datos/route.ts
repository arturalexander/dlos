import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import {
  collection, query, orderBy, limit, getDocs,
  where, Timestamp, addDoc,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtDate(ts: any) {
  if (!ts) return '—';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
}
function fmtTime(ts: any) {
  if (!ts) return '';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}
function cleanName(n: string) { return (n || '').replace(/^dlos_/, ''); }

// ── Tiempo real (Open-Meteo) ──────────────────────────────────────────────────
async function fetchWeather() {
  try {
    const url = 'https://api.open-meteo.com/v1/forecast?latitude=37.7923&longitude=-6.2046&current=temperature_2m,relative_humidity_2m,windspeed_10m,weathercode&timezone=Europe%2FMadrid';
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return null;
    const data = await res.json();
    const c = data.current;
    return { temp: c.temperature_2m?.toFixed(0), humedad: c.relative_humidity_2m, viento: c.windspeed_10m?.toFixed(0) };
  } catch { return null; }
}

// ── POST /api/galisancho/informes/datos ───────────────────────────────────────
export async function POST(req: NextRequest) {
  const { desde, hasta, periodo } = await req.json().catch(() => ({}));
  if (!desde || !hasta) return NextResponse.json({ error: 'Faltan fechas' }, { status: 400 });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'Falta GEMINI_API_KEY' }, { status: 500 });

  const desdeDate = new Date(desde);
  const hastaDate = new Date(hasta);
  hastaDate.setHours(23, 59, 59, 999);

  try {
    // ── Misiones del período ───────────────────────────────────────────────────
    const [misionesSnap, pinsSnap, insightsSnap, convSnap] = await Promise.all([
      getDocs(query(
        collection(db, 'processing_jobs'),
        where('createdAt', '>=', Timestamp.fromDate(desdeDate)),
        where('createdAt', '<=', Timestamp.fromDate(hastaDate)),
        orderBy('createdAt', 'desc'),
        limit(100),
      )),
      getDocs(query(collection(db, 'map_items'), orderBy('createdAt', 'desc'), limit(50))),
      getDocs(query(collection(db, 'ai_insights'), orderBy('createdAt', 'desc'), limit(20))),
      getDocs(query(
        collection(db, 'ai_conversations'),
        where('createdAt', '>=', Timestamp.fromDate(desdeDate)),
        where('createdAt', '<=', Timestamp.fromDate(hastaDate)),
        orderBy('createdAt', 'desc'),
        limit(30),
      )),
    ]);

    const misiones = misionesSnap.docs.map(d => {
      const data = d.data();
      const r = data.results ?? {};
      const animales = r.totalCows ?? r.totalAnimals ?? 0;
      const personas = r.totalPersons ?? 0;
      const vehiculos = r.totalVehicles ?? 0;
      return {
        id: d.id,
        nombre: cleanName(data.missionName || d.id),
        estado: data.status as string,
        fecha: fmtDate(data.createdAt),
        hora: fmtTime(data.createdAt),
        animales,
        personas,
        vehiculos,
        altitud: r.flightInfo?.avgAltitude ? `${Number(r.flightInfo.avgAltitude).toFixed(0)} m` : '—',
        duracion: data.processingTimeSeconds ? `${(data.processingTimeSeconds / 60).toFixed(0)} min` : '—',
      };
    });

    const completadas = misiones.filter(m => m.estado === 'completed');
    const totalAnimales = completadas.reduce((s, m) => s + m.animales, 0);
    const totalPersonas = completadas.reduce((s, m) => s + m.personas, 0);
    const totalVehiculos = completadas.reduce((s, m) => s + m.vehiculos, 0);
    const mediaAnimales = completadas.length ? (totalAnimales / completadas.length).toFixed(1) : '0';
    const mejorVuelo = [...completadas].sort((a, b) => b.animales - a.animales)[0];

    const stats = {
      totalMisiones: misiones.length,
      completadas: completadas.length,
      enProceso: misiones.filter(m => ['processing', 'starting', 'queued'].includes(m.estado)).length,
      totalAnimales,
      totalPersonas,
      totalVehiculos,
      mediaAnimales,
      mejorVuelo: mejorVuelo ? `${mejorVuelo.nombre} (${mejorVuelo.animales} animales, ${mejorVuelo.fecha})` : null,
    };

    // Datos diarios para gráfica (animales por vuelo — últimos 15 vuelos completados)
    const graficaVuelos = completadas.slice(0, 15).reverse().map(m => ({
      label: m.fecha.replace(/\d{4}$/, '').trim(),
      animales: m.animales,
    }));

    const mapItems = pinsSnap.docs.map(d => {
      const data = d.data();
      return { tipo: data.type, nombre: data.name, tag: data.tag ?? null };
    });

    const insights = insightsSnap.docs.map(d => ({ text: d.data().text, category: d.data().category }));

    const conversaciones = convSnap.docs.map(d => ({
      user: d.data().userMessage as string,
      bot: (d.data().botReply as string).slice(0, 300),
    })).reverse();

    const weather = await fetchWeather();

    // ── Gemini: generar resumen ejecutivo ─────────────────────────────────────
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const fmtPeriodo = `${desdeDate.toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })} – ${hastaDate.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}`;

    const prompt = `Eres Antonia, la encargada virtual de Finca Galisancho. Genera un resumen ejecutivo profesional del período ${fmtPeriodo} para incluir en un informe PDF de gestión de la finca.

DATOS DEL PERÍODO:
- Vuelos realizados: ${stats.totalMisiones} (${stats.completadas} completados, ${stats.enProceso} en proceso)
- Animales detectados en total: ${stats.totalAnimales} (media por vuelo: ${stats.mediaAnimales})
- Personas detectadas: ${stats.totalPersonas} | Vehículos: ${stats.totalVehiculos}
- Vuelo destacado: ${stats.mejorVuelo ?? 'Sin datos'}
- Tiempo actual: ${weather ? `${weather.temp}°C, humedad ${weather.humedad}%, viento ${weather.viento} km/h` : 'no disponible'}
- Zonas marcadas en mapa: ${mapItems.length}
- Aprendizajes IA registrados: ${insights.length}
- Conversaciones con Antonia en el período: ${conversaciones.length}

MISIONES DEL PERÍODO:
${misiones.slice(0, 10).map(m => `• ${m.fecha} ${m.hora} — ${m.nombre}: ${m.animales} animales, ${m.personas} personas, ${m.altitud}`).join('\n')}

PATRONES APRENDIDOS:
${insights.slice(0, 5).map(i => `• [${i.category}] ${i.text}`).join('\n') || '— Sin aprendizajes registrados —'}

Genera un resumen ejecutivo estructurado con estos apartados exactos (usa los títulos tal cual):
## Resumen del período
(2-3 frases sobre la actividad general)

## Actividad ganadera
(Qué se detectó, tendencias, vuelo más relevante)

## Estado de la finca
(Zonas marcadas, observaciones generales)

## Aspectos a destacar
(3-4 bullets con lo más relevante del período)

## Recomendaciones
(2-3 recomendaciones concretas basadas en los datos)

Tono profesional. Datos concretos. Sin frases genéricas. Máximo 400 palabras en total.`;

    const result = await model.generateContent(prompt);
    const resumenIA = result.response.text();

    // ── Guardar informe completo en Firestore (incluye datos para recuperar sin regenerar) ──
    const generadoEnStr = new Date().toLocaleDateString('es-ES', {
      day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
    const informeRef = await addDoc(collection(db, 'ai_informes'), {
      periodo:        fmtPeriodo,
      desde:          desdeDate.toISOString(),
      hasta:          hastaDate.toISOString(),
      stats,
      misiones:       misiones.slice(0, 50),       // datos completos para PDF directo
      graficaVuelos,
      mapItems:       mapItems.slice(0, 30),
      insights:       insights.slice(0, 20),
      resumenIA,
      generadoEn:     generadoEnStr,
      totalMisiones:  misiones.length,
      createdAt:      Timestamp.now(),
    });

    return NextResponse.json({
      id: informeRef.id,
      periodo: fmtPeriodo,
      desde: desdeDate.toISOString(),
      hasta: hastaDate.toISOString(),
      stats,
      misiones,
      graficaVuelos,
      mapItems,
      insights,
      conversaciones,
      resumenIA,
      weather,
      generadoEn: new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
    });

  } catch (e: any) {
    console.error('[INFORMES] Error:', e);
    return NextResponse.json({ error: 'Error generando informe', detail: e.message }, { status: 500 });
  }
}
