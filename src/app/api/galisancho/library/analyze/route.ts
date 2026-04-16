/**
 * POST /api/galisancho/library/analyze
 *
 * Encola un job SAM 3 en Modal (serverless, sin Vast.ai).
 * El worker vive en `cow-counter-gpu/modal_worker.py`.
 *
 * Body: { videoKey: string, targetObject: string }   // comas = múltiples objetos
 *
 * Env vars requeridas:
 *   MODAL_WORKER_URL     → https://<user>--sam3-object-search-enqueue.modal.run
 *   MODAL_API_KEY        → (opcional) debe coincidir con el MODAL_API_KEY del secret
 *   AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY / AWS_REGION / AWS_S3_BUCKET
 */
import { NextRequest, NextResponse } from 'next/server';
import { collection, addDoc, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';

const MODAL_WORKER_URL = process.env.MODAL_WORKER_URL ?? '';
const MODAL_API_KEY    = process.env.MODAL_API_KEY ?? '';

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

export async function POST(req: NextRequest) {
  try {
    const { videoKey, targetObject } = await req.json().catch(() => ({}));

    if (!videoKey || !targetObject?.trim()) {
      return NextResponse.json({ error: 'Faltan videoKey o targetObject' }, { status: 400 });
    }

    if (!MODAL_WORKER_URL) {
      return NextResponse.json(
        { error: 'MODAL_WORKER_URL no configurada. Desplegar con `modal deploy modal_worker.py` y copiar la URL.' },
        { status: 500 }
      );
    }

    // Soporta múltiples objetos separados por coma
    const targets: string[] = targetObject
      .split(',')
      .map((t: string) => t.trim().toLowerCase())
      .filter(Boolean)
      .slice(0, 6);

    if (targets.length === 0) {
      return NextResponse.json({ error: 'targetObject vacío' }, { status: 400 });
    }

    // 1. Crear un job en Firestore por cada objeto (estado "queued")
    const jobIds: string[] = [];
    for (const t of targets) {
      const ref = await addDoc(collection(db, 'object_search_jobs'), {
        type:         'object_search',
        videoKey,
        targetObject: t,
        status:       'queued',
        createdAt:    Timestamp.now(),
        updatedAt:    Timestamp.now(),
      });
      jobIds.push(ref.id);
    }

    // 2. Firmar URL del vídeo (válida 2h)
    const videoUrl = await getVideoPresignedUrl(videoKey);
    if (!videoUrl) {
      return NextResponse.json({ error: 'No se pudo generar URL del vídeo' }, { status: 500 });
    }

    // 3. Encolar en Modal (spawn async — devuelve ~inmediatamente)
    try {
      const modalRes = await fetch(MODAL_WORKER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobIds,
          targetObjects: targets,
          videoUrl,
          videoKey,
          apiKey: MODAL_API_KEY || undefined,
        }),
      });

      if (!modalRes.ok) {
        const errTxt = await modalRes.text().catch(() => '');
        console.error('[ANALYZE] Modal error:', modalRes.status, errTxt);
        return NextResponse.json(
          { error: `Modal HTTP ${modalRes.status}: ${errTxt.slice(0, 200)}` },
          { status: 500 }
        );
      }

      const modalData = await modalRes.json();
      if (!modalData.ok) {
        return NextResponse.json(
          { error: `Modal: ${modalData.error ?? 'unknown'}` },
          { status: 500 }
        );
      }

      return NextResponse.json({
        ok:      true,
        jobIds,
        jobId:   jobIds[0],
        targets,
        callId:  modalData.callId,
        backend: 'modal',
      });
    } catch (e: any) {
      console.error('[ANALYZE] Modal fetch error:', e);
      return NextResponse.json({ error: `Error llamando a Modal: ${e.message}` }, { status: 500 });
    }
  } catch (e: any) {
    console.error('[ANALYZE]', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
