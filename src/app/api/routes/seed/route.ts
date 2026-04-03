// /api/routes/seed — Importa manualmente pares uuid→name a Firestore colección 'routes'
// Body: [{ "uuid": "...", "name": "..." }, ...]
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { collection, writeBatch, doc } from 'firebase/firestore';

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 });
  }

  if (!Array.isArray(body)) {
    return NextResponse.json({ error: 'Se esperaba un array [{ uuid, name }]' }, { status: 400 });
  }

  const entries = (body as Array<{ uuid?: string; name?: string }>)
    .filter(e => e.uuid && e.name);

  if (entries.length === 0) {
    return NextResponse.json({ error: 'Ninguna entrada válida con uuid y name' }, { status: 400 });
  }

  const routesCol = collection(db, 'routes');
  const syncedAt  = new Date().toISOString();
  let batch = writeBatch(db);
  let count = 0;

  for (const entry of entries) {
    batch.set(doc(routesCol, entry.uuid!), { uuid: entry.uuid, name: entry.name, syncedAt });
    count++;
    if (count % 500 === 0) {
      await batch.commit();
      batch = writeBatch(db);
    }
  }
  if (count % 500 !== 0) await batch.commit();

  console.log(`[routes/seed] ${count} rutas guardadas manualmente`);
  return NextResponse.json({ ok: true, seeded: count });
}
