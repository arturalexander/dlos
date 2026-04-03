import { NextResponse } from 'next/server';
import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { db } from '@/lib/firebase';
import { collection, getDocs } from 'firebase/firestore';

// S3 client — credentials ONLY on server side
const s3 = new S3Client({
  region: process.env.AWS_REGION || 'eu-west-1',
  credentials: {
    accessKeyId:     process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

const BUCKET     = process.env.AWS_S3_BUCKET || 'dlosai-media-prod';
const VIDEO_EXTS = new Set(['.mp4', '.mov', '.avi', '.mkv', '.m4v', '.mts']);
const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.dng', '.tiff']);
const THUMB_EXTS = new Set(['.jpg', '.jpeg']);

// Mapa UUID → nombre legible. Fallback manual desde env var UUID_NAMES (JSON).
let UUID_NAMES_MANUAL: Record<string, string> = {};
try {
  if (process.env.UUID_NAMES) UUID_NAMES_MANUAL = JSON.parse(process.env.UUID_NAMES);
} catch { /* ignorar */ }

// ── FlightHub 2 — helpers ─────────────────────────────────────────────────────
const FH2_BASE      = 'https://es-flight-api-eu.djigate.com';
const FH2_PROJECT   = process.env.FH2_PROJECT_UUID || '5bfac561-dd1b-4c3f-900f-97733615e46f';
const FH2_CACHE_TTL = 30 * 60 * 1000;

function fh2Headers(token: string, projectUuid?: string): Record<string, string> {
  const h: Record<string, string> = {
    'X-User-Token': token,
    'X-Request-Id': crypto.randomUUID(),
    'X-Language':   'en',
    'Accept':       'application/json',
  };
  if (projectUuid) h['X-Project-Uuid'] = projectUuid;
  return h;
}

// ── Waylines cache (id -> name, TTL) ─────────────────────────────────────────
const fh2WaylinesCache: Record<string, string> = {};
let fh2WaylinesCacheTime = 0;

async function loadFH2Waylines(): Promise<Record<string, string>> {
  const now = Date.now();
  if (now - fh2WaylinesCacheTime < FH2_CACHE_TTL && Object.keys(fh2WaylinesCache).length > 0) {
    return fh2WaylinesCache;
  }
  const token = process.env.FH2_API_TOKEN;
  if (!token) return fh2WaylinesCache;
  try {
    const res = await fetch(
      `${FH2_BASE}/openapi/v0.1/wayline?page=1&page_size=100`,
      { headers: fh2Headers(token, FH2_PROJECT || undefined), signal: AbortSignal.timeout(5000) },
    );
    const data = await res.json();
    if (data.code === 0 && Array.isArray(data.data?.list)) {
      for (const w of data.data.list as Array<{ id: string; name: string }>) {
        if (w.id && w.name) fh2WaylinesCache[w.id] = w.name;
      }
      fh2WaylinesCacheTime = now;
      console.log(`[FH2] waylines cargados: ${Object.keys(fh2WaylinesCache).length}`);
    } else {
      console.warn(`[FH2] wayline list code=${data.code} message=${data.message}`);
    }
  } catch (e) {
    console.warn('[FH2] error cargando waylines:', (e as Error).message);
  }
  return fh2WaylinesCache;
}

// ── Per-UUID task-name cache (no TTL needed; process lifetime) ────────────────
const fh2NamesCache: Record<string, string> = {};

/**
 * Resolve a media UUID to a human-readable mission name.
 * 1. If uuid is a known wayline id  → return wayline name directly
 * 2. Otherwise call /flight-task/{uuid} as fallback
 *    a. If task has wayline_uuid in the map  → return that wayline name
 *    b. If task has data.name               → return that name
 * 3. Null if nothing resolves
 */
async function getFH2NameFromUuid(
  uuid: string,
  combinedMap: Record<string, string>,
): Promise<string | null> {
  // Already resolved as wayline or Firestore route
  if (combinedMap[uuid]) {
    console.log(`[FH2] direct ${uuid} -> "${combinedMap[uuid]}"`);
    return combinedMap[uuid];
  }
  // Already cached as task-derived name
  if (fh2NamesCache[uuid]) return fh2NamesCache[uuid];

  const token = process.env.FH2_API_TOKEN;
  if (!token) return null;

  try {
    // Fallback: probe as flight-task
    const res = await fetch(
      `${FH2_BASE}/openapi/v0.1/flight-task/${uuid}`,
      { headers: fh2Headers(token, FH2_PROJECT || undefined), signal: AbortSignal.timeout(5000) },
    );
    const data = await res.json();
    if (data.code === 0) {
      let name: string | null = null;
      // Log completo para debug: ver qué campos devuelve el task
      const taskData = data.data ?? {};
      const waylineUuid: string | undefined =
        taskData.wayline_uuid ?? taskData.waylineUuid ?? taskData.wayline_id ?? taskData.waylineId;
      console.log(`[FH2-DEBUG] task ${uuid} keys=${Object.keys(taskData).join(',')} wayline_uuid=${waylineUuid ?? 'NONE'} task_name="${taskData.name ?? ''}" inMap=${waylineUuid ? !!combinedMap[waylineUuid] : false} mapSize=${Object.keys(combinedMap).length}`);
      if (waylineUuid && combinedMap[waylineUuid]) {
        name = combinedMap[waylineUuid];
        fh2NamesCache[uuid] = name; // solo cachear cuando se resuelve vía wayline
        console.log(`[FH2] task ${uuid} -> wayline ${waylineUuid} -> "${name}"`);
        return name;
      } else if (taskData.name) {
        name = taskData.name as string;
        // NO cachear fallback: permitir reintento en siguiente request (por si llega a Firestore)
        console.log(`[FH2] task ${uuid} -> fallback task name "${name}" (wayline ${waylineUuid ?? 'NONE'} no en mapa)`);
        return name;
      }
    } else {
      console.log(`[FH2] ${uuid} code=${data.code} message=${data.message}`);
    }
  } catch (e) {
    console.warn(`[FH2] error fetching task ${uuid}:`, (e as Error).message);
  }
  return null;
}

/**
 * Resolve a batch of media UUIDs to names.
 * Combina waylines FH2 + Firestore routes para el lookup, luego llama flight-task para los no resueltos.
 * Pasar firestoreRoutes permite que el task->wayline_uuid lookup encuentre nombres guardados en Firestore.
 */
async function getFH2Names(
  mediaUuids: string[],
  firestoreRoutes: Record<string, string>,
): Promise<Record<string, string>> {
  const waylineMap   = await loadFH2Waylines();
  // Mapa combinado: Firestore tiene prioridad sobre caché FH2 en memoria
  const combinedMap  = { ...waylineMap, ...firestoreRoutes };
  // Solo hacer fetch de tasks para UUIDs no resueltos en ninguna fuente
  const toFetch = mediaUuids.filter(u => !combinedMap[u] && !fh2NamesCache[u]);
  if (toFetch.length > 0) {
    await Promise.allSettled(toFetch.map(uuid => getFH2NameFromUuid(uuid, combinedMap)));
  }
  return { ...fh2NamesCache, ...combinedMap };
}

/** Carga rutas guardadas en Firestore colección 'routes' (uuid → name). */
async function loadFirestoreRoutes(): Promise<Record<string, string>> {
  try {
    const snap = await getDocs(collection(db, 'routes'));
    const map: Record<string, string> = {};
    snap.forEach(d => {
      const data = d.data();
      if (data.uuid && data.name) map[data.uuid as string] = data.name as string;
    });
    return map;
  } catch (e) {
    console.warn('[media/list] error cargando routes de Firestore:', (e as Error).message);
    return {};
  }
}

/**
 * Convierte el path S3 en un nombre de misión legible.
 * Para paths de FlightHub2 (fh_sync/{org}/{proj}/media/{mediaUuid}/file):
 *   → consulta FH2 API (con caché), fallback a UUID_NAMES manual, fallback a UUID abreviado
 */
function resolveMission(parts: string[], fh2Names: Record<string, string>): string {
  if (parts.length < 2) return 'Raíz';
  if (parts[0] === 'fh_sync' && parts[3] === 'media' && parts.length >= 6) {
    const mediaUuid = parts[4];
    return fh2Names[mediaUuid] || UUID_NAMES_MANUAL[mediaUuid] || `Misión ${mediaUuid.substring(0, 8)}…`;
  }
  const folder = parts[parts.length - 2];
  return fh2Names[folder] || UUID_NAMES_MANUAL[folder] || folder;
}

function ext(key: string) {
  return key.slice(key.lastIndexOf('.')).toLowerCase();
}

function fmtSize(bytes: number): string {
  if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(1)} GB`;
  if (bytes >= 1_048_576)     return `${(bytes / 1_048_576).toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(0)} KB`;
}

function estimateDuration(bytes: number): string {
  // Rough estimate: ~50 Mbps for DJI 4K video
  const seconds = bytes / (50_000_000 / 8);
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `~${m}:${String(s).padStart(2, '0')}`;
}

export async function GET() {
  try {
    // ── Paginate through all S3 objects ──────────────────────────────────────
    const allObjects: { Key: string; Size: number; LastModified: Date }[] = [];
    let token: string | undefined;

    do {
      const cmd  = new ListObjectsV2Command({ Bucket: BUCKET, ContinuationToken: token, MaxKeys: 1000 });
      const resp = await s3.send(cmd);
      for (const obj of resp.Contents ?? []) {
        if (obj.Key && obj.Size !== undefined && obj.LastModified) {
          allObjects.push({ Key: obj.Key, Size: obj.Size, LastModified: obj.LastModified });
        }
      }
      token = resp.NextContinuationToken;
    } while (token);

    // ── Extraer media UUIDs de paths FH2 y resolver nombres ──────────────────
    // parts[4] puede ser wayline id, flight-task uuid, u otro → no asumir nada
    const mediaUuids = [...new Set(
      allObjects
        .map(o => o.Key.split('/'))
        .filter(p => p[0] === 'fh_sync' && p[3] === 'media' && p[4])
        .map(p => p[4]),
    )];
    const firestoreRoutes = await loadFirestoreRoutes();
    // firestoreRoutes se pasa a getFH2Names para que el lookup task->wayline_uuid también lo consulte
    const allNames = await getFH2Names(mediaUuids, firestoreRoutes);

    // ── Build lookup sets for thumbnails ──────────────────────────────────────
    const thumbSet = new Set(allObjects.filter(o => THUMB_EXTS.has(ext(o.Key))).map(o => o.Key));

    // ── Filter & process media files ──────────────────────────────────────────
    const mediaObjects = allObjects.filter(o => {
      const e = ext(o.Key);
      if (!VIDEO_EXTS.has(e) && !IMAGE_EXTS.has(e)) return false;
      // DJI: mostrar _V, _S y _T
      return true;
    });

    // Generate presigned thumbnail URLs in parallel (batch)
    const items = await Promise.all(
      mediaObjects.map(async (obj) => {
        const e       = ext(obj.Key);
        const isVideo = VIDEO_EXTS.has(e);
        const base    = obj.Key.slice(0, obj.Key.lastIndexOf('.'));

        // Find thumbnail: same base name .jpg, or same base name _thumb.jpg
        const possibleThumbs = [`${base}.jpg`, `${base}_thumb.jpg`, `${base}.JPG`];
        const thumbKey = possibleThumbs.find(k => thumbSet.has(k) && k !== obj.Key);

        // Generate presigned thumbnail URL (1h expiry)
        let thumbnailUrl: string | null = null;
        if (thumbKey) {
          try {
            thumbnailUrl = await getSignedUrl(
              s3,
              new GetObjectCommand({ Bucket: BUCKET, Key: thumbKey }),
              { expiresIn: 3600 },
            );
          } catch { /* skip */ }
        } else if (!isVideo && THUMB_EXTS.has(e)) {
          // For photos, use the file itself as the thumbnail
          try {
            thumbnailUrl = await getSignedUrl(
              s3,
              new GetObjectCommand({ Bucket: BUCKET, Key: obj.Key }),
              { expiresIn: 3600 },
            );
          } catch { /* skip */ }
        }

        // Extract folder path as "mission" label
        const parts   = obj.Key.split('/');
        const mission = resolveMission(parts, allNames);
        const date    = obj.LastModified.toISOString().split('T')[0];

        return {
          key:           obj.Key,
          name:          parts[parts.length - 1],
          type:          isVideo ? 'video' : 'photo',
          date,
          dateTime:      obj.LastModified.toISOString(),
          size:          obj.Size,
          sizeFormatted: fmtSize(obj.Size),
          duration:      isVideo ? estimateDuration(obj.Size) : null,
          mission,
          thumbnailUrl,
        };
      }),
    );

    // ── Sort by date descending ───────────────────────────────────────────────
    items.sort((a, b) => b.dateTime.localeCompare(a.dateTime));

    // ── Group by date ─────────────────────────────────────────────────────────
    const grouped: Record<string, typeof items> = {};
    for (const item of items) {
      if (!grouped[item.date]) grouped[item.date] = [];
      grouped[item.date].push(item);
    }

    // Total bytes across ALL objects in bucket (not just media)
    const totalBytes = allObjects.reduce((sum, o) => sum + o.Size, 0);

    return NextResponse.json({ items, grouped, total: items.length, totalBytes });
  } catch (err) {
    console.error('[/api/media/list]', err);
    return NextResponse.json({ error: 'Error al listar S3', detail: String(err) }, { status: 500 });
  }
}
