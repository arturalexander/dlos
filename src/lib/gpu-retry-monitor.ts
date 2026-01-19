// src/lib/gpu-retry-monitor.ts
// Monitor que detecta jobs fallidos por GPU y los reintenta automáticamente

import { db } from '@/lib/firebase';
import { collection, query, where, onSnapshot, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { retryFailedJob } from './gpu-queue';

/**
 * Monitorea jobs que fallaron por GPU health check y los reintenta automáticamente
 * 
 * Flujo:
 * 1. Worker detecta GPU mala → actualiza job a 'queued' con retryCount++
 * 2. Este monitor detecta el cambio
 * 3. Espera un tiempo proporcional al número de intentos
 * 4. Llama a retryFailedJob() que lanza nueva GPU (excluyendo hosts fallidos)
 * 5. Si llega a 5 intentos, marca el job como 'failed' definitivamente
 */
export function startRetryMonitor() {
    console.log('🔄 Iniciando monitor de retry automático...');

    const jobsRef = collection(db, 'processing_jobs');

    // Escuchar jobs que:
    // - Están en estado 'queued'
    // - Tienen retryCount > 0 (significa que ya intentaron al menos una vez)
    // - No han superado el límite de reintentos
    const q = query(
        jobsRef,
        where('status', '==', 'queued'),
        where('retryCount', '>', 0),
        where('retryCount', '<=', 5)
    );

    // Set para evitar procesar el mismo job múltiples veces
    const processingJobs = new Set<string>();

    const unsubscribe = onSnapshot(q, (snapshot) => {
        snapshot.docChanges().forEach(async (change) => {
            // Solo procesar modificaciones y nuevos docs
            if (change.type === 'modified' || change.type === 'added') {
                const jobData = change.doc.data();
                const jobId = change.doc.id;

                // Evitar procesar el mismo job simultáneamente
                if (processingJobs.has(jobId)) {
                    return;
                }

                // Solo reintentar si fue error de GPU health check
                const isGpuError =
                    jobData.lastError?.includes('GPU health check failed') ||
                    jobData.lastError?.includes('nvidia-smi') ||
                    jobData.lastError?.includes('PyTorch CUDA') ||
                    jobData.vastError?.includes('GPU');

                if (isGpuError && jobData.retryCount <= 5) {
                    processingJobs.add(jobId);

                    console.log(`\n${'='.repeat(60)}`);
                    console.log(`🔄 AUTO-RETRY DETECTADO`);
                    console.log(`${'='.repeat(60)}`);
                    console.log(`   Job: ${jobId}`);
                    console.log(`   Mission: ${jobData.missionName || 'N/A'}`);
                    console.log(`   Intento: ${jobData.retryCount}/5`);
                    console.log(`   Error anterior: ${jobData.lastError?.substring(0, 100)}`);
                    console.log(`   Hosts excluidos: ${(jobData.failedGpuHosts || []).length}`);

                    // Esperar tiempo proporcional al número de intentos
                    // Intento 1: 5s, Intento 2: 10s, Intento 3: 15s, etc.
                    const waitTime = jobData.retryCount * 5000;
                    console.log(`   ⏳ Esperando ${waitTime / 1000}s antes de reintentar...`);

                    await new Promise(resolve => setTimeout(resolve, waitTime));

                    // Reintentar con nueva GPU
                    try {
                        console.log(`   🚀 Lanzando nueva GPU...`);
                        const result = await retryFailedJob(jobId);

                        if (result.success) {
                            console.log(`   ✅ GPU relanzada exitosamente`);
                            console.log(`   GPU: ${result.gpuName}`);
                            console.log(`   Host: ${result.hostId}`);
                            console.log(`   Precio: $${result.pricePerHour?.toFixed(3)}/hr`);
                        } else {
                            console.log(`   ⚠️ No se pudo relanzar: ${result.error}`);

                            // Si llegamos al límite, marcar como failed definitivamente
                            if (jobData.retryCount >= 5) {
                                console.log(`   ❌ Máximo de reintentos alcanzado - marcando como failed`);

                                const jobRef = doc(db, 'processing_jobs', jobId);
                                await setDoc(jobRef, {
                                    status: 'failed',
                                    error: 'Máximo de reintentos alcanzado (5). GPU health check falló en todos los intentos.',
                                    errorDetails: `Hosts que fallaron: ${(jobData.failedGpuHosts || []).join(', ')}`,
                                    failedAt: serverTimestamp(),
                                    updatedAt: serverTimestamp()
                                }, { merge: true });

                                // También actualizar el vuelo
                                if (jobData.flightId) {
                                    const flightRef = doc(db, 'flights', jobData.flightId);
                                    await setDoc(flightRef, {
                                        processingStatus: 'failed',
                                        processingError: 'GPU health check falló en todos los intentos',
                                        updatedAt: serverTimestamp()
                                    }, { merge: true });
                                }
                            }
                        }

                    } catch (error: any) {
                        console.error(`   ❌ Error en auto-retry:`, error);

                        // Si llegamos al límite, marcar como failed
                        if (jobData.retryCount >= 5) {
                            const jobRef = doc(db, 'processing_jobs', jobId);
                            await setDoc(jobRef, {
                                status: 'failed',
                                error: `Máximo de reintentos alcanzado. Último error: ${error.message}`,
                                failedAt: serverTimestamp(),
                                updatedAt: serverTimestamp()
                            }, { merge: true });
                        }

                    } finally {
                        // Remover del set después de un tiempo para permitir futuros intentos
                        setTimeout(() => {
                            processingJobs.delete(jobId);
                        }, 30000); // 30 segundos
                    }

                    console.log(`${'='.repeat(60)}\n`);
                }
            }
        });
    });

    console.log('✅ Monitor de retry iniciado');
    console.log('   Escuchando: processing_jobs con status=queued y retryCount>0');

    return unsubscribe;
}

/**
 * Versión simplificada para iniciar el monitor sin logs excesivos
 */
export function startRetryMonitorQuiet() {
    const jobsRef = collection(db, 'processing_jobs');

    const q = query(
        jobsRef,
        where('status', '==', 'queued'),
        where('retryCount', '>', 0),
        where('retryCount', '<=', 5)
    );

    const processingJobs = new Set<string>();

    const unsubscribe = onSnapshot(q, (snapshot) => {
        snapshot.docChanges().forEach(async (change) => {
            if (change.type === 'modified' || change.type === 'added') {
                const jobData = change.doc.data();
                const jobId = change.doc.id;

                if (processingJobs.has(jobId)) return;

                const isGpuError =
                    jobData.lastError?.includes('GPU health check failed') ||
                    jobData.lastError?.includes('nvidia-smi') ||
                    jobData.lastError?.includes('PyTorch CUDA');

                if (isGpuError && jobData.retryCount <= 5) {
                    processingJobs.add(jobId);

                    const waitTime = jobData.retryCount * 5000;
                    await new Promise(resolve => setTimeout(resolve, waitTime));

                    try {
                        await retryFailedJob(jobId);
                    } catch (error) {
                        // Silencioso
                    } finally {
                        setTimeout(() => processingJobs.delete(jobId), 30000);
                    }
                }
            }
        });
    });

    return unsubscribe;
}