// src/lib/gpu-queue.ts
// VERSIÓN CON RETRY AUTOMÁTICO - Excluye hosts que fallan el health check
import { db } from '@/lib/firebase';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';

interface GPUJobData {
    flightId: string;
    missionId?: string;
    missionName: string;
    videoUrl: string;
    videoExpiresAt: string;
    videoFileName: string;
    videoFileSize: number;
    siteId: string;
    siteName: string;
    organizationId: string;
    telemetryFiles: Array<{
        file_name: string;
        signed_url: string;
        expires_at: string;
    }>;
}

export async function enqueueGPUJob(jobData: GPUJobData): Promise<string> {
    const jobId = `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    console.log(`\n${'='.repeat(60)}`);
    console.log(`📦 ENCOLANDO JOB: ${jobId}`);
    console.log(`${'='.repeat(60)}`);
    console.log(`   Mission: ${jobData.missionName}`);
    console.log(`   Video: ${jobData.videoFileName}`);
    console.log(`   Size: ${jobData.videoFileSize > 0 ? (jobData.videoFileSize / 1024 / 1024).toFixed(2) + ' MB' : 'Desconocido'}`);

    try {
        const jobRef = doc(db, 'processing_jobs', jobId);
        await setDoc(jobRef, {
            jobId,
            status: 'queued',
            flightId: jobData.flightId,
            missionId: jobData.missionId || null,
            missionName: jobData.missionName,
            organizationId: jobData.organizationId,
            siteId: jobData.siteId,
            siteName: jobData.siteName,
            videoUrl: jobData.videoUrl,
            videoFileName: jobData.videoFileName,
            videoFileSize: jobData.videoFileSize || 0,
            videoExpiresAt: jobData.videoExpiresAt,
            telemetryFiles: jobData.telemetryFiles || [],
            workerType: 'vast-on-demand',
            workerInstanceId: null,

            // 👇 CAMPOS PARA RETRY AUTOMÁTICO
            retryCount: 0,
            maxRetries: 5,
            lastGpuError: null,
            lastFailedGpu: null,
            failedGpuHosts: [],  // Lista de host_id que fallaron

            queuedAt: serverTimestamp(),
            startedAt: null,
            completedAt: null,
            processingTimeSeconds: null,
            results: null,
            error: null,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        });

        console.log(`✅ Job guardado en Firestore`);
        console.log(`\n🚀 Iniciando GPU en Vast.ai...`);

        const result = await startVastGPU(jobId, jobData);

        if (result.success && result.instanceId) {
            await setDoc(jobRef, {
                workerInstanceId: result.instanceId,
                status: 'starting',
                vastGpu: result.gpuName || null,
                vastPrice: result.pricePerHour || null,
                vastHostId: result.hostId || null,
                updatedAt: serverTimestamp()
            }, { merge: true });

            console.log(`✅ GPU iniciada correctamente`);
            console.log(`   Instance ID: ${result.instanceId}`);
            console.log(`   Host ID: ${result.hostId || 'N/A'}`);
            console.log(`   GPU: ${result.gpuName || 'N/A'}`);
            console.log(`   Precio: $${result.pricePerHour?.toFixed(3) || '?'}/hr`);
        } else {
            await setDoc(jobRef, {
                status: 'queued',
                vastError: result.error || 'Error desconocido',
                updatedAt: serverTimestamp()
            }, { merge: true });

            console.error(`❌ No se pudo iniciar GPU: ${result.error}`);
        }

        return jobId;

    } catch (error) {
        console.error(`❌ Error encolando job:`, error);
        throw error;
    }
}

interface VastResult {
    success: boolean;
    instanceId?: string;
    hostId?: number;
    gpuName?: string;
    pricePerHour?: number;
    error?: string;
}

// ============================================================
// HOSTS CONOCIDOS QUE FUNCIONAN BIEN (tu whitelist personal)
// Añade aquí los host_id que te han funcionado
// ============================================================
const TRUSTED_HOSTS = [
    124171,  // RTX 3090 - $0.099/hr - funciona perfecto
    // Añade más hosts aquí cuando encuentres buenos
];

// ============================================================
// FILTROS SEGÚN RECOMENDACIONES DE VAST.AI
// ============================================================

// GPUs permitidas (datacenter + consumer fiables)
const ALLOWED_GPUS = [
    // Datacenter
    'a100', 'a40', 'a30', 'a16', 'a10', 'a6000', 'a5000', 'a4500', 'a4000',
    'l40', 'l40s', 'l4',
    'h100', 'h200',
    'v100',
    't4',
    // Consumer fiables
    'rtx 4090', 'rtx 4080', 'rtx 4070',
    'rtx 3090', 'rtx 3080', 'rtx 3070',
];

// GPUs prohibidas (problemas conocidos)
const BLACKLISTED_GPUS = [
    'p100', 'k80', 'p40', 'm40',  // Muy viejas
    '1080', '1070', '1060',       // Gaming antigua
    '2080', '2070', '2060',       // Drivers inestables
];

function isGPUAllowed(gpuName: string): boolean {
    const name = gpuName.toLowerCase();

    // Primero verificar blacklist
    for (const bad of BLACKLISTED_GPUS) {
        if (name.includes(bad)) return false;
    }

    // Luego verificar whitelist
    for (const good of ALLOWED_GPUS) {
        if (name.includes(good)) return true;
    }

    return false;
}

async function startVastGPU(jobId: string, jobData: any): Promise<VastResult> {
    const VAST_API_KEY = process.env.VAST_API_KEY;

    if (!VAST_API_KEY) {
        console.error('❌ VAST_API_KEY no está configurada');
        return { success: false, error: 'VAST_API_KEY no configurada' };
    }

    try {
        console.log(`\n🔍 Buscando GPUs en Vast.ai...`);

        // Obtener hosts que ya fallaron para este job (si es un retry)
        let failedHosts: number[] = [];
        try {
            const jobRef = doc(db, 'processing_jobs', jobId);
            const jobDoc = await getDoc(jobRef);
            if (jobDoc.exists()) {
                failedHosts = jobDoc.data()?.failedGpuHosts || [];
                if (failedHosts.length > 0) {
                    console.log(`   🚫 Excluyendo ${failedHosts.length} hosts que ya fallaron: ${failedHosts.join(', ')}`);
                }
            }
        } catch (e) {
            console.log('   ⚠️ No se pudieron obtener hosts fallidos (primera vez)');
        }

        const searchResponse = await fetch('https://console.vast.ai/api/v0/bundles/', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${VAST_API_KEY}`,
                'Accept': 'application/json'
            }
        });

        if (!searchResponse.ok) {
            return { success: false, error: `Vast.ai search failed: ${searchResponse.status}` };
        }

        const data = await searchResponse.json();
        const offers = data.offers || [];

        console.log(`   📊 Ofertas totales: ${offers.length}`);

        if (offers.length === 0) {
            return { success: false, error: 'No hay ofertas disponibles' };
        }

        // ============================================================
        // FILTRADO SEGÚN RECOMENDACIONES DE VAST.AI
        // ============================================================
        const suitable = offers.filter((offer: any) => {
            const gpuName = (offer.gpu_name || '').toLowerCase();

            // 0. EXCLUIR HOSTS QUE YA FALLARON
            if (failedHosts.includes(offer.host_id)) {
                return false;
            }

            // 1. GPU permitida
            if (!isGPUAllowed(gpuName)) {
                return false;
            }

            // 2. cuda_max_good >= 11.8 (RECOMENDACIÓN VAST.AI)
            const cudaMaxGood = parseFloat(offer.cuda_max_good || '0');
            if (cudaMaxGood < 11.8) {
                return false;
            }

            // 3. driver_version >= 525 (RECOMENDACIÓN VAST.AI)
            const driverVersion = parseFloat(offer.driver_version || '0');
            if (driverVersion < 525) {
                return false;
            }

            // 4. reliability >= 90% (RECOMENDACIÓN VAST.AI)
            const reliability = offer.reliability2 || 0;
            if (reliability < 0.90) {
                return false;
            }

            // 5. Solo 1 GPU (más estable)
            if (offer.num_gpus !== 1) {
                return false;
            }

            // 6. VRAM >= 10GB
            if ((offer.gpu_ram || 0) < 10000) {
                return false;
            }

            // 7. Disco >= 25GB
            if ((offer.disk_space || 0) < 25) {
                return false;
            }

            // 8. Internet >= 50 Mbps
            if ((offer.inet_down || 0) < 50) {
                return false;
            }

            // 9. Alquilable
            if (offer.rentable !== true) {
                return false;
            }

            // 10. Sin errores de GPU recientes
            if ((offer.num_gpu_errors || 0) > 0) {
                return false;
            }

            // 11. Precio máximo $1.50/hr
            if ((offer.dph_total || 999) > 1.50) {
                return false;
            }

            return true;
        });

        console.log(`   ✅ Ofertas válidas: ${suitable.length}`);

        if (suitable.length === 0) {
            return {
                success: false,
                error: 'No hay GPUs disponibles que cumplan los requisitos (o todas ya fallaron)'
            };
        }

        // ============================================================
        // ORDENAMIENTO: Priorizar hosts conocidos, luego reliability, luego precio
        // ============================================================
        suitable.sort((a: any, b: any) => {
            const aIsTrusted = TRUSTED_HOSTS.includes(a.host_id);
            const bIsTrusted = TRUSTED_HOSTS.includes(b.host_id);

            // 1. Hosts conocidos primero
            if (aIsTrusted && !bIsTrusted) return -1;
            if (!aIsTrusted && bIsTrusted) return 1;

            // 2. Reliability >= 98% primero
            const relA = a.reliability2 || 0;
            const relB = b.reliability2 || 0;
            if (relA >= 0.98 && relB < 0.98) return -1;
            if (relB >= 0.98 && relA < 0.98) return 1;

            // 3. cuda_max_good más alto (mejor configuración)
            const cudaA = parseFloat(a.cuda_max_good || '0');
            const cudaB = parseFloat(b.cuda_max_good || '0');
            if (cudaA > cudaB) return -1;
            if (cudaB > cudaA) return 1;

            // 4. Por precio
            return (a.dph_total || 999) - (b.dph_total || 999);
        });

        // Mostrar top 5
        console.log(`\n📋 Top 5 GPUs disponibles:`);
        suitable.slice(0, 5).forEach((o: any, i: number) => {
            const trusted = TRUSTED_HOSTS.includes(o.host_id) ? '⭐' : '  ';
            console.log(`   ${i + 1}. ${trusted} ${o.gpu_name} | $${o.dph_total?.toFixed(3)}/hr | CUDA ${o.cuda_max_good} | Driver ${o.driver_version} | Rel ${(o.reliability2 * 100).toFixed(1)}% | Host ${o.host_id}`);
        });

        // ENV VARS
        const envVars: Record<string, string> = {
            JOB_ID: jobId,
            FIREBASE_PROJECT_ID: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'dlos-ai',
            CALLBACK_URL: `${process.env.NEXT_PUBLIC_APP_URL || 'https://dlosai.vercel.app'}/api/processing/callback`,
            CALLBACK_API_KEY: process.env.CALLBACK_API_KEY || '',
            AUTO_SHUTDOWN: 'true',
            VAST_API_KEY: VAST_API_KEY
        };

        if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
            envVars.FIREBASE_SERVICE_ACCOUNT = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
        }

        // INTENTAR CREAR INSTANCIA
        const MAX_RETRIES = 10;

        for (let attempt = 0; attempt < Math.min(MAX_RETRIES, suitable.length); attempt++) {
            const selected = suitable[attempt];
            const isTrusted = TRUSTED_HOSTS.includes(selected.host_id);

            console.log(`\n💰 Intentando GPU #${attempt + 1}/${Math.min(MAX_RETRIES, suitable.length)}:`);
            console.log(`   ${isTrusted ? '⭐ HOST CONOCIDO' : '🆕 Host nuevo'}`);
            console.log(`   Host ID: ${selected.host_id}`);
            console.log(`   GPU: ${selected.gpu_name}`);
            console.log(`   VRAM: ${(selected.gpu_ram / 1000).toFixed(1)} GB`);
            console.log(`   Precio: $${selected.dph_total?.toFixed(3)}/hr`);
            console.log(`   CUDA: ${selected.cuda_max_good}`);
            console.log(`   Driver: ${selected.driver_version}`);
            console.log(`   Reliability: ${(selected.reliability2 * 100).toFixed(1)}%`);

            try {
                const createResponse = await fetch(`https://console.vast.ai/api/v0/asks/${selected.id}/`, {
                    method: 'PUT',
                    headers: {
                        'Authorization': `Bearer ${VAST_API_KEY}`,
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    },
                    body: JSON.stringify({
                        client_id: 'me',
                        image: 'arturalexander/cattle-vision-worker:latest',
                        disk: 30,
                        env: envVars,
                        onstart: 'python3 /app/gpu_worker.py'
                    })
                });

                if (createResponse.ok) {
                    const result = await createResponse.json();
                    const instanceId = result.new_contract || result.instance_id || result.id;

                    if (instanceId) {
                        console.log(`   ✅ Instancia creada: ${instanceId}`);

                        // Si este host funcionó y no está en la lista, logearlo
                        if (!isTrusted) {
                            console.log(`   💡 TIP: Añade host_id ${selected.host_id} a TRUSTED_HOSTS si funciona bien`);
                        }

                        return {
                            success: true,
                            instanceId: String(instanceId),
                            hostId: selected.host_id,
                            gpuName: selected.gpu_name,
                            pricePerHour: selected.dph_total
                        };
                    }
                }

                const errorText = await createResponse.text();
                console.log(`   ⚠️ Falló: ${errorText.substring(0, 100)}`);

                if (attempt < MAX_RETRIES - 1) {
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }

            } catch (err: any) {
                console.log(`   ⚠️ Error: ${err.message}`);
                if (attempt < MAX_RETRIES - 1) {
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }
            }
        }

        return {
            success: false,
            error: `No se pudo crear instancia después de ${MAX_RETRIES} intentos`
        };

    } catch (error: any) {
        console.error('❌ Error en startVastGPU:', error);
        return { success: false, error: error.message || 'Error desconocido' };
    }
}

// ============================================================
// FUNCIÓN PARA RETRY (exportada para el monitor)
// ============================================================

/**
 * Reintenta un job que falló por GPU health check
 * Usado por el monitor de retry automático
 */
export async function retryFailedJob(jobId: string): Promise<VastResult> {
    console.log(`\n🔄 AUTO-RETRY: ${jobId}`);

    try {
        // Obtener datos del job
        const jobRef = doc(db, 'processing_jobs', jobId);
        const jobDoc = await getDoc(jobRef);

        if (!jobDoc.exists()) {
            throw new Error(`Job no encontrado: ${jobId}`);
        }

        const jobData = jobDoc.data();

        // Verificar que no haya expirado el video
        if (jobData.videoExpiresAt) {
            const expiresAt = new Date(jobData.videoExpiresAt);
            if (new Date() > expiresAt) {
                throw new Error('URL del video expirada - no se puede reintentar');
            }
        }

        console.log(`   Intento ${(jobData.retryCount || 0) + 1}/${jobData.maxRetries || 5}`);
        console.log(`   Hosts excluidos: ${(jobData.failedGpuHosts || []).length}`);

        // Lanzar nueva GPU (startVastGPU ya excluye hosts fallidos)
        const result = await startVastGPU(jobId, jobData);

        if (result.success && result.instanceId) {
            await setDoc(jobRef, {
                workerInstanceId: result.instanceId,
                status: 'starting',
                vastGpu: result.gpuName || null,
                vastPrice: result.pricePerHour || null,
                vastHostId: result.hostId || null,
                lastGpuError: null,
                updatedAt: serverTimestamp()
            }, { merge: true });

            console.log(`✅ Job ${jobId} relanzado exitosamente`);
            console.log(`   Nueva GPU: ${result.gpuName}`);
            console.log(`   Host ID: ${result.hostId}`);
        } else {
            // No se pudo lanzar, pero no incrementamos retryCount aquí
            // El worker lo hará cuando falle el health check
            await setDoc(jobRef, {
                status: 'queued',
                lastGpuError: result.error,
                updatedAt: serverTimestamp()
            }, { merge: true });

            console.log(`⚠️ No se pudo relanzar: ${result.error}`);
        }

        return result;

    } catch (error: any) {
        console.error(`❌ Error en retry: ${error.message}`);
        return { success: false, error: error.message };
    }
}

export async function destroyVastInstance(instanceId: string): Promise<boolean> {
    const VAST_API_KEY = process.env.VAST_API_KEY;
    if (!VAST_API_KEY) return false;

    try {
        const response = await fetch(`https://console.vast.ai/api/v0/instances/${instanceId}/`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${VAST_API_KEY}`,
                'Accept': 'application/json'
            }
        });
        return response.ok || response.status === 204;
    } catch {
        return false;
    }
}