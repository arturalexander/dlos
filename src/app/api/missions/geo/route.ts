// /api/missions/geo — Datos geoespaciales de misiones
// GET ?weekStart=YYYY-MM-DD  → misiones de esa semana
// GET ?filter=recent|today|week|month&limit=10
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, orderBy, limit, Timestamp } from 'firebase/firestore';

export interface MissionGeo {
  id: string;
  name: string;
  date: string;          // ISO
  totalCows: number;
  totalPersons: number;
  totalVehicles: number;
  centerLat: number | null;
  centerLon: number | null;
  bounds: { minLat: number; maxLat: number; minLon: number; maxLon: number } | null;
  cowPoints: [number, number][]; // [lat, lon]
  avgAltitude: number | null;
  videoS3Key?: string;
}

function buildMission(d: any): MissionGeo | null {
  const data = d.data();
  if (data.status !== 'completed') return null;
  const r  = data.results ?? {};
  const fi = r.flightInfo ?? {};
  const cowPoints: [number, number][] = (r.cows ?? [])
    .filter((c: any) => Array.isArray(c.gps_location) && c.gps_location.length === 2)
    .map((c: any) => c.gps_location as [number, number]);
  return {
    id:          d.id,
    name:        data.missionName ?? 'Sin nombre',
    date:        data.createdAt?.toDate?.()?.toISOString() ?? '',
    totalCows:     r.totalCows     ?? 0,
    totalPersons:  r.totalPersons  ?? 0,
    totalVehicles: r.totalVehicles ?? 0,
    centerLat:   fi.center_lat   ?? null,
    centerLon:   fi.center_lon   ?? null,
    avgAltitude: fi.avg_altitude_m ?? null,
    bounds:      (fi.min_lat != null) ? {
      minLat: fi.min_lat, maxLat: fi.max_lat,
      minLon: fi.min_lon, maxLon: fi.max_lon,
    } : null,
    cowPoints,
    videoS3Key:  data.videoS3Key ?? undefined,
  };
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const weekStartStr = searchParams.get('weekStart');
  const filter       = searchParams.get('filter') ?? 'recent';
  const limitN       = Math.min(parseInt(searchParams.get('limit') ?? '10', 10), 500);
  const fromStr      = searchParams.get('from');
  const toStr        = searchParams.get('to');

  try {
    let q;

    if (weekStartStr) {
      // Modo compatibilidad — semana concreta
      const weekStart = new Date(weekStartStr + 'T00:00:00');
      const weekEnd   = new Date(weekStart); weekEnd.setDate(weekEnd.getDate() + 7);
      q = query(
        collection(db, 'processing_jobs'),
        where('createdAt', '>=', Timestamp.fromDate(weekStart)),
        where('createdAt', '<',  Timestamp.fromDate(weekEnd)),
        orderBy('createdAt', 'desc'),
      );
    } else if (filter === 'custom' && (fromStr || toStr)) {
      // Rango personalizado
      const constraints: any[] = [collection(db, 'processing_jobs')];
      if (fromStr) constraints.push(where('createdAt', '>=', Timestamp.fromDate(new Date(fromStr + 'T00:00:00'))));
      if (toStr)   constraints.push(where('createdAt', '<=', Timestamp.fromDate(new Date(toStr   + 'T23:59:59'))));
      constraints.push(orderBy('createdAt', 'desc'));
      q = query(...constraints as [any, ...any[]]);
    } else {
      // Modo filtro
      const now = new Date();
      if (filter === 'today') {
        const start = new Date(now); start.setHours(0,0,0,0);
        q = query(collection(db,'processing_jobs'), where('createdAt','>=',Timestamp.fromDate(start)), orderBy('createdAt','desc'));
      } else if (filter === 'week') {
        const start = new Date(now); start.setDate(start.getDate() - 7);
        q = query(collection(db,'processing_jobs'), where('createdAt','>=',Timestamp.fromDate(start)), orderBy('createdAt','desc'));
      } else if (filter === 'month') {
        const start = new Date(now); start.setDate(start.getDate() - 30);
        q = query(collection(db,'processing_jobs'), where('createdAt','>=',Timestamp.fromDate(start)), orderBy('createdAt','desc'));
      } else {
        // recent — últimas N
        q = query(collection(db,'processing_jobs'), orderBy('createdAt','desc'), limit(limitN));
      }
    }

    const snap     = await getDocs(q);
    const missions = snap.docs.map(buildMission).filter(Boolean) as MissionGeo[];

    return NextResponse.json({ missions });
  } catch (err) {
    console.error('[missions/geo]', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
