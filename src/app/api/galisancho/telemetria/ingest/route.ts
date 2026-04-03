/**
 * POST /api/galisancho/telemetria/ingest
 *
 * Endpoint de prueba que acepta el formato DJI FlightHub 2 (igual que el
 * dock3-backend en producción) y guarda en Firebase Realtime Database con
 * la misma estructura que el backend real → telemetry/{sn}
 *
 * En producción los datos llegan por: DJI FlightHub 2 → dock3-backend → RTDB
 * Este endpoint es útil para simular telemetría en desarrollo.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from 'firebase-admin/database';
import { getApps, initializeApp, cert } from 'firebase-admin/app';

// Firebase Admin (server-side) para escribir en RTDB
function getAdminDB() {
  if (!getApps().length) {
    const saJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    const databaseURL =
      process.env.FIREBASE_DATABASE_URL ??
      process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL;

    if (saJson) {
      const sa = JSON.parse(saJson);
      initializeApp({ credential: cert(sa), databaseURL });
    } else {
      initializeApp({
        credential: cert({
          projectId:   process.env.FIREBASE_PROJECT_ID,
          privateKey:  process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        }),
        databaseURL,
      });
    }
  }
  return getDatabase();
}

// Normalización igual que el backend
function parsePath(raw: any) {
  return {
    sn:            raw.sn,
    orderId:       raw.order_id ?? null,
    flightStatus:  raw.flight_status ?? 'Unknown',
    uasModel:      raw.uas_model ?? null,
    uasId:         raw.uas_id ?? null,
    manufacturerId:raw.manufacturer_id ?? null,
    longitude:     raw.longitude / 1e7,
    latitude:      raw.latitude  / 1e7,
    altitude:      raw.altitude  / 10,
    height:        raw.height    / 10,
    vs:            raw.vs        / 10,
    gs:            raw.gs        / 10,
    course:        raw.course !== -999 ? raw.course / 10 : null,
    remoteIdStatus:raw.remote_id_status ?? null,
    timestamp:     raw.time_stamp ?? null,
    updatedAt:     Date.now(),
  };
}

export async function POST(req: NextRequest) {
  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const paths: any[] = body?.paths ?? [];
  if (!paths.length) return NextResponse.json({ error: 'No paths' }, { status: 400 });

  try {
    const adminDb = getAdminDB();
    const saved: string[] = [];

    for (const raw of paths) {
      const path = parsePath(raw);
      await adminDb.ref(`telemetry/${path.sn}`).set(path);
      saved.push(path.sn);
    }

    return NextResponse.json({ ok: true, saved });
  } catch (e: any) {
    console.error('[INGEST]', e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
