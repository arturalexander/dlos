/**
 * POST /api/galisancho/library/analyze
 *
 * Lanza un job de búsqueda de objetos en vídeo usando YOLO-World en Vast.ai.
 * Mismo flow que las misiones del dron pero con targetObject (texto libre).
 *
 * Body: { videoKey: string, targetObject: string }
 */
import { NextRequest, NextResponse } from 'next/server';
import { collection, addDoc, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';

const VAST_API_KEY  = process.env.VAST_API_KEY!;
const CALLBACK_URL  = process.env.NEXT_PUBLIC_APP_URL
  ? `${process.env.NEXT_PUBLIC_APP_URL}/api/processing/callback`
  : process.env.CALLBACK_URL ?? '';
const CALLBACK_API_KEY = process.env.CALLBACK_API_KEY ?? '';

// Docker image para YOLO-World (la subiremos a Docker Hub)
const DOCKER_IMAGE = process.env.OBJECT_SEARCH_DOCKER_IMAGE ?? 'dlosai/object-search-worker:latest';

// GPU mínima para YOLO-World (más barato que el worker de vacas)
const GPU_FILTER = 'reliability > 0.95 num_gpus=1 gpu_ram >= 8 cuda_vers >= 11.8';

async function getVideoPresignedUrl(key: string): Promise<string | null> {
  try {
    const { S3Client, GetObjectCommand } = await import('@aws-sdk/client-s3');
    const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');
    const s3 = new S3Client({
      region: process.env.AWS_REGION ?? 'eu-west-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      },
    });
    return await getSignedUrl(
      s3,
      new GetObjectCommand({ Bucket: process.env.AWS_S3_BUCKET ?? 'dlosai-media-prod', Key: key }),
      { expiresIn: 7200 } // 2h — suficiente para descargar + procesar
    );
  } catch (e) {
    console.error('[ANALYZE] Error generando URL:', e);
    return null;
  }
}

async function launchVastInstance(jobId: string, videoUrl: string, targetObject: string, videoKey: string) {
  // Buscar oferta disponible
  const searchRes = await fetch(
    `https://console.vast.ai/api/v0/bundles/?q=${encodeURIComponent(JSON.stringify({
      gpu_name: { '$in': ['RTX 3080', 'RTX 3090', 'RTX 4090', 'A4000', 'A5000', 'RTX 4080', 'RTX 4070'] },
      num_gpus: { '$eq': 1 },
      reliability2: { '$gte': 0.95 },
      cuda_max_good: { '$gte': 11.8 },
      rentable: { '$eq': true },
      rented: { '$eq': false },
    }))}`,
    { headers: { Authorization: `Bearer ${VAST_API_KEY}` } }
  );

  if (!searchRes.ok) throw new Error(`Vast search failed: ${searchRes.status}`);
  const searchData = await searchRes.json();
  const offers: any[] = searchData.offers ?? [];
  if (!offers.length) throw new Error('No hay GPUs disponibles en Vast.ai');

  // Ordenar por precio
  const sorted = offers.sort((a, b) => a.dph_total - b.dph_total);
  const best = sorted[0];

  const env: Record<string, string> = {
    JOB_ID:            jobId,
    VIDEO_URL:         videoUrl,
    VIDEO_KEY:         videoKey,
    TARGET_OBJECT:     targetObject,
    CALLBACK_URL:      CALLBACK_URL,
    CALLBACK_API_KEY:  CALLBACK_API_KEY,
    AUTO_SHUTDOWN:     'true',
    VAST_API_KEY:      VAST_API_KEY,
    AWS_ACCESS_KEY_ID:     process.env.AWS_ACCESS_KEY_ID ?? '',
    AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY ?? '',
    AWS_REGION:            process.env.AWS_REGION ?? 'eu-west-1',
    AWS_S3_BUCKET:         process.env.AWS_S3_BUCKET ?? 'dlosai-media-prod',
    FIREBASE_SERVICE_ACCOUNT: process.env.FIREBASE_SERVICE_ACCOUNT_JSON ?? '',
    FIREBASE_PROJECT_ID:      process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? 'dlos-ai',
  };

  const createRes = await fetch('https://console.vast.ai/api/v0/asks/', {
    method: 'PUT',
    headers: { Authorization: `Bearer ${VAST_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id:   'me',
      image:       DOCKER_IMAGE,
      disk:        20,
      label:       `object-search-${jobId.slice(0, 8)}`,
      onstart:     `python /app/object_worker.py`,
      env:         Object.entries(env).map(([k, v]) => `${k}=${v}`).join(' '),
      id:          best.id,
    }),
  });

  if (!createRes.ok) {
    const err = await createRes.text();
    throw new Error(`Vast create failed: ${err}`);
  }

  const createData = await createRes.json();
  return { instanceId: createData.new_contract, gpuName: best.gpu_name, pricePerHour: best.dph_total };
}

export async function POST(req: NextRequest) {
  try {
    const { videoKey, targetObject } = await req.json().catch(() => ({}));

    if (!videoKey || !targetObject?.trim()) {
      return NextResponse.json({ error: 'Faltan videoKey o targetObject' }, { status: 400 });
    }

    if (!VAST_API_KEY) {
      return NextResponse.json({ error: 'VAST_API_KEY no configurada' }, { status: 500 });
    }

    const target = targetObject.trim().toLowerCase();

    // 1. Crear job en Firestore
    const jobRef = await addDoc(collection(db, 'object_search_jobs'), {
      type:         'object_search',
      videoKey,
      targetObject: target,
      status:       'queued',
      createdAt:    Timestamp.now(),
      updatedAt:    Timestamp.now(),
    });

    const jobId = jobRef.id;

    // 2. Obtener URL firmada del vídeo (2h de validez)
    const videoUrl = await getVideoPresignedUrl(videoKey);
    if (!videoUrl) {
      return NextResponse.json({ error: 'No se pudo generar URL del vídeo' }, { status: 500 });
    }

    // 3. Lanzar instancia Vast.ai
    let vastInfo: any = null;
    try {
      vastInfo = await launchVastInstance(jobId, videoUrl, target, videoKey);
    } catch (e: any) {
      // Si falla Vast, el job queda en 'queued' para reintento manual
      console.error('[ANALYZE] Vast error:', e.message);
      return NextResponse.json({
        ok:    true,
        jobId,
        warn:  `Job creado pero GPU no disponible: ${e.message}. Reinténtalo en unos minutos.`,
      });
    }

    return NextResponse.json({
      ok:    true,
      jobId,
      gpu:   vastInfo?.gpuName,
      price: vastInfo?.pricePerHour,
    });

  } catch (e: any) {
    console.error('[ANALYZE]', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
