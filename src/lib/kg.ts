/**
 * Knowledge Graph — helpers para consultar entidades y eventos cruzados
 * Colecciones: kg_entities, kg_events
 */
import {
  collection, query, orderBy, limit, getDocs,
  where, Timestamp, addDoc, setDoc, doc,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';

// ── Tipos ─────────────────────────────────────────────────────────────────────

export type EntityType = 'vehicle' | 'drone' | 'zone' | 'sensor' | 'cattle_group' | 'person' | 'document';

export interface KGEntity {
  id: string;
  type: EntityType;
  name: string;
  properties: Record<string, any>;
  relatedEntities?: string[];
  createdAt?: any;
  updatedAt?: any;
}

export interface KGEvent {
  id?: string;
  entityId: string;
  entityType: EntityType;
  entityName: string;
  action: string;
  location?: { lat: number; lng: number; zoneName?: string } | null;
  relatedEntityIds?: string[];
  metadata?: Record<string, any>;
  timestamp: any;
  source: 'real' | 'simulated';
}

// ── Queries ───────────────────────────────────────────────────────────────────

/** Todas las entidades del KG */
export async function fetchKGEntities(): Promise<KGEntity[]> {
  try {
    const snap = await getDocs(collection(db, 'kg_entities'));
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as KGEntity));
  } catch { return []; }
}

/** Eventos recientes (últimas N horas o días) */
export async function fetchKGEvents(opts: {
  sinceHours?: number;
  entityId?: string;
  entityType?: EntityType;
  limit?: number;
}): Promise<KGEvent[]> {
  try {
    const { sinceHours = 48, limit: lim = 30 } = opts;
    const since = new Date();
    since.setHours(since.getHours() - sinceHours);

    let q = query(
      collection(db, 'kg_events'),
      where('timestamp', '>=', Timestamp.fromDate(since)),
      orderBy('timestamp', 'desc'),
      limit(lim),
    );
    const snap = await getDocs(q);
    let events = snap.docs.map(d => ({ id: d.id, ...d.data() } as KGEvent));

    if (opts.entityId) events = events.filter(e => e.entityId === opts.entityId);
    if (opts.entityType) events = events.filter(e => e.entityType === opts.entityType);

    return events;
  } catch { return []; }
}

/** Contexto KG resumido para el prompt de Antonia */
export async function fetchKGContext(sinceHours = 72): Promise<string> {
  try {
    const [entities, events] = await Promise.all([
      fetchKGEntities(),
      fetchKGEvents({ sinceHours, limit: 40 }),
    ]);

    if (!entities.length && !events.length) return '';

    const entityMap = Object.fromEntries(entities.map(e => [e.id, e]));

    // Agrupar eventos por entidad
    const byEntity: Record<string, KGEvent[]> = {};
    for (const ev of events) {
      if (!byEntity[ev.entityName]) byEntity[ev.entityName] = [];
      byEntity[ev.entityName].push(ev);
    }

    const lines: string[] = ['## KNOWLEDGE GRAPH — actividad reciente de la finca:'];

    for (const [entityName, evs] of Object.entries(byEntity)) {
      const entity = entities.find(e => e.name === entityName);
      const typeLabel = entity ? `[${entity.type}]` : '';
      lines.push(`\n**${entityName}** ${typeLabel}:`);
      for (const ev of evs.slice(0, 6)) {
        const ts = ev.timestamp?.toDate ? ev.timestamp.toDate() : new Date(ev.timestamp);
        const hora = ts.toLocaleString('es-ES', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
        const loc = ev.location?.zoneName ? ` en ${ev.location.zoneName}` : ev.location ? ` en lat:${ev.location.lat.toFixed(4)},lon:${ev.location.lng.toFixed(4)}` : '';
        const meta = ev.metadata ? ` (${Object.entries(ev.metadata).map(([k, v]) => `${k}: ${v}`).join(', ')})` : '';
        lines.push(`  - ${hora}: ${ev.action}${loc}${meta}`);
      }
    }

    // Entidades registradas (resumen)
    lines.push('\n**Entidades registradas en la finca:**');
    for (const e of entities) {
      const props = Object.entries(e.properties ?? {}).map(([k, v]) => `${k}: ${v}`).join(', ');
      lines.push(`  - ${e.name} [${e.type}]${props ? ': ' + props : ''}`);
    }

    return lines.join('\n');
  } catch { return ''; }
}

// ── Escritura ─────────────────────────────────────────────────────────────────

export async function saveKGEntity(id: string, entity: Omit<KGEntity, 'id'>) {
  await setDoc(doc(db, 'kg_entities', id), {
    ...entity,
    updatedAt: Timestamp.now(),
    createdAt: Timestamp.now(),
  }, { merge: true });
}

export async function saveKGEvent(event: Omit<KGEvent, 'id'>) {
  await addDoc(collection(db, 'kg_events'), {
    ...event,
    timestamp: event.timestamp ?? Timestamp.now(),
  });
}
