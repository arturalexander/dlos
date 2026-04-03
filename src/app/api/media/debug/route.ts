import { NextResponse } from 'next/server';
import { S3Client, ListObjectsV2Command, HeadBucketCommand } from '@aws-sdk/client-s3';

export async function GET() {
  const config = {
    keyId:  process.env.AWS_ACCESS_KEY_ID   ? `${process.env.AWS_ACCESS_KEY_ID.slice(0,6)}...` : 'MISSING',
    secret: process.env.AWS_SECRET_ACCESS_KEY ? 'SET' : 'MISSING',
    region: process.env.AWS_REGION  || 'MISSING',
    bucket: process.env.AWS_S3_BUCKET || 'MISSING',
  };

  if (config.keyId === 'MISSING' || config.secret === 'MISSING') {
    return NextResponse.json({ ok: false, step: 'env', config, error: 'Faltan variables de entorno AWS' }, { status: 500 });
  }

  const s3 = new S3Client({
    region: process.env.AWS_REGION!,
    credentials: {
      accessKeyId:     process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    },
  });

  // Step 1: bucket exists?
  try {
    await s3.send(new HeadBucketCommand({ Bucket: process.env.AWS_S3_BUCKET! }));
  } catch (e: any) {
    return NextResponse.json({ ok: false, step: 'bucket', config, error: e?.message, code: e?.name }, { status: 500 });
  }

  // Step 2: list first 5 objects
  try {
    const res = await s3.send(new ListObjectsV2Command({ Bucket: process.env.AWS_S3_BUCKET!, MaxKeys: 5 }));
    return NextResponse.json({
      ok: true, config,
      totalSampled: res.KeyCount,
      sample: (res.Contents ?? []).map(o => ({ key: o.Key, size: o.Size, date: o.LastModified })),
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, step: 'list', config, error: e?.message, code: e?.name }, { status: 500 });
  }
}
