/**
 * GET /api/galisancho/informes/mapa
 * Proxy server-side para evitar CORS al obtener el mapa estático OSM.
 * Devuelve la imagen en base64 lista para incrustar en jsPDF.
 */
import { NextRequest, NextResponse } from 'next/server';

const LAT = 37.7923;
const LNG = -6.2046;

export async function GET(_req: NextRequest) {
  try {
    // Obtenemos un mapa estático 3×2 tiles de OpenStreetMap (sin API key)
    const url =
      `https://staticmap.openstreetmap.de/staticmap.php` +
      `?center=${LAT},${LNG}&zoom=13&size=560x220` +
      `&markers=${LAT},${LNG},ol-marker-gold`;

    const res = await fetch(url, {
      headers: { 'User-Agent': 'dlos.ai/informes-galisancho' },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) throw new Error(`Map fetch ${res.status}`);

    const buffer = await res.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');
    const mime   = res.headers.get('content-type') ?? 'image/png';

    return NextResponse.json({ image: `data:${mime};base64,${base64}` });
  } catch (e: any) {
    console.warn('[MAPA-PROXY]', e.message);
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
}
