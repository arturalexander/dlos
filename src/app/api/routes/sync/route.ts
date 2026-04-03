// /api/routes/sync — Sincroniza rutas FlightHub2 → Firestore colección 'routes'
// POST sin body: llama al endpoint de waylines y guarda uuid+nombre en Firestore
import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { collection, writeBatch, doc } from 'firebase/firestore';

const FH2_BASE    = 'https://es-flight-api-eu.djigate.com';
const FH2_PROJECT = process.env.FH2_PROJECT_UUID || '5bfac561-dd1b-4c3f-900f-97733615e46f';

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

export async function POST() {
  const token = process.env.FH2_API_TOKEN;
  if (!token) {
    return NextResponse.json({ error: 'FH2_API_TOKEN no configurado' }, { status: 500 });
  }

  try {
    const res = await fetch(
      `${FH2_BASE}/openapi/v0.1/wayline?page=1&page_size=100`,
      { headers: fh2Headers(token, FH2_PROJECT), signal: AbortSignal.timeout(10000) },
    );
    const data = await res.json();

    if (data.code !== 0 || !Array.isArray(data.data?.list)) {
      return NextResponse.json(
        { error: `FH2 error: ${data.message ?? 'desconocido'}`, code: data.code },
        { status: 502 },
      );
    }

    const routes = data.data.list as Array<{ id: string; name: string }>;
    const routesCol = collection(db, 'routes');
    const syncedAt  = new Date().toISOString();

    // Firestore batches: máx 500 operaciones por batch
    let batch = writeBatch(db);
    let count = 0;

    for (const route of routes) {
      if (!route.id || !route.name) continue;
      batch.set(doc(routesCol, route.id), { uuid: route.id, name: route.name, syncedAt });
      count++;
      if (count % 500 === 0) {
        await batch.commit();
        batch = writeBatch(db);
      }
    }

    if (count % 500 !== 0) await batch.commit();

    console.log(`[routes/sync] ${count} rutas sincronizadas a Firestore`);
    return NextResponse.json({ ok: true, synced: count });
  } catch (err) {
    console.error('[routes/sync]', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
