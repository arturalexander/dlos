// src/app/api/processing/retry/route.ts
// Endpoint para relanzar jobs que fallaron manualmente

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';

// ============================================================
// CONFIGURACIÓN (copiada de gpu-queue.ts)
// ============================================================

const DATACENTER_GPUS = [
    'a100', 'a40', 'a30', 'a16', 'a10', 'a6000', 'a5000', 'a4500', 'a4000',
    'l40', 'l40s', 'l4',
    'h100', 'h200',
    'v100',
    't4',
    'rtx 4090', 'rtx 4080', 'rtx 3090',
];

const BLACKLISTED_GPUS = [
    'p100', 'k80', 'p40', 'm40', '1080', '2080', '3080', '1070', '1060',
];

const DATACENTER_REGIONS = [
    'US-CA', 'US-NY', 'US-TX', 'US-IL', 'US-VA', 'US-WA',
    'DE', 'NL', 'UK', 'FR', 'SE', 'FI',
    'SG', 'JP', 'KR', 'AU',
    'CA-ON', 'CA-QC'
];

function isGPUAllowed(gpuName: string): boolean {
    const name = gpuName.toLowerCase();
    for (const bad of BLACKLISTED_GPUS) {
        if (name.includes(bad)) return false;
    }
    for (const good of DATACENTER_GPUS) {
        if (name.includes(good)) return true;
    }
    if (name.includes('3060') || name.includes('3070') || name.includes('3090')) return true;
    if (name.includes('4060') || name.includes('4070')) return true;
    return false;
}

function isSecureCloud(offer: any): boolean {
    if (offer.datacenter === true) return true;
    if (offer.verified === true || offer.verification === 'verified') return true;
    if (offer.hosting_type === 0) return true;
    const location = offer.geolocation || '';
    const isDatacenterRegion = DATACENTER_REGIONS.some(region => location.includes(region));
    if (isDatacenterRegion && (offer.reliability2 || 0) >= 0.97) return true;
    return false;
}

// ============================================================
// ENDPOINT POST /api/processing/retry
// ============================================================

export async function POST(req: NextRequest) {
    console.log('\n' + '='.repeat(60));
    console.log('🔄 RETRY JOB REQUEST');
    console.log('='.repeat(60));

    try {
        // Obtener jobId del body o query
        let jobId: string | null = null;

        // Intentar del body
        try {
            const body = await req.json();
            jobId = body.jobId;
        } catch {
            // Si no hay body, intentar de query params
            jobId = req.nextUrl.searchParams.get('jobId');
        }

        if (!jobId) {
            return NextResponse.json(
                { error: 'jobId es requerido' },
                { status: 400 }
            );
        }

        console.log(`📋 Job ID: ${jobId}`);

        // Obtener job de Firebase
        const jobRef = doc(db, 'processing_jobs', jobId);
        const jobDoc = await getDoc(jobRef);

        if (!jobDoc.exists()) {
            return NextResponse.json(
                { error: `Job no encontrado: ${jobId}` },
                { status: 404 }
            );
        }

        const jobData = jobDoc.data();
        console.log(`   Status actual: ${jobData.status}`);
        console.log(`   Mission: ${jobData.missionName}`);
        console.log(`   Retry count: ${jobData.retryCount || 0}`);

        // Verificar que el job esté en estado válido para retry
        const validStatuses = ['queued', 'failed', 'starting'];
        if (!validStatuses.includes(jobData.status)) {
            return NextResponse.json(
                {
                    error: `Job en estado '${jobData.status}' no se puede reintentar`,
                    hint: 'Debe estar en: queued, failed, o starting'
                },
                { status: 400 }
            );
        }

        // Verificar que la URL del video no haya expirado
        if (jobData.videoExpiresAt) {
            const expiresAt = new Date(jobData.videoExpiresAt);
            const now = new Date();
            if (now > expiresAt) {
                return NextResponse.json(
                    {
                        error: 'URL del video expirada',
                        expiredAt: jobData.videoExpiresAt,
                        hint: 'Necesitas generar una nueva URL desde FlytBase'
                    },
                    { status: 400 }
                );
            }
            const minutesLeft = (expiresAt.getTime() - now.getTime()) / 1000 / 60;
            console.log(`   ⏰ URL expira en ${minutesLeft.toFixed(0)} minutos`);
        }

        // Lanzar GPU en Vast.ai
        console.log('\n🚀 Lanzando GPU en Vast.ai...');
        const result = await startVastGPU(jobId, jobData);

        if (result.success && result.instanceId) {
            // Actualizar job con nueva instancia
            await setDoc(jobRef, {
                workerInstanceId: result.instanceId,
                status: 'starting',
                vastGpu: result.gpuName || null,
                vastPrice: result.pricePerHour || null,
                retryCount: (jobData.retryCount || 0) + 1,
                lastRetryAt: serverTimestamp(),
                vastError: null, // Limpiar error anterior
                updatedAt: serverTimestamp()
            }, { merge: true });

            console.log('✅ GPU iniciada correctamente');

            return NextResponse.json({
                success: true,
                jobId,
                instanceId: result.instanceId,
                gpu: result.gpuName,
                pricePerHour: result.pricePerHour,
                retryCount: (jobData.retryCount || 0) + 1
            });

        } else {
            // Guardar error
            await setDoc(jobRef, {
                status: 'queued',
                vastError: result.error || 'Error desconocido',
                retryCount: (jobData.retryCount || 0) + 1,
                lastRetryAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            }, { merge: true });

            return NextResponse.json({
                success: false,
                jobId,
                error: result.error,
                retryCount: (jobData.retryCount || 0) + 1
            }, { status: 500 });
        }

    } catch (error: any) {
        console.error('❌ Error en retry:', error);
        return NextResponse.json(
            { error: error.message || 'Error interno' },
            { status: 500 }
        );
    }
}

// ============================================================
// GET - Para probar que el endpoint existe
// ============================================================

export async function GET(req: NextRequest) {
    const jobId = req.nextUrl.searchParams.get('jobId');

    if (!jobId) {
        return NextResponse.json({
            endpoint: '/api/processing/retry',
            usage: 'POST con { "jobId": "xxx" } o GET ?jobId=xxx',
            description: 'Relanza un job fallido en Vast.ai'
        });
    }

    // Si hay jobId, mostrar estado del job
    try {
        const jobRef = doc(db, 'processing_jobs', jobId);
        const jobDoc = await getDoc(jobRef);

        if (!jobDoc.exists()) {
            return NextResponse.json({ error: 'Job no encontrado' }, { status: 404 });
        }

        const data = jobDoc.data();
        return NextResponse.json({
            jobId,
            status: data.status,
            mission: data.missionName,
            retryCount: data.retryCount || 0,
            lastError: data.vastError || data.error || null,
            canRetry: ['queued', 'failed', 'starting'].includes(data.status)
        });

    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// ============================================================
// FUNCIÓN PARA LANZAR VAST.AI (copiada de gpu-queue.ts)
// ============================================================

interface VastResult {
    success: boolean;
    instanceId?: string;
    gpuName?: string;
    pricePerHour?: number;
    error?: string;
}

async function startVastGPU(jobId: string, jobData: any): Promise<VastResult> {
    const VAST_API_KEY = process.env.VAST_API_KEY;

    if (!VAST_API_KEY) {
        return { success: false, error: 'VAST_API_KEY no configurada' };
    }

    try {
        console.log('🔍 Buscando GPUs SECURE CLOUD verificadas...');

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

        // Filtrado estricto
        const suitable = offers.filter((offer: any) => {
            const gpuName = (offer.gpu_name || '').toLowerCase();
            if (!isGPUAllowed(gpuName)) return false;

            const cudaMaxGood = parseFloat(offer.cuda_max_good || '0');
            if (cudaMaxGood < 11.8) return false;

            const driverVersion = parseFloat(offer.driver_version || '0');
            if (driverVersion < 525) return false;

            if (!isSecureCloud(offer)) return false;

            if (offer.num_gpus !== 1) return false;
            if ((offer.disk_space || 0) < 30) return false;
            if ((offer.inet_down || 0) < 100) return false;
            if (offer.rentable !== true) return false;
            if ((offer.gpu_ram || 0) < 10000) return false;
            if ((offer.num_gpu_errors || 0) > 0) return false;
            if ((offer.direct_port_count || 0) < 1) return false;

            return true;
        });

        console.log(`   ✅ Ofertas Secure Cloud: ${suitable.length}`);

        // Fallback si no hay Secure Cloud
        let finalList = suitable;
        if (suitable.length === 0) {
            console.log('   ⚠️ Sin Secure Cloud, probando filtros relajados...');

            const fallback = offers.filter((offer: any) => {
                const gpuName = (offer.gpu_name || '').toLowerCase();
                if (!isGPUAllowed(gpuName)) return false;

                const cudaMaxGood = parseFloat(offer.cuda_max_good || '0');
                if (cudaMaxGood < 11.8) return false;

                const driverVersion = parseFloat(offer.driver_version || '0');
                if (driverVersion < 520) return false;

                if ((offer.reliability2 || 0) < 0.93) return false;
                if (offer.num_gpus !== 1) return false;
                if ((offer.disk_space || 0) < 25) return false;
                if (offer.rentable !== true) return false;
                if ((offer.gpu_ram || 0) < 8000) return false;

                return true;
            });

            console.log(`   ✅ Ofertas fallback: ${fallback.length}`);
            finalList = fallback;
        }

        if (finalList.length === 0) {
            return { success: false, error: 'No hay GPUs verificadas disponibles' };
        }

        // Ordenar por Secure Cloud, reliability, precio
        finalList.sort((a: any, b: any) => {
            const aSecure = isSecureCloud(a);
            const bSecure = isSecureCloud(b);
            if (aSecure && !bSecure) return -1;
            if (!aSecure && bSecure) return 1;

            const relA = a.reliability2 || 0;
            const relB = b.reliability2 || 0;
            if (relA >= 0.98 && relB < 0.98) return -1;
            if (relB >= 0.98 && relA < 0.98) return 1;

            return (a.dph_total || 999) - (b.dph_total || 999);
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

        // Intentar crear instancia
        const MAX_RETRIES = 10;

        for (let attempt = 0; attempt < Math.min(MAX_RETRIES, finalList.length); attempt++) {
            const selected = finalList[attempt];

            console.log(`\n💰 Intento #${attempt + 1}: ${selected.gpu_name} @ $${selected.dph_total?.toFixed(3)}/hr`);

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
                        return {
                            success: true,
                            instanceId: String(instanceId),
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
            }
        }

        return { success: false, error: `No se pudo crear instancia después de ${MAX_RETRIES} intentos` };

    } catch (error: any) {
        return { success: false, error: error.message };
    }
}