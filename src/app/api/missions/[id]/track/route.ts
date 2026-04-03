// /api/missions/[id]/track — Ruta GPS del dron desde mapa.html en Firebase Storage
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';

function storageUrlToHttp(url: string): string {
  if (url.startsWith('https://')) return url;
  // gs://bucket/path/to/file → HTTPS Firebase Storage URL
  const withoutGs = url.replace('gs://', '');
  const slashIdx = withoutGs.indexOf('/');
  const bucket = withoutGs.slice(0, slashIdx);
  const path   = withoutGs.slice(slashIdx + 1);
  return `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(path)}?alt=media`;
}

async function extractTrackFromHtml(url: string): Promise<[number, number][]> {
  const httpUrl = storageUrlToHttp(url);
  console.log('[track] fetching URL:', httpUrl.substring(0, 120));
  const res = await fetch(httpUrl, { signal: AbortSignal.timeout(10000) });
  console.log('[track] fetch status:', res.status, res.statusText);
  if (!res.ok) return [];
  const html = await res.text();
  console.log('[track] HTML length:', html.length, 'has antPath:', html.includes('antPath'));
  const match = html.match(/L\.polyline\.antPath\s*\(\s*(\[\[[\s\S]*?\]\])\s*,/);
  if (!match) return [];
  const rawCoords: [number, number][] = JSON.parse(match[1]);
  const track: [number, number][] = [];
  for (const pt of rawCoords) {
    const last = track[track.length - 1];
    if (!last || last[0] !== pt[0] || last[1] !== pt[1]) track.push(pt);
  }
  console.log('[track] points extracted:', track.length);
  return track;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const jobDoc = await getDoc(doc(db, 'processing_jobs', id));
    if (!jobDoc.exists()) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const data = jobDoc.data();
    console.log('[track] mission status:', data?.status, '| mapUrl:', data?.results?.mapUrl ? 'EXISTS' : 'MISSING', '| allFiles keys:', Object.keys(data?.results?.allFiles ?? {}).join(', '));

    // 1. Intentar con results.mapUrl (campo principal)
    const mapUrl: string | undefined = data?.results?.mapUrl;
    if (mapUrl) {
      const track = await extractTrackFromHtml(mapUrl);
      if (track.length > 1) {
        return NextResponse.json({ track, start: track[0], end: track[track.length - 1] });
      }
    }

    // 2. Buscar en allFiles cualquier .html que tenga antPath
    const allFiles: Record<string, string> = data?.results?.allFiles ?? {};
    for (const [, fileUrl] of Object.entries(allFiles)) {
      if (!fileUrl.toLowerCase().includes('.html')) continue;
      try {
        const track = await extractTrackFromHtml(fileUrl);
        if (track.length > 1) {
          return NextResponse.json({ track, start: track[0], end: track[track.length - 1] });
        }
      } catch { /* seguir probando */ }
    }

    return NextResponse.json({ track: [], start: null, end: null });
  } catch (err) {
    console.error('[missions/track]', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';
