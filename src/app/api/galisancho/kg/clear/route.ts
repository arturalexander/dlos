/**
 * POST /api/galisancho/kg/clear
 *
 * Borra eventos y/o entidades del Knowledge Graph.
 * Body: { mode: 'simulated' | 'all_events' | 'all' }
 *   - simulated:   borra solo eventos con source='simulated' (mantiene reales)
 *   - all_events:  borra todos los eventos (mantiene entidades)
 *   - all:         borra todo (entidades + eventos)
 */
import { NextRequest, NextResponse } from 'next/server';
import {
  collection, getDocs, query, where, deleteDoc, doc,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const mode = body.mode ?? 'simulated';

    let deletedEvents = 0;
    let deletedEntities = 0;

    // Borrar eventos
    if (mode === 'simulated') {
      const snap = await getDocs(
        query(collection(db, 'kg_events'), where('source', '==', 'simulated'))
      );
      for (const d of snap.docs) { await deleteDoc(doc(db, 'kg_events', d.id)); deletedEvents++; }
    }

    if (mode === 'all_events' || mode === 'all') {
      const snap = await getDocs(collection(db, 'kg_events'));
      for (const d of snap.docs) { await deleteDoc(doc(db, 'kg_events', d.id)); deletedEvents++; }
    }

    // Borrar entidades (solo en modo 'all')
    if (mode === 'all') {
      const snap = await getDocs(collection(db, 'kg_entities'));
      for (const d of snap.docs) { await deleteDoc(doc(db, 'kg_entities', d.id)); deletedEntities++; }
    }

    return NextResponse.json({ ok: true, deletedEvents, deletedEntities });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
