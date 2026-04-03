import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import {
  collection, query, orderBy, limit, getDocs,
  where, Timestamp, doc, getDoc, addDoc,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { GetObjectCommand } from '@aws-sdk/client-s3';

const s3 = new S3Client({
  region: process.env.AWS_REGION || 'eu-west-1',
  credentials: {
    accessKeyId:     process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});
const BUCKET = process.env.AWS_S3_BUCKET || 'dlosai-media-prod';

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtDate(ts: any) {
  if (!ts) return 'desconocida';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}
function fmtTime(ts: any) {
  if (!ts) return '';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}
function cleanName(n: string) { return (n || '').replace(/^dlos_/, ''); }
function ext(k: string) { return k.slice(k.lastIndexOf('.')).toLowerCase(); }

// ── Obtener thumbnails de S3 para una misión (task UUID) ──────────────────────
async function getMissionThumbnails(taskUuid: string, maxPhotos = 6): Promise<string[]> {
  try {
    const res = await s3.send(new ListObjectsV2Command({
      Bucket: BUCKET,
      Prefix: `fh_sync/`,
      MaxKeys: 2000,
    }));
    const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp']);
    const photos = (res.Contents ?? [])
      .filter(o => o.Key?.includes(taskUuid) && IMAGE_EXTS.has(ext(o.Key ?? '')))
      .slice(0, maxPhotos);

    const urls = await Promise.all(photos.map(o =>
      getSignedUrl(s3, new GetObjectCommand({ Bucket: BUCKET, Key: o.Key! }), { expiresIn: 3600 })
        .catch(() => null)
    ));
    return urls.filter(Boolean) as string[];
  } catch { return []; }
}

// ── Detalle completo de misión desde Firestore ────────────────────────────────
async function getMissionDetail(missionId: string) {
  const snap = await getDoc(doc(db, 'processing_jobs', missionId));
  if (!snap.exists()) return null;
  const d = snap.data();
  const cows: any[] = (d.results?.cows ?? []).slice(0, 20).map((c: any) => ({
    id:  c.cow_id ?? c.id ?? '?',
    lat: c.gps_location?.[0] ?? null,
    lng: c.gps_location?.[1] ?? null,
    conf: c.confidence ? `${(c.confidence * 100).toFixed(0)}%` : null,
  }));
  const thumbnails = await getMissionThumbnails(missionId, 6);
  const r = d.results ?? {};
  // Key captures (max detections, lone cow, etc.) con sus URLs de S3
  const captures: { label: string; url: string }[] = Object.entries(r.captures ?? {})
    .map(([key, c]: [string, any]) => ({
      label: key.replace(/_/g, ' ').replace(/\bcow\b/gi, 'detection').replace(/\bcows\b/gi, 'detections'),
      url: c?.bbox ?? '',
    }))
    .filter(c => !!c.url);
  return {
    id:           snap.id,
    name:         cleanName(d.missionName || snap.id),
    status:       d.status,
    date:         fmtDate(d.createdAt),
    time:         fmtTime(d.createdAt),
    totalCows:    r.totalCows ?? r.totalAnimals ?? 0,
    totalPersons: r.totalPersons ?? 0,
    totalVehicles: r.totalVehicles ?? 0,
    avgAltitude:  r.flightInfo?.avgAltitude
      ? `${Number(r.flightInfo.avgAltitude).toFixed(0)} m` : null,
    cows,
    thumbnails,
    captures,
  };
}

// ── Tiempo real (Open-Meteo, sin API key) ────────────────────────────────────
async function fetchWeather() {
  try {
    const url = 'https://api.open-meteo.com/v1/forecast?latitude=37.7923&longitude=-6.2046&current=temperature_2m,apparent_temperature,relative_humidity_2m,windspeed_10m,weathercode&timezone=Europe%2FMadrid';
    const res = await fetch(url, { next: { revalidate: 1800 } });
    if (!res.ok) return null;
    const data = await res.json();
    const c = data.current;
    const code = c.weathercode ?? 0;
    let desc = 'Despejado';
    if (code === 0) desc = 'Despejado ☀️';
    else if (code <= 2) desc = 'Parcialmente nublado 🌤️';
    else if (code === 3) desc = 'Nublado ☁️';
    else if (code <= 49) desc = 'Niebla 🌫️';
    else if (code <= 67) desc = 'Lluvia 🌧️';
    else if (code <= 77) desc = 'Nieve 🌨️';
    else if (code <= 82) desc = 'Chubascos 🌦️';
    else desc = 'Tormenta ⛈️';
    return {
      temp: c.temperature_2m?.toFixed(0),
      sensacion: c.apparent_temperature?.toFixed(0),
      humedad: c.relative_humidity_2m,
      viento: c.windspeed_10m?.toFixed(0),
      desc,
    };
  } catch { return null; }
}

// ── Memoria — Insights guardados ──────────────────────────────────────────────
async function fetchInsights(): Promise<{ text: string; category: string }[]> {
  try {
    const snap = await getDocs(
      query(collection(db, 'ai_insights'), orderBy('createdAt', 'desc'), limit(12))
    );
    return snap.docs.map(d => ({ text: d.data().text as string, category: d.data().category as string ?? 'general' }));
  } catch { return []; }
}

/** Últimas N conversaciones del chat (para contexto cross-sesión). */
async function fetchRecentConversations(n = 8): Promise<{ user: string; bot: string }[]> {
  try {
    const snap = await getDocs(
      query(collection(db, 'ai_conversations'), orderBy('createdAt', 'desc'), limit(n))
    );
    return snap.docs
      .map(d => ({ user: d.data().userMessage as string, bot: d.data().botReply as string }))
      .reverse(); // cronológico asc
  } catch { return []; }
}

/** Hechos permanentes que el usuario ha dicho explícitamente (sin expirar). */
async function fetchFacts(): Promise<{ text: string }[]> {
  try {
    const snap = await getDocs(
      query(collection(db, 'ai_facts'), orderBy('createdAt', 'desc'), limit(30))
    );
    return snap.docs.map(d => ({ text: d.data().text as string }));
  } catch { return []; }
}

/** Guarda un hecho permanente dicho por el usuario (fire-and-forget). */
function saveFact(text: string) {
  addDoc(collection(db, 'ai_facts'), {
    text,
    source: 'user',
    createdAt: Timestamp.now(),
  }).catch(e => console.warn('[CHAT] Error guardando hecho:', e));
}

/** Configuración estructurada de la finca (documento estático en Firestore). */
async function fetchFincaConfig(): Promise<Record<string, any> | null> {
  try {
    const snap = await getDoc(doc(db, 'finca_config', 'galisancho'));
    return snap.exists() ? snap.data() : null;
  } catch { return null; }
}

/** Guarda un turno de conversación en Firestore con identidad del usuario (fire-and-forget). */
function saveConversation(
  userMessage: string,
  botReply: string,
  meta: { userId?: string | null; userEmail?: string | null; sessionId?: string | null; ip?: string | null }
) {
  addDoc(collection(db, 'ai_conversations'), {
    userMessage,
    botReply,
    userId:    meta.userId    ?? null,
    userEmail: meta.userEmail ?? null,
    sessionId: meta.sessionId ?? null,
    ip:        meta.ip        ?? null,
    createdAt: Timestamp.now(),
  }).catch(e => console.warn('[CHAT] Error guardando conversación:', e));
}

/** Guarda un insight detectado (fire-and-forget). */
function saveInsight(text: string, category: string) {
  addDoc(collection(db, 'ai_insights'), {
    text,
    category,
    source: 'auto',
    createdAt: Timestamp.now(),
  }).catch(e => console.warn('[CHAT] Error guardando insight:', e));
}

// ── Pre-fetch contexto general ────────────────────────────────────────────────
async function fetchContext() {
  const since90 = new Date(); since90.setDate(since90.getDate() - 90);
  const [missionsSnap, allSnap, pinsSnap] = await Promise.all([
    getDocs(query(collection(db,'processing_jobs'), where('createdAt','>=',Timestamp.fromDate(since90)), orderBy('createdAt','desc'), limit(60))),
    getDocs(collection(db,'processing_jobs')),
    getDocs(query(collection(db,'map_items'), orderBy('createdAt','desc'), limit(30))),
  ]);

  const missions = missionsSnap.docs.map(d => {
    const data = d.data();
    const r = data.results ?? {};
    const animales  = r.totalCows      ?? r.totalAnimals    ?? null;
    const personas  = r.totalPersons   ?? r.totalPeople     ?? null;
    const vehiculos = r.totalVehicles  ?? r.totalCars       ?? null;
    const anomalias = r.totalAnomalies ?? r.totalAnomalies  ?? null;
    // Construir resumen de detecciones no-nulas
    const dets: string[] = [];
    if (animales  !== null) dets.push(`${animales} animales`);
    if (personas  !== null && personas  > 0) dets.push(`${personas} personas`);
    if (vehiculos !== null && vehiculos > 0) dets.push(`${vehiculos} vehículos`);
    if (anomalias !== null && anomalias > 0) dets.push(`${anomalias} anomalías`);
    return {
      id:         d.id,
      name:       cleanName(data.missionName || d.id),
      status:     data.status,
      fecha:      fmtDate(data.createdAt),
      hora:       fmtTime(data.createdAt),
      animales,
      personas,
      vehiculos,
      anomalias,
      detecciones: dets.length ? dets.join(', ') : (data.status === 'completed' ? '0 detecciones' : null),
      altitud:    r.flightInfo?.avgAltitude ? `${Number(r.flightInfo.avgAltitude).toFixed(0)}m` : null,
      duracion:   data.processingTimeSeconds ? `${(data.processingTimeSeconds/60).toFixed(0)}min` : null,
    };
  });

  const allMissions = allSnap.docs.map(d => d.data());
  const completadas = allMissions.filter(m => m.status === 'completed');
  const totalAnimales  = completadas.reduce((s,m) => s + (m.results?.totalCows ?? m.results?.totalAnimals ?? 0), 0);
  const totalPersonas  = completadas.reduce((s,m) => s + (m.results?.totalPersons ?? 0), 0);
  const totalVehiculos = completadas.reduce((s,m) => s + (m.results?.totalVehicles ?? 0), 0);
  const mejor = [...completadas].sort((a,b) =>
    ((b.results?.totalCows ?? b.results?.totalAnimals ?? 0) - (a.results?.totalCows ?? a.results?.totalAnimals ?? 0))
  )[0];

  const stats = {
    totalMisiones:       allMissions.length,
    completadas:         completadas.length,
    enProceso:           allMissions.filter(m => ['processing','starting','queued'].includes(m.status)).length,
    totalAnimalesDetectados:  totalAnimales,
    totalPersonasDetectadas:  totalPersonas,
    totalVehiculosDetectados: totalVehiculos,
    mediaPorVuelo:       completadas.length ? (totalAnimales / completadas.length).toFixed(1) : 0,
    mejorVuelo:          mejor ? `${cleanName(mejor.missionName)} (${mejor.results?.totalCows ?? mejor.results?.totalAnimals ?? 0} animales)` : null,
  };

  const mapItems = pinsSnap.docs.map(d => {
    const data = d.data();
    return { tipo: data.type, nombre: data.name, tag: data.tag??null, lat: data.lat?.toFixed(5), lng: data.lng?.toFixed(5), fecha: fmtDate(data.createdAt) };
  });

  return { missions, stats, mapItems };
}

// ── POST /api/chat/galisancho ─────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const { message, history = [], userId = null, userEmail = null, sessionId = null } =
    await req.json().catch(() => ({ message:'', history:[] }));
  if (!message?.trim()) return NextResponse.json({ error:'empty' }, { status:400 });

  // IP del cliente (Vercel/Next pasa x-forwarded-for)
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
          ?? req.headers.get('x-real-ip')
          ?? null;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ reply:'Falta GEMINI_API_KEY en .env.local' });

  let ctx, weather, insights, recentConvs, facts, fincaConfig;
  try {
    [ctx, weather, insights, recentConvs, facts, fincaConfig] = await Promise.all([
      fetchContext(), fetchWeather(), fetchInsights(), fetchRecentConversations(8), fetchFacts(), fetchFincaConfig(),
    ]);
  } catch (e:any) { return NextResponse.json({ reply:'Error al leer datos de la finca.' }); }

  const hoy = new Date().toLocaleDateString('es-ES', { weekday:'long', day:'numeric', month:'long' });
  const vuelosHoy = ctx.missions.filter(m => {
    const d = new Date(Date.now());
    const fecha = m.fecha.toLowerCase();
    return fecha.includes(d.toLocaleDateString('es-ES',{day:'numeric',month:'long'}).toLowerCase());
  });

  const weatherBlock = weather
    ? `TIEMPO AHORA en la finca (lat 37.7923, lon -6.2046):
- ${weather.desc} · ${weather.temp}°C (sensación ${weather.sensacion}°C) · Humedad ${weather.humedad}% · Viento ${weather.viento} km/h`
    : 'TIEMPO: no disponible';

  const isGreeting = message.trim() === '__SALUDO__';

  const systemPrompt = `Eres Antonia, la encargada virtual de Finca Galisancho (Cáceres, España). El dron sobrevuela la finca y detecta automáticamente animales, personas, vehículos y cualquier anomalía. Tu trabajo es estar al tanto de todo y contárselo al dueño de forma natural.

Tu nombre es Antonia. Eres la encargada. Hablas en femenino cuando te refieras a ti misma.

CÓMO HABLAS:
- Español siempre. Tono profesional y claro, sin coloquialismos ni expresiones de bar. Eres una encargada competente, no una amiga de confianza.
- Evita frases como "¡Hola!", "¡Claro!", "¡Por supuesto!", "como está el patio", "sin novedad por aquí", "todo tranquilo". Habla con precisión.
- Sé breve por defecto. Si piden detalle, dalo.
- Fecha simple: "el martes", "ayer", "esta mañana". Nunca IDs técnicos en el texto.
- Usa **negrita** para el dato más relevante.
- Las detecciones no son solo vacas — pueden ser animales, personas, vehículos, anomalías. Informa de todo lo relevante.
- Cruza los datos: si un vuelo detectó algo inusual cerca de una zona marcada en el mapa, indícalo.
- El tiempo influye en las detecciones: menciónalo cuando sea relevante (calor → ganado en sombra; lluvia → menos detecciones).
- No uses plantillas fijas. Cada respuesta debe reflejar lo que dicen los datos reales.
- Si algo no está en los datos, indícalo brevemente y continúa con lo que sí está disponible.

${isGreeting
  ? `PRIMERA VEZ QUE ABRE EL CHAT HOY (${hoy}): Preséntate como Antonia diciendo "¡Hola! Soy Antonia, la encargada de tu finca." y luego haz un breve resumen natural de lo que hay — vuelos recientes, qué se detectó, cómo está el tiempo ahora mismo, y si hay algo que merezca atención. No uses estructura fija, habla como lo haría la encargada al llegar por la mañana. Termina invitando a preguntar lo que necesite.`
  : ''}

CARD DE VUELO E IMÁGENES:
- Si preguntan por un vuelo concreto O por imágenes/fotos de una misión, SIEMPRE incluye al final (en línea aparte): [MISSION_CARD:id_del_vuelo]
- La card mostrará automáticamente las capturas clave y thumbnails del vuelo.
- Cuando el usuario pregunte si tienes acceso a imágenes: dile que SÍ tienes acceso a las capturas y miniaturas de cada misión, y que para verlas indique el vuelo concreto. Nunca digas que no tienes acceso a imágenes.
- Si muestras una card, puedes indicar al usuario: "Puedes ver el detalle completo en /mision/[id]"
- Solo incluye [MISSION_CARD:] cuando sea un vuelo específico, nunca en resúmenes generales.

APRENDIZAJE AUTOMÁTICO: Si en esta conversación detectas un patrón nuevo o insight relevante sobre la finca (comportamiento del ganado, condiciones que afectan las detecciones, zonas problemáticas, recurrencias...) añade en una línea separada al final: [INSIGHT:categoria:descripción breve]. Categorías: deteccion | clima | comportamiento | finca. Solo cuando sea genuinamente relevante, no en cada respuesta. Ejemplo: [INSIGHT:clima:Los días de niebla generan más falsos positivos en YOLO]

HECHOS PERMANENTES: Si el usuario te dice algo que deberías recordar siempre (su nombre, cuántas vacas tiene, qué razas, preferencias, datos fijos de la finca...) guárdalo añadiendo al final: [FACT:descripción breve del hecho]. Ejemplo: [FACT:El dueño tiene 120 vacas Limusín] o [FACT:El dueño se llama Artur]. Solo cuando el usuario diga algo permanente sobre la finca o sobre sí mismo, nunca para datos que ya están en Firestore.

${fincaConfig ? `=== CONOCIMIENTO DE LA FINCA (datos fijos, siempre válidos) ===
${Object.entries(fincaConfig)
  .filter(([k]) => k !== 'updatedAt' && k !== 'createdAt')
  .map(([k, v]) => `- ${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`)
  .join('\n')}
=== FIN CONOCIMIENTO ===

` : ''}=== DATOS DE LA FINCA — ${hoy} ===

TIEMPO AHORA (37.7923°N, -6.2046°W): ${weather
  ? `${weather.desc} · ${weather.temp}°C (sensación ${weather.sensacion}°C) · Humedad ${weather.humedad}% · Viento ${weather.viento} km/h`
  : 'no disponible'}

RESUMEN HISTÓRICO:
- Vuelos totales: ${ctx.stats.totalMisiones} | Completados: ${ctx.stats.completadas} | Ahora procesando: ${ctx.stats.enProceso}
- Animales detectados en total: ${ctx.stats.totalAnimalesDetectados} | Media/vuelo: ${ctx.stats.mediaPorVuelo}
- Personas detectadas en total: ${ctx.stats.totalPersonasDetectadas} | Vehículos: ${ctx.stats.totalVehiculosDetectados}
- Vuelo con más detecciones: ${ctx.stats.mejorVuelo ?? 'sin datos'}

VUELOS ÚLTIMOS 90 DÍAS (${ctx.missions.length} vuelos, del más reciente al más antiguo):
${ctx.missions.length === 0 ? 'Ninguno.' : ctx.missions.map((m,i) =>
  `${i+1}. id:"${m.id}" · ${m.fecha} ${m.hora} · estado:${m.status}${m.detecciones ? ` · detectado: ${m.detecciones}` : ''}${m.altitud ? ` · alt:${m.altitud}` : ''}`
).join('\n')}

ZONAS MARCADAS EN EL MAPA (${ctx.mapItems.length}):
${ctx.mapItems.length === 0 ? 'Ninguna.' : ctx.mapItems.map(p =>
  `• [${p.tipo}] "${p.nombre}"${p.tag ? ` — ${p.tag}` : ''} · coords: ${p.lat}, ${p.lng}`
).join('\n')}

${facts.length > 0 ? `=== HECHOS PERMANENTES (lo que el dueño ha dicho explícitamente) ===
${facts.map(f => `• ${f.text}`).join('\n')}
=== FIN HECHOS ===` : ''}

${insights.length > 0 ? `=== MEMORIA — APRENDIZAJES DE LA FINCA ===
${insights.map(ins => `• [${ins.category}] ${ins.text}`).join('\n')}
=== FIN MEMORIA ===` : ''}

${recentConvs.length > 0 ? `CONVERSACIONES RECIENTES (contexto de sesiones anteriores):
${recentConvs.map(c => `  Usuario: ${c.user}\n  Antonia: ${c.bot.slice(0, 400)}${c.bot.length > 400 ? '…' : ''}`).join('\n---\n')}` : ''}

=== FIN DATOS ===`;

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model:'gemini-2.5-flash', systemInstruction: systemPrompt });
    // Gemini requiere que el historial empiece con 'user' y alterne user/model
    // Filtramos el historial para que arranque siempre con un mensaje de usuario
    let rawHistory = history.slice(-10).map((h:any) => ({
      role: h.role === 'user' ? 'user' : 'model',
      parts: [{ text: h.text }],
    }));
    // Descartar mensajes iniciales de 'model' hasta encontrar el primer 'user'
    while (rawHistory.length > 0 && rawHistory[0].role !== 'user') rawHistory.shift();
    // Asegurar que termina en 'model' (el último par antes del mensaje actual)
    while (rawHistory.length > 0 && rawHistory[rawHistory.length - 1].role !== 'model') rawHistory.pop();
    const chatHistory = rawHistory.slice(-6);
    const chat = model.startChat({ history: chatHistory });
    const result = await chat.sendMessage(message.trim());
    let reply = result.response.text();

    // Detectar si Gemini ha marcado una misión concreta
    const missionMatch = reply.match(/\[MISSION_CARD:([^\]]+)\]/);
    let missionCard = null;

    if (missionMatch) {
      reply = reply.replace(/\[MISSION_CARD:[^\]]+\]/g, '').trim();
      const missionId = missionMatch[1].trim();
      try {
        missionCard = await getMissionDetail(missionId);
      } catch (e) {
        console.warn('[CHAT] No se pudo cargar mission card:', e);
      }
    }

    // Detectar y guardar insights (fire-and-forget)
    const insightMatches = [...reply.matchAll(/\[INSIGHT:([^:]+):([^\]]+)\]/g)];
    if (insightMatches.length > 0) {
      reply = reply.replace(/\[INSIGHT:[^\]]+\]/g, '').trim();
      for (const m of insightMatches) {
        const category = m[1].trim();
        const text     = m[2].trim();
        if (text) saveInsight(text, category);
      }
    }

    // Detectar y guardar hechos permanentes (fire-and-forget)
    const factMatches = [...reply.matchAll(/\[FACT:([^\]]+)\]/g)];
    if (factMatches.length > 0) {
      reply = reply.replace(/\[FACT:[^\]]+\]/g, '').trim();
      for (const m of factMatches) {
        const text = m[1].trim();
        if (text) saveFact(text);
      }
    }

    // Guardar turno de conversación con identidad (fire-and-forget, no guardar saludo automático)
    if (!isGreeting) {
      saveConversation(message.trim(), reply, { userId, userEmail, sessionId, ip });
    }

    return NextResponse.json({ reply, missionCard });

  } catch (e:any) {
    const errMsg = e?.message ?? String(e);
    console.error('[CHAT] Gemini error:', errMsg, '| status:', e?.status);
    const status = e?.status ?? e?.httpErrorCode;
    if (status === 403) return NextResponse.json({ reply:'❌ Activa la Generative Language API en console.cloud.google.com' });
    if (status === 429) return NextResponse.json({ reply:'⏳ Límite de peticiones. Espera unos segundos.' });
    if (status === 404 || errMsg?.includes('not found') || errMsg?.includes('model')) {
      return NextResponse.json({ reply:'⚠️ Modelo IA no disponible. Contacta con soporte.' });
    }
    return NextResponse.json({ reply:`Error al contactar con la IA. Inténtalo de nuevo.` });
  }
}
