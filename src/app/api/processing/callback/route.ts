// src/app/api/processing/callback/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { doc, setDoc, serverTimestamp, getDoc } from 'firebase/firestore';

interface CallbackPayload {
    jobId: string;
    status: 'completed' | 'failed' | 'processing';
    timestamp: string;
    results?: {
        summary?: {
            total_confirmed_cows: number;
            total_time_min: number;
            max_simultaneous: number;
            gps_tracking_enabled: boolean;
        };
        flightInfo?: {
            center_lat: number;
            center_lon: number;
            avg_altitude_m: number;
        };
        totalCows?: number;
        cows?: Array<{
            track_id: number;
            detections: number;
            duration_s: number;
            gps_location: [number, number] | null;
        }>;
        captures?: Record<string, {
            clean: string;
            bbox: string;
        }>;
        mapUrl?: string;
        processedVideoUrl?: string;
        allFiles?: Record<string, string>;
    };
    error?: string;
}

export async function POST(request: NextRequest) {
    try {
        // 1. VALIDAR API KEY
        const apiKey = request.headers.get('X-API-Key');
        const expectedApiKey = process.env.CALLBACK_API_KEY;

        if (expectedApiKey && apiKey !== expectedApiKey) {
            console.error('❌ Invalid callback API key');
            return NextResponse.json(
                { status: 'error', message: 'Unauthorized' },
                { status: 401 }
            );
        }

        // 2. PARSEAR PAYLOAD
        const payload: CallbackPayload = await request.json();

        if (!payload.jobId || !payload.status) {
            return NextResponse.json(
                { status: 'error', message: 'Missing jobId or status' },
                { status: 400 }
            );
        }

        console.log(`\n📞 CALLBACK RECIBIDO`);
        console.log(`   Job: ${payload.jobId}`);
        console.log(`   Status: ${payload.status}`);

        // 3. OBTENER JOB ACTUAL
        const jobRef = doc(db, 'processing_jobs', payload.jobId);
        const jobDoc = await getDoc(jobRef);

        if (!jobDoc.exists()) {
            console.error(`❌ Job no encontrado: ${payload.jobId}`);
            return NextResponse.json(
                { status: 'error', message: 'Job not found' },
                { status: 404 }
            );
        }

        const jobData = jobDoc.data();

        // 4. ACTUALIZAR JOB
        if (payload.status === 'completed' && payload.results) {
            console.log(`✅ Job completado con ${payload.results.totalCows || 0} vacas`);

            await setDoc(jobRef, {
                status: 'completed',
                completedAt: serverTimestamp(),
                results: payload.results,
                callbackReceivedAt: payload.timestamp,
                updatedAt: serverTimestamp()
            }, { merge: true });

            // También actualizar el documento de vuelo
            if (jobData.flightId) {
                const flightRef = doc(db, 'flights', jobData.flightId);
                await setDoc(flightRef, {
                    processingStatus: 'completed',
                    results: payload.results,
                    updatedAt: serverTimestamp()
                }, { merge: true });
            }

            // 5. ENVIAR NOTIFICACIÓN DE TELEGRAM
            await sendTelegramNotification({
                jobId: payload.jobId,
                missionName: jobData.missionName || 'Sin nombre',
                siteName: jobData.siteName || 'Sin sitio',
                totalCows: payload.results.totalCows || 0,
                processingTimeSeconds: jobData.processingTimeSeconds,
                status: 'completed',
            });

            // 6. LANZAR ANÁLISIS IA (fire-and-forget)
            triggerAIAnalysis(payload.jobId);

        } else if (payload.status === 'failed') {
            console.error(`❌ Job falló: ${payload.error}`);

            await setDoc(jobRef, {
                status: 'failed',
                failedAt: serverTimestamp(),
                error: payload.error || 'Unknown error',
                callbackReceivedAt: payload.timestamp,
                updatedAt: serverTimestamp()
            }, { merge: true });

            // Actualizar vuelo
            if (jobData.flightId) {
                const flightRef = doc(db, 'flights', jobData.flightId);
                await setDoc(flightRef, {
                    processingStatus: 'failed',
                    processingError: payload.error,
                    updatedAt: serverTimestamp()
                }, { merge: true });
            }

            // Enviar notificación de error
            await sendTelegramNotification({
                jobId: payload.jobId,
                missionName: jobData.missionName || 'Sin nombre',
                siteName: jobData.siteName || 'Sin sitio',
                totalCows: 0,
                status: 'failed',
                error: payload.error,
            });

        } else if (payload.status === 'processing') {
            await setDoc(jobRef, {
                status: 'processing',
                startedAt: serverTimestamp(),
                callbackReceivedAt: payload.timestamp,
                updatedAt: serverTimestamp()
            }, { merge: true });
        }

        console.log(`✅ Callback procesado`);

        return NextResponse.json({
            status: 'success',
            message: 'Callback received',
            jobId: payload.jobId
        });

    } catch (error) {
        console.error('❌ Error procesando callback:', error);
        return NextResponse.json(
            { status: 'error', message: 'Internal server error' },
            { status: 500 }
        );
    }
}

// Función auxiliar para enviar notificación de Telegram
async function sendTelegramNotification(data: {
    jobId: string;
    missionName: string;
    siteName: string;
    totalCows: number;
    processingTimeSeconds?: number;
    status: 'completed' | 'failed';
    error?: string;
}) {
    try {
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://dlosai.vercel.app';

        const response = await fetch(`${appUrl}/api/telegram/notify`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data),
        });

        if (!response.ok) {
            console.warn('⚠️ Failed to send Telegram notification');
        } else {
            console.log('✅ Telegram notification sent');
        }
    } catch (error) {
        console.error('⚠️ Error sending Telegram notification:', error);
        // No lanzamos error para no afectar el callback principal
    }
}

// Fire-and-forget AI analysis trigger
async function triggerAIAnalysis(jobId: string) {
    try {
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://dlosai.vercel.app';
        const apiKey = process.env.CALLBACK_API_KEY;

        const response = await fetch(`${appUrl}/api/agents/analyze`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(apiKey ? { 'X-API-Key': apiKey } : {}),
            },
            body: JSON.stringify({ jobId }),
        });

        if (!response.ok) {
            console.warn(`⚠️ AI analysis trigger failed: ${response.status}`);
        } else {
            console.log('🤖 AI analysis triggered successfully');
        }
    } catch (error) {
        console.error('⚠️ Error triggering AI analysis:', error);
    }
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';