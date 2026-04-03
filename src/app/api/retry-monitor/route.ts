// src/app/api/retry-monitor/route.ts
// Monitor de retry serverless que se ejecuta periódicamente vía cron job

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { retryFailedJob } from '@/lib/gpu-queue';

/**
 * GET /api/retry-monitor
 * 
 * Busca jobs que fallaron por GPU health check y los reintenta automáticamente.
 * Ejecutado cada minuto por cron job de Vercel.
 * 
 * Para probarlo manualmente: curl https://tuapp.com/api/retry-monitor
 */
// Tiempo máximo que un job puede estar en 'starting' antes de considerarse atascado
const STUCK_STARTING_MINUTES = 20;

async function destroyVastInstance(instanceId: string): Promise<boolean> {
    const VAST_API_KEY = process.env.VAST_API_KEY;
    if (!VAST_API_KEY || !instanceId) return false;
    try {
        const response = await fetch(
            `https://console.vast.ai/api/v0/instances/${instanceId}/`,
            {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${VAST_API_KEY}`, 'Accept': 'application/json' }
            }
        );
        return response.status === 200 || response.status === 204;
    } catch {
        return false;
    }
}

export async function GET(request: NextRequest) {
    const startTime = Date.now();

    console.log('\n' + '='.repeat(60));
    console.log('🔄 RETRY MONITOR - CRON JOB');
    console.log('='.repeat(60));
    console.log(`Timestamp: ${new Date().toISOString()}`);

    try {
        // Buscar jobs que necesitan retry
        const jobsRef = collection(db, 'processing_jobs');

        const q = query(
            jobsRef,
            where('status', '==', 'queued'),
            where('retryCount', '>', 0),
            where('retryCount', '<=', 5)
        );

        // ── DETECCIÓN DE INSTANCIAS ATASCADAS ────────────────────
        const stuckCutoff = new Date(Date.now() - STUCK_STARTING_MINUTES * 60 * 1000);
        const qStuck = query(
            jobsRef,
            where('status', 'in', ['starting', 'processing']),
        );
        const stuckSnapshot = await getDocs(qStuck);
        let stuckKilled = 0;

        for (const docSnapshot of stuckSnapshot.docs) {
            const jobData = docSnapshot.data();
            const jobId   = docSnapshot.id;
            const updatedAt: Date = jobData.updatedAt?.toDate?.() || new Date(0);

            if (updatedAt > stuckCutoff) continue; // No lleva suficiente tiempo

            const minutesStuck = Math.round((Date.now() - updatedAt.getTime()) / 60000);
            console.log(`\n⚠️ Job ATASCADO detectado: ${jobId}`);
            console.log(`   Status: ${jobData.status} | Atascado: ${minutesStuck} min`);
            console.log(`   Instancia: ${jobData.workerInstanceId} | Host: ${jobData.vastHostId}`);

            // Destruir instancia en Vast.ai
            if (jobData.workerInstanceId) {
                const destroyed = await destroyVastInstance(String(jobData.workerInstanceId));
                console.log(`   🔌 Instancia destruida: ${destroyed ? '✅' : '❌'}`);
            }

            // Resetear job a queued, banear host
            const jobRef = doc(db, 'processing_jobs', jobId);
            const updateData: any = {
                status: 'queued',
                retryCount: (jobData.retryCount || 0) + 1,
                lastError: `Instancia atascada ${minutesStuck} min en status '${jobData.status}'`,
                workerInstanceId: null,
                updatedAt: serverTimestamp()
            };
            if (jobData.vastHostId) {
                const existing = jobData.failedGpuHosts || [];
                if (!existing.includes(jobData.vastHostId)) {
                    updateData.failedGpuHosts = [...existing, jobData.vastHostId];
                    console.log(`   🚫 Host ${jobData.vastHostId} añadido a failedGpuHosts`);
                }
            }
            await setDoc(jobRef, updateData, { merge: true });
            stuckKilled++;
            console.log(`   ✅ Job ${jobId} devuelto a cola`);
        }

        if (stuckKilled > 0) {
            console.log(`\n🔥 Instancias atascadas eliminadas: ${stuckKilled}`);
        }
        // ─────────────────────────────────────────────────────────

        console.log('🔍 Buscando jobs para reintentar...');
        const snapshot = await getDocs(q);
        console.log(`   Encontrados: ${snapshot.size} jobs`);

        if (snapshot.empty && stuckKilled === 0) {
            console.log('✅ No hay jobs pendientes de retry');
            console.log('='.repeat(60) + '\n');

            return NextResponse.json({
                success: true,
                checked: 0,
                retried: 0,
                stuckKilled: 0,
                timestamp: new Date().toISOString(),
                duration: Date.now() - startTime
            });
        }

        // Procesar cada job
        const results = [];

        for (const docSnapshot of snapshot.docs) {
            const jobData = docSnapshot.data();
            const jobId = docSnapshot.id;

            console.log(`\n📋 Job: ${jobId}`);
            console.log(`   Mission: ${jobData.missionName || 'N/A'}`);
            console.log(`   Retry: ${jobData.retryCount}/5`);
            console.log(`   Error: ${jobData.lastError?.substring(0, 80) || 'N/A'}`);

            // Solo reintentar si fue error de GPU
            const isGpuError =
                jobData.lastError?.includes('GPU health check failed') ||
                jobData.lastError?.includes('nvidia-smi') ||
                jobData.lastError?.includes('PyTorch CUDA');

            if (!isGpuError) {
                console.log('   ⏭️ No es error de GPU, saltando...');
                results.push({
                    jobId,
                    action: 'skipped',
                    reason: 'not_gpu_error'
                });
                continue;
            }

            // Verificar que no haya expirado el video
            if (jobData.videoExpiresAt) {
                const expiresAt = new Date(jobData.videoExpiresAt);
                if (new Date() > expiresAt) {
                    console.log('   ❌ URL del video expirada');

                    // Marcar como failed
                    const jobRef = doc(db, 'processing_jobs', jobId);
                    await setDoc(jobRef, {
                        status: 'failed',
                        error: 'URL del video expirada - no se puede reintentar',
                        failedAt: serverTimestamp(),
                        updatedAt: serverTimestamp()
                    }, { merge: true });

                    results.push({
                        jobId,
                        action: 'failed',
                        reason: 'video_expired'
                    });
                    continue;
                }
            }

            // Verificar que no hayamos superado el límite
            if (jobData.retryCount >= 5) {
                console.log('   ❌ Máximo de reintentos alcanzado');

                // Marcar como failed definitivo
                const jobRef = doc(db, 'processing_jobs', jobId);
                await setDoc(jobRef, {
                    status: 'failed',
                    error: 'Máximo de reintentos alcanzado (5). GPU health check falló en todos los intentos.',
                    errorDetails: `Hosts que fallaron: ${(jobData.failedGpuHosts || []).join(', ')}`,
                    failedAt: serverTimestamp(),
                    updatedAt: serverTimestamp()
                }, { merge: true });

                results.push({
                    jobId,
                    action: 'failed',
                    reason: 'max_retries'
                });
                continue;
            }

            // Esperar tiempo proporcional al número de reintentos
            const waitTime = jobData.retryCount * 5000; // 5s por intento
            const timeSinceLastUpdate = Date.now() - (jobData.updatedAt?.toMillis?.() || 0);

            if (timeSinceLastUpdate < waitTime) {
                const remainingWait = Math.ceil((waitTime - timeSinceLastUpdate) / 1000);
                console.log(`   ⏳ Esperando ${remainingWait}s más antes de reintentar...`);
                results.push({
                    jobId,
                    action: 'waiting',
                    remainingSeconds: remainingWait
                });
                continue;
            }

            // REINTENTAR
            console.log('   🚀 Reintentando...');
            try {
                const result = await retryFailedJob(jobId);

                if (result.success) {
                    console.log(`   ✅ GPU relanzada exitosamente`);
                    console.log(`      GPU: ${result.gpuName}`);
                    console.log(`      Host: ${result.hostId}`);

                    results.push({
                        jobId,
                        action: 'retried',
                        success: true,
                        gpu: result.gpuName,
                        hostId: result.hostId,
                        price: result.pricePerHour
                    });
                } else {
                    console.log(`   ⚠️ No se pudo relanzar: ${result.error}`);
                    results.push({
                        jobId,
                        action: 'retry_failed',
                        error: result.error
                    });
                }

            } catch (error: any) {
                console.error(`   ❌ Error en retry:`, error.message);
                results.push({
                    jobId,
                    action: 'error',
                    error: error.message
                });
            }
        }

        const duration = Date.now() - startTime;
        const retriedCount = results.filter(r => r.action === 'retried' && r.success).length;

        console.log('\n' + '-'.repeat(60));
        console.log(`✅ Monitor completado en ${duration}ms`);
        console.log(`   Jobs revisados: ${snapshot.size}`);
        console.log(`   Jobs reintentados: ${retriedCount}`);
        console.log('='.repeat(60) + '\n');

        return NextResponse.json({
            success: true,
            checked: snapshot.size,
            retried: retriedCount,
            stuckKilled,
            results,
            timestamp: new Date().toISOString(),
            duration
        });

    } catch (error: any) {
        console.error('❌ Error en retry monitor:', error);

        return NextResponse.json({
            success: false,
            error: error.message,
            timestamp: new Date().toISOString(),
            duration: Date.now() - startTime
        }, { status: 500 });
    }
}

/**
 * POST /api/retry-monitor
 * 
 * Permite forzar un retry manual de un job específico
 * Body: { jobId: "job_xxx" }
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { jobId } = body;

        if (!jobId) {
            return NextResponse.json(
                { error: 'jobId es requerido' },
                { status: 400 }
            );
        }

        console.log(`🔄 Retry manual solicitado para job: ${jobId}`);

        const result = await retryFailedJob(jobId);

        if (result.success) {
            return NextResponse.json({
                success: true,
                jobId,
                instanceId: result.instanceId,
                gpu: result.gpuName,
                hostId: result.hostId,
                price: result.pricePerHour
            });
        } else {
            return NextResponse.json({
                success: false,
                jobId,
                error: result.error
            }, { status: 500 });
        }

    } catch (error: any) {
        return NextResponse.json({
            success: false,
            error: error.message
        }, { status: 500 });
    }
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Timeout de 60 segundos