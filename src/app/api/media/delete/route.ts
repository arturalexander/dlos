import { NextRequest, NextResponse } from 'next/server';
import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3';

const s3 = new S3Client({
  region: process.env.AWS_REGION || 'eu-west-1',
  credentials: {
    accessKeyId:     process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

const BUCKET = process.env.AWS_S3_BUCKET || 'dlosai-media-prod';

export async function DELETE(req: NextRequest) {
  const key = req.nextUrl.searchParams.get('key');
  if (!key) {
    return NextResponse.json({ error: 'Falta el parámetro key' }, { status: 400 });
  }

  // Seguridad: no permitir path traversal
  if (key.includes('..') || key.startsWith('/')) {
    return NextResponse.json({ error: 'Key inválida' }, { status: 400 });
  }

  try {
    await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
    return NextResponse.json({ ok: true, deleted: key });
  } catch (err) {
    console.error('[/api/media/delete]', err);
    return NextResponse.json({ error: 'Error al eliminar de S3', detail: String(err) }, { status: 500 });
  }
}
