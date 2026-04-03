// src/app/api/webhook/s3/route.ts
// Trigger: AWS S3 → SNS → este endpoint → Vast.ai GPU
// Configurar en AWS: S3 Event Notification → SNS Topic → HTTP subscription
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { enqueueGPUJob } from '@/lib/gpu-queue';

// Set para idempotencia (evitar procesar el mismo objeto dos veces)
const processedKeys = new Set<string>();

// ============================================================
// TIPOS SNS / S3
// ============================================================

interface SNSMessage {
    Type: 'SubscriptionConfirmation' | 'Notification' | 'UnsubscribeConfirmation';
    MessageId: string;
    TopicArn: string;
    Subject?: string;
    Message: string;
    Timestamp: string;
    SubscribeURL?: string;   // solo en SubscriptionConfirmation
    Token?: string;
    UnsubscribeURL?: string;
    Signature: string;
    SignatureVersion: string;
    SigningCertURL: string;
}

interface S3EventRecord {
    eventVersion: string;
    eventSource: string;
    awsRegion: string;
    eventTime: string;
    eventName: string;
    s3: {
        bucket: { name: string };
        object: { key: string; size: number; eTag: string };
    };
}

interface S3Event {
    Records: S3EventRecord[];
}

// ============================================================
// HANDLER PRINCIPAL
// ============================================================

export async function POST(request: NextRequest) {
    try {
        // 1. VALIDAR API KEY opcional (configurable, para proteger el endpoint)
        const apiKey = request.headers.get('X-API-Key');
        const expectedApiKey = process.env.S3_WEBHOOK_SECRET;
        if (expectedApiKey && apiKey !== expectedApiKey) {
            console.error('❌ Invalid API key in S3 webhook');
            return NextResponse.json({ status: 'error', message: 'Unauthorized' }, { status: 401 });
        }

        // 2. PARSEAR CUERPO
        const body = await request.text();
        let sns: SNSMessage;
        try {
            sns = JSON.parse(body);
        } catch {
            return NextResponse.json({ status: 'error', message: 'Invalid JSON' }, { status: 400 });
        }

        const messageType = sns.Type || request.headers.get('x-amz-sns-message-type');

        console.log(`\n${'='.repeat(60)}`);
        console.log(`📡 S3 WEBHOOK RECIBIDO`);
        console.log(`${'='.repeat(60)}`);
        console.log(`   Type: ${messageType}`);
        console.log(`   MessageId: ${sns.MessageId}`);

        // 3. CONFIRMAR SUSCRIPCIÓN SNS (primer mensaje al configurar)
        if (messageType === 'SubscriptionConfirmation') {
            if (!sns.SubscribeURL) {
                return NextResponse.json({ status: 'error', message: 'Missing SubscribeURL' }, { status: 400 });
            }
            console.log(`🔗 Confirmando suscripción SNS...`);
            try {
                const confirmResponse = await fetch(sns.SubscribeURL);
                if (confirmResponse.ok) {
                    console.log(`✅ Suscripción SNS confirmada`);
                    return NextResponse.json({ status: 'success', message: 'Subscription confirmed' });
                } else {
                    console.error(`❌ Error confirmando suscripción: ${confirmResponse.status}`);
                    return NextResponse.json({ status: 'error', message: 'Confirmation failed' }, { status: 500 });
                }
            } catch (err) {
                console.error(`❌ Error fetching SubscribeURL:`, err);
                return NextResponse.json({ status: 'error', message: 'Confirmation error' }, { status: 500 });
            }
        }

        // 4. PROCESAR NOTIFICACIÓN
        if (messageType === 'Notification') {
            let s3Event: S3Event;
            try {
                s3Event = JSON.parse(sns.Message);
            } catch {
                // Algunos setups mandan el mensaje sin doble-encode
                console.warn('⚠️ Message no es JSON, intentando como string directo');
                return NextResponse.json({ status: 'error', message: 'Invalid S3 event' }, { status: 400 });
            }

            if (!s3Event.Records || s3Event.Records.length === 0) {
                console.log('ℹ️ Sin Records en el evento S3');
                return NextResponse.json({ status: 'success', message: 'No records' });
            }

            // Procesar cada record (normalmente solo hay 1)
            for (const record of s3Event.Records) {
                await handleS3Record(record, sns.MessageId);
            }

            return NextResponse.json({ status: 'success', message: 'Event processed' });
        }

        // 5. Otros tipos (UnsubscribeConfirmation, etc.) → ignorar
        return NextResponse.json({ status: 'success', message: `Type ${messageType} ignored` });

    } catch (error) {
        console.error('❌ Error en S3 webhook:', error);
        return NextResponse.json({ status: 'error', message: 'Internal server error' }, { status: 500 });
    }
}

// ============================================================
// PROCESAR UN RECORD S3
// ============================================================

async function handleS3Record(record: S3EventRecord, messageId: string) {
    const eventName = record.eventName || '';
    const bucket = record.s3?.bucket?.name;
    const rawKey = record.s3?.object?.key;
    const fileSize = record.s3?.object?.size || 0;

    // Solo eventos de creación
    if (!eventName.startsWith('ObjectCreated')) {
        console.log(`ℹ️ Evento ignorado: ${eventName}`);
        return;
    }

    if (!bucket || !rawKey) {
        console.warn('⚠️ Falta bucket o key en el record');
        return;
    }

    // Decodificar key (S3 URL-encodes los caracteres especiales)
    const s3Key = decodeURIComponent(rawKey.replace(/\+/g, ' '));
    const fileName = s3Key.split('/').pop() || s3Key;
    const ext = fileName.split('.').pop()?.toLowerCase();

    console.log(`\n📁 Objeto S3:`);
    console.log(`   Bucket: ${bucket}`);
    console.log(`   Key: ${s3Key}`);
    console.log(`   Tamaño: ${(fileSize / 1024 / 1024).toFixed(2)} MB`);
    console.log(`   Extensión: ${ext}`);

    // Solo videos MP4
    if (ext !== 'mp4') {
        console.log(`⏭️ Ignorado: no es MP4`);
        return;
    }

    // Filtro DJI: solo procesar _V.mp4 (visual principal)
    // _T = térmico, _S = zoom/secundaria → ignorar
    const djiSuffix = fileName.match(/_([A-Z])\.mp4$/i)?.[1]?.toUpperCase();
    if (djiSuffix && djiSuffix !== 'V') {
        console.log(`⏭️ Ignorado: video DJI tipo _${djiSuffix} (solo se procesa _V)`);
        return;
    }

    // Idempotencia
    const dedupKey = `${bucket}/${s3Key}`;
    if (processedKeys.has(dedupKey)) {
        console.log(`ℹ️ Ya procesado: ${dedupKey}`);
        return;
    }

    // Extraer metadatos del path del archivo
    // Estructura FlightHub 2: fh_sync/{org-uuid}/{project-uuid}/media/{fh2Uuid}/file
    // fh2Uuid puede ser: wayline id, flight-task uuid, u otro id no reconocido
    const pathParts = s3Key.split('/').filter(Boolean);

    const isFlytBase  = pathParts[0] === 'fh_sync';
    const orgUuid     = isFlytBase ? (pathParts[1] || null) : null;
    const projectUuid = isFlytBase ? (pathParts[2] || null) : null;
    // pathParts[3] === 'media', pathParts[4] === fh2Uuid (tipo desconocido hasta resolver)
    const fh2Uuid     = isFlytBase && pathParts[3] === 'media' ? (pathParts[4] || null) : null;

    console.log(`   Project: ${projectUuid}`);
    console.log(`   Media UUID: ${fh2Uuid}`);

    // Filtro por uuid: ALLOWED_FH2_UUIDS (env var, separados por coma) tiene prioridad
    // Si no está definida, fallback a whitelist en Firestore (config/s3_filters.allowedTaskIds)
    if (isFlytBase && fh2Uuid) {
        const envAllowed = process.env.ALLOWED_FH2_UUIDS
            ? process.env.ALLOWED_FH2_UUIDS.split(',').map(s => s.trim()).filter(Boolean)
            : null;

        if (envAllowed && envAllowed.length > 0) {
            if (!envAllowed.includes(fh2Uuid)) {
                console.log(`⏭️ Ignorado: fh2Uuid ${fh2Uuid} no está en ALLOWED_FH2_UUIDS`);
                return;
            }
            console.log(`✅ fh2Uuid ${fh2Uuid} permitido (ALLOWED_FH2_UUIDS)`);
        } else {
            const allowed = await getAllowedTaskIds();
            if (allowed.length > 0 && !allowed.includes(fh2Uuid)) {
                console.log(`⏭️ Ignorado: fh2Uuid ${fh2Uuid} no está en la lista de permitidos`);
                return;
            }
            console.log(`✅ fh2Uuid ${fh2Uuid} permitido`);
        }
    } else if (isFlytBase && projectUuid) {
        // Fallback: filtro por project-uuid si no hay fh2Uuid
        const allowed = await getAllowedProjectIds();
        if (allowed.length > 0 && !allowed.includes(projectUuid)) {
            console.log(`⏭️ Ignorado: project-uuid ${projectUuid} no está en la lista de permitidos`);
            return;
        }
    }

    // Obtener nombre legible desde FlightHub 2
    // Primero prueba como wayline, luego como flight-task (no asumir el tipo)
    const fh2Name = isFlytBase && fh2Uuid
        ? await getFH2NameFromUuid(fh2Uuid, projectUuid)
        : null;

    const flightId = fh2Uuid || extractFlightId(pathParts, fileName, record.eventTime);
    const { missionName, siteName, siteId, organizationId } = extractMetadata(pathParts, fileName, orgUuid, projectUuid, fh2Name);

    console.log(`\n🛫 Metadatos extraídos:`);
    console.log(`   Flight ID: ${flightId}`);
    console.log(`   Mission: ${missionName}`);
    console.log(`   Site: ${siteName}`);

    // Guardar vuelo en Firestore
    const flightRef = doc(db, 'flights', flightId);
    await setDoc(flightRef, {
        flightId,
        source: 'aws_s3',
        s3Bucket: bucket,
        s3Key,
        videoFileName: fileName,
        videoFileSize: fileSize,
        missionName,
        siteName,
        siteId,
        organizationId,
        flightType: 'manual',
        processingStatus: 'pending',
        jobId: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
    }, { merge: true });

    console.log(`✅ Vuelo guardado en Firestore: ${flightId}`);

    // Encolar job de GPU
    const jobId = await enqueueGPUJob({
        flightId,
        missionName,
        videoS3Key: s3Key,
        videoFileName: fileName,
        videoFileSize: fileSize,
        siteId,
        siteName,
        organizationId,
        telemetryFiles: []
    });

    await setDoc(flightRef, {
        jobId,
        processingStatus: 'queued',
        updatedAt: serverTimestamp()
    }, { merge: true });

    // Marcar como procesado
    processedKeys.add(dedupKey);
    if (processedKeys.size > 500) {
        const first = processedKeys.values().next().value;
        if (first) processedKeys.delete(first);
    }

    console.log(`✅ Job encolado: ${jobId}`);
    console.log(`✨ S3 record procesado exitosamente\n`);
}

// ============================================================
// FLIGHTHUB 2 — RESOLUCIÓN DE NOMBRE
// ============================================================

const FH2_BASE      = 'https://es-flight-api-eu.djigate.com';
const FH2_CACHE_TTL = 5 * 60 * 1000; // 5 min

const fh2TaskCache    = new Map<string, { name: string; fetchedAt: number }>();
const fh2ProjectCache = new Map<string, { name: string; fetchedAt: number }>();

// Waylines cache (id -> name, TTL compartido)
const fh2WaylinesCache: Record<string, string> = {};
let fh2WaylinesCacheTime = 0;

function fh2Headers(token: string, projectUuid?: string | null): Record<string, string> {
    const h: Record<string, string> = {
        'X-User-Token': token,
        'X-Request-Id': crypto.randomUUID(),
        'X-Language':   'en',
        'Accept':       'application/json',
    };
    if (projectUuid) h['X-Project-Uuid'] = projectUuid;
    return h;
}

async function loadFH2Waylines(projectUuid?: string | null): Promise<Record<string, string>> {
    const now = Date.now();
    if (now - fh2WaylinesCacheTime < FH2_CACHE_TTL && Object.keys(fh2WaylinesCache).length > 0) {
        return fh2WaylinesCache;
    }
    const token = process.env.FH2_API_TOKEN;
    if (!token) return fh2WaylinesCache;
    try {
        const res = await fetch(
            `${FH2_BASE}/openapi/v0.1/wayline?page=1&page_size=100`,
            { headers: fh2Headers(token, projectUuid), signal: AbortSignal.timeout(5000) },
        );
        if (res.ok) {
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
        }
    } catch (e) {
        console.warn('[FH2] error cargando waylines:', (e as Error).message);
    }
    return fh2WaylinesCache;
}

/**
 * Resuelve un UUID de FH2 a nombre legible.
 * 1. Carga waylines y comprueba si el UUID es un wayline id
 * 2. Si no, prueba /flight-task/{uuid} como fallback
 *    a. Si la tarea tiene wayline_uuid resuelto → usa ese nombre
 *    b. Si tiene data.name → usa ese nombre
 * 3. Null si no resuelve
 */
async function getFH2NameFromUuid(fh2Uuid: string, projectUuid: string | null): Promise<string | null> {
    // 1. Cargar mapa de waylines y comprobar si el UUID es un wayline
    const waylineMap = await loadFH2Waylines(projectUuid);
    if (waylineMap[fh2Uuid]) {
        console.log(`[FH2] wayline ${fh2Uuid} -> "${waylineMap[fh2Uuid]}"`);
        return waylineMap[fh2Uuid];
    }

    // 2. Comprobar caché de tasks
    const cached = fh2TaskCache.get(fh2Uuid);
    if (cached && Date.now() - cached.fetchedAt < FH2_CACHE_TTL) return cached.name;

    const token = process.env.FH2_API_TOKEN;
    if (!token) return null;

    try {
        // 3. Fallback: probar como flight-task
        const res = await fetch(
            `${FH2_BASE}/openapi/v0.1/flight-task/${fh2Uuid}`,
            { headers: fh2Headers(token, projectUuid), signal: AbortSignal.timeout(5000) },
        );
        if (res.ok) {
            const data = await res.json();
            if (data.code === 0) {
                let name: string | null = null;
                const waylineUuid: string | undefined = data.data?.wayline_uuid;
                if (waylineUuid && waylineMap[waylineUuid]) {
                    name = waylineMap[waylineUuid];
                    console.log(`[FH2] task ${fh2Uuid} -> wayline ${waylineUuid} -> "${name}"`);
                } else if (data.data?.name) {
                    name = data.data.name as string;
                    console.log(`[FH2] task ${fh2Uuid} -> "${name}"`);
                }
                if (name) {
                    fh2TaskCache.set(fh2Uuid, { name, fetchedAt: Date.now() });
                    return name;
                }
            } else {
                console.log(`[FH2] ${fh2Uuid} code=${data.code} message=${data.message}`);
            }
        }
    } catch (e) {
        console.warn(`[FH2] error fetching task ${fh2Uuid}:`, (e as Error).message);
    }
    return null;
}

async function getFH2ProjectName(projectUuid: string): Promise<string | null> {
    const cached = fh2ProjectCache.get(projectUuid);
    if (cached && Date.now() - cached.fetchedAt < FH2_CACHE_TTL) {
        return cached.name;
    }

    const token = process.env.FH2_API_TOKEN;
    if (!token) return null;

    try {
        const res = await fetch(
            `${FH2_BASE}/openapi/v0.1/project?page=1&page_size=10`,
            { headers: fh2Headers(token) },
        );
        if (!res.ok) return null;

        const data = await res.json();
        if (data.code !== 0) return null;

        const projects: Array<{ uuid: string; name: string }> = data.data?.list || [];
        const now = Date.now();
        for (const p of projects) {
            fh2ProjectCache.set(p.uuid, { name: p.name, fetchedAt: now });
        }

        const found = projects.find(p => p.uuid === projectUuid)?.name || null;
        console.log(`[FH2] proyecto: ${found || '(no encontrado)'}`);
        return found;
    } catch (e) {
        console.warn('[FH2] error obteniendo proyecto:', (e as Error).message);
        return null;
    }
}

// ============================================================
// LISTA BLANCA DE TAREAS (Firestore: config/s3_filters)
// ============================================================

let allowedTaskCache: { ids: string[]; fetchedAt: number } | null = null;

async function getAllowedTaskIds(): Promise<string[]> {
    if (allowedTaskCache && Date.now() - allowedTaskCache.fetchedAt < CACHE_TTL_MS) {
        return allowedTaskCache.ids;
    }
    try {
        const snap = await getDoc(doc(db, 'config', 's3_filters'));
        const ids: string[] = snap.exists() ? (snap.data()?.allowedTaskIds || []) : [];
        allowedTaskCache = { ids, fetchedAt: Date.now() };
        console.log(`   📋 Allowed tasks: ${ids.length > 0 ? ids.join(', ') : '(vacío = todos)'}`);
        return ids;
    } catch {
        return [];
    }
}

// ============================================================
// LISTA BLANCA DE PROJECTS (Firestore: config/s3_filters)
// ============================================================

let allowedCache: { ids: string[]; fetchedAt: number } | null = null;
const CACHE_TTL_MS = 60_000; // 1 minuto

async function getAllowedProjectIds(): Promise<string[]> {
    if (allowedCache && Date.now() - allowedCache.fetchedAt < CACHE_TTL_MS) {
        return allowedCache.ids;
    }
    try {
        const snap = await getDoc(doc(db, 'config', 's3_filters'));
        const ids: string[] = snap.exists() ? (snap.data()?.allowedProjectIds || []) : [];
        allowedCache = { ids, fetchedAt: Date.now() };
        console.log(`   📋 Allowed projects cargados: ${ids.length > 0 ? ids.join(', ') : '(lista vacía = todos permitidos)'}`);
        return ids;
    } catch (e) {
        console.warn('⚠️ No se pudo leer config/s3_filters, permitiendo todos:', e);
        return [];
    }
}

// ============================================================
// HELPERS DE EXTRACCIÓN DE METADATOS
// ============================================================

function extractFlightId(pathParts: string[], fileName: string, eventTime: string): string {
    // Intenta encontrar un ID tipo UUID o hash en el path
    for (const part of pathParts) {
        // UUID: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
        if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(part)) {
            return part;
        }
        // Hash hex largo (≥ 16 chars)
        if (/^[0-9a-f]{16,}$/i.test(part)) {
            return part;
        }
    }

    // Si el path tiene forma flights/{id}/... usa ese segmento
    const flightsIdx = pathParts.findIndex(p => p.toLowerCase() === 'flights');
    if (flightsIdx !== -1 && pathParts[flightsIdx + 1]) {
        return pathParts[flightsIdx + 1];
    }

    // Fallback: generar ID basado en timestamp + nombre del archivo
    const ts = new Date(eventTime).getTime() || Date.now();
    const nameSlug = fileName.replace(/\.mp4$/i, '').replace(/[^a-z0-9]/gi, '_').substring(0, 20);
    return `s3_${ts}_${nameSlug}`;
}

function extractMetadata(
    pathParts: string[], fileName: string,
    orgUuid: string | null = null, projectUuid: string | null = null,
    fh2Name: string | null = null
) {
    // Estructura FlightHub 2: fh_sync/{org-uuid}/{project-uuid}/media/{fh2Uuid}/file
    if (pathParts[0] === 'fh_sync' && orgUuid && projectUuid) {
        const missionName = fh2Name
            || fileName.replace(/\.mp4$/i, '').replace(/_V$/i, '').replace(/_/g, ' ').trim();
        return {
            missionName,
            siteName: projectUuid,
            siteId: projectUuid,
            organizationId: orgUuid
        };
    }

    // Estructura genérica: flights/{flightId}/...  o  {orgId}/flights/{flightId}/...
    const orgIdx = pathParts.findIndex(p => p.toLowerCase() === 'flights');
    const organizationId = orgIdx > 0 ? pathParts[orgIdx - 1] : (pathParts[0] || 'default');
    const missionName = fileName.replace(/\.mp4$/i, '').replace(/_/g, ' ');
    const siteName = pathParts.length > 1 ? pathParts[pathParts.length - 2] : 'Sin asignar';
    const siteId = siteName.toLowerCase().replace(/[^a-z0-9]/g, '_');

    return { missionName, siteName, siteId, organizationId };
}

// Avoid unused variable warning — getFH2ProjectName available for future use
void getFH2ProjectName;

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
