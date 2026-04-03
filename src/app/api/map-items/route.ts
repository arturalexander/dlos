import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { collection, getDocs, addDoc, serverTimestamp, query, orderBy } from 'firebase/firestore';

export async function GET() {
  try {
    const snap = await getDocs(
      query(collection(db, 'galisancho_map_items'), orderBy('createdAt', 'desc'))
    );
    const items = snap.docs.map(d => {
      const data = d.data();
      return {
        id: d.id,
        type: data.type,
        name: data.name,
        color: data.color || '#06b6d4',
        icon: data.icon || 'place',
        tag: data.tag || '',
        lat: data.lat,
        lng: data.lng,
        // Firestore no soporta arrays anidados; se guardan como [{lat,lng}] y se devuelven como [[lat,lng]]
        coordinates: data.coordinates
          ? data.coordinates.map((c: { lat: number; lng: number }) => [c.lat, c.lng] as [number, number])
          : undefined,
        createdAt: data.createdAt?.toDate?.().toISOString() ?? new Date().toISOString(),
      };
    });
    return NextResponse.json({ items });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { type, name, color, icon, tag, lat, lng, coordinates } = await req.json();
    if (!type || !name || lat == null || lng == null) {
      return NextResponse.json({ error: 'Faltan campos requeridos' }, { status: 400 });
    }
    const docData: any = {
      type,
      name,
      color: color || '#06b6d4',
      icon: icon || 'place',
      tag: tag || '',
      lat,
      lng,
      createdAt: serverTimestamp(),
    };
    // Convertir [[lat,lng],...] → [{lat,lng},...] para Firestore (no soporta arrays anidados)
    if (coordinates && Array.isArray(coordinates)) {
      docData.coordinates = coordinates.map(([lat, lng]: [number, number]) => ({ lat, lng }));
    }
    const ref = await addDoc(collection(db, 'galisancho_map_items'), docData);
    return NextResponse.json({ id: ref.id, ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
