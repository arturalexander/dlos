// src/app/api/webhook/flytbase/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { collection, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { enqueueGPUJob } from '@/lib/gpu-queue';

// Tipos del webhook
interface WebhookEvent {
    event_type: 'media.upload_completed';
    event_id: string;
    timestamp: string;
    organization_id: string;
    data: MediaUploadData;
}

interface MediaUploadData {
    flight_id: string;
    flight_type: 'mission' | 'manual';
    total_media_files: number;
    total_uploaded: number;
    media_files: MediaFile[];
    flight_details: {
        flight_time: number;
        total_distance: number;
    };
    mission_details?: {
        mission_id: string;
        task_id?: string;
        mission_name: string;
        mission_type: 'path' | 'grid';
        mission_status: 'complete' | 'incomplete' | 'failed' | 'unknown';
    };
    site_details: {
        site_id: string;
        site_name: string;
    };
}

interface MediaFile {
    media_id: string;
    file_name: string;
    file_type: string;
    file_extension: string;
    file_size: number;
    timestamp: string;
    location: {
        latitude: number;
        longitude: number;
    };
    signed_url: string;
    expires_at: string;
}

// Set para idempotencia
const processedEvents = new Set<string>();

export async function POST(request: NextRequest) {
    try {
        // 1. VALIDAR API KEY
        const apiKey = request.headers.get('X-API-Key');
        const expectedApiKey = process.env.FLYTBASE_API_KEY;

        if (!apiKey || apiKey !== expectedApiKey) {
            console.error('❌ Invalid API key');
            return NextResponse.json(
                {
                    status: 'error',
                    message: 'Unauthorized: Invalid API key',
                    error_code: 'INVALID_API_KEY'
                },
                { status: 401 }
            );
        }

        // 2. PARSEAR PAYLOAD
        const event: WebhookEvent = await request.json();

        // 3. VALIDAR ESTRUCTURA
        if (!event.event_type || !event.event_id || !event.data) {
            return NextResponse.json(
                {
                    status: 'error',
                    message: 'Invalid event structure',
                    error_code: 'VALIDATION_ERROR'
                },
                { status: 400 }
            );
        }

        // 4. IDEMPOTENCIA
        if (processedEvents.has(event.event_id)) {
            console.log(`ℹ️ Event ${event.event_id} already processed (duplicate)`);
            return NextResponse.json({
                status: 'success',
                message: 'Webhook received successfully',
                event_id: event.event_id
            });
        }

        console.log(`\n${'='.repeat(60)}`);
        console.log(`📡 NUEVO WEBHOOK RECIBIDO`);
        console.log(`${'='.repeat(60)}`);
        console.log(`Event ID: ${event.event_id}`);
        console.log(`Flight ID: ${event.data.flight_id}`);
        console.log(`Type: ${event.data.flight_type}`);
        console.log(`Media files: ${event.data.total_media_files}`);

        // 5. PROCESAR EVENTO
        if (event.event_type === 'media.upload_completed') {
            await handleMediaUploadCompleted(event);
        }

        // 6. MARCAR COMO PROCESADO
        processedEvents.add(event.event_id);
        if (processedEvents.size > 1000) {
            const firstItem = processedEvents.values().next().value;
            if (firstItem) {
                processedEvents.delete(firstItem);
            }
        }

        console.log(`✅ Webhook procesado exitosamente\n`);

        // 7. RESPUESTA A FLYTBASE
        return NextResponse.json({
            status: 'success',
            message: 'Webhook received successfully',
            event_id: event.event_id
        });

    } catch (error) {
        console.error('❌ Webhook processing error:', error);
        return NextResponse.json(
            {
                status: 'error',
                message: 'Internal server error',
                error_code: 'INTERNAL_ERROR'
            },
            { status: 500 }
        );
    }
}

/**
 * Maneja el evento de media upload completado
 */
async function handleMediaUploadCompleted(event: WebhookEvent) {
    const { data } = event;

    try {
        console.log(`\n🔄 Procesando media_upload_completed...`);

        // 1. BUSCAR VIDEO MP4 EN LOS ARCHIVOS
        const videoFile = data.media_files.find(
            file => file.file_type === 'video/mp4' || file.file_extension === 'mp4'
        );

        if (!videoFile) {
            console.log(`⚠️ No se encontró archivo de video MP4. Guardando solo metadata.`);
        } else {
            console.log(`🎬 Video encontrado: ${videoFile.file_name}`);
            console.log(`   Tamaño: ${videoFile.file_size ? (videoFile.file_size / 1024 / 1024).toFixed(2) + ' MB' : 'Desconocido'}`);
            console.log(`   URL expira: ${videoFile.expires_at}`);
        }

        // 2. GUARDAR VUELO EN FIRESTORE
        const flightRef = doc(db, 'flights', data.flight_id);
        await setDoc(flightRef, {
            flightId: data.flight_id,
            flightType: data.flight_type,
            totalMediaFiles: data.total_media_files,
            totalUploaded: data.total_uploaded,
            flightTime: data.flight_details?.flight_time || 0,
            totalDistance: data.flight_details?.total_distance || 0,
            siteId: data.site_details.site_id,
            siteName: data.site_details.site_name,
            organizationId: event.organization_id,
            timestamp: event.timestamp,
            eventId: event.event_id,

            // Estado de procesamiento
            processingStatus: videoFile ? 'pending' : 'no_video',
            jobId: null,

            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        }, { merge: true });

        console.log(`✅ Vuelo guardado en Firestore`);

        // 3. SI ES MISIÓN, GUARDAR DETALLES
        if (data.mission_details && data.flight_type === 'mission') {
            const missionRef = doc(db, 'missions', data.mission_details.mission_id);
            await setDoc(missionRef, {
                missionId: data.mission_details.mission_id,
                ...(data.mission_details.task_id && { taskId: data.mission_details.task_id }),
                missionName: data.mission_details.mission_name || 'Sin nombre',
                missionType: data.mission_details.mission_type || 'unknown',
                missionStatus: data.mission_details.mission_status || 'unknown',
                siteId: data.site_details.site_id,
                siteName: data.site_details.site_name,
                organizationId: event.organization_id,
                lastFlightId: data.flight_id,
                lastFlightTimestamp: event.timestamp,
                updatedAt: serverTimestamp()
            }, { merge: true });

            console.log(`✅ Misión guardada en Firestore`);
        }

        // 4. GUARDAR METADATA DE TODOS LOS ARCHIVOS
        for (const mediaFile of data.media_files) {
            const mediaRef = doc(db, 'media', mediaFile.media_id);
            await setDoc(mediaRef, {
                mediaId: mediaFile.media_id,
                flightId: data.flight_id,
                fileName: mediaFile.file_name,
                fileType: mediaFile.file_type,
                fileExtension: mediaFile.file_extension,
                fileSize: mediaFile.file_size || 0,
                timestamp: mediaFile.timestamp,
                latitude: mediaFile.location.latitude,
                longitude: mediaFile.location.longitude,
                signedUrl: mediaFile.signed_url,
                expiresAt: mediaFile.expires_at,
                organizationId: event.organization_id,
                siteId: data.site_details.site_id,
                ...(data.mission_details && {
                    missionId: data.mission_details.mission_id || null,
                }),
                createdAt: serverTimestamp()
            });
        }

        console.log(`✅ ${data.media_files.length} archivos multimedia guardados`);

        // 5. FILTRAR Y PROCESAR
        const shouldProcess = videoFile &&
            data.mission_details?.mission_name?.toLowerCase().startsWith('dlos_');

        if (shouldProcess && videoFile) {
            console.log(`✅ Misión "${data.mission_details?.mission_name}" será procesada`);

            // Preparar telemetry files (archivos SRT)
            const telemetryFiles = data.media_files
                .filter(f => f.file_extension === 'srt' || f.file_name.toLowerCase().includes('.srt'))
                .map(f => ({
                    file_name: f.file_name,
                    signed_url: f.signed_url,
                    expires_at: f.expires_at
                }));

            const jobId = await enqueueGPUJob({
                flightId: data.flight_id,
                missionId: data.mission_details?.mission_id,
                missionName: data.mission_details?.mission_name || 'Manual Flight',
                videoUrl: videoFile.signed_url,
                videoExpiresAt: videoFile.expires_at,
                videoFileName: videoFile.file_name,
                // Si file_size es 0 o undefined, pasamos 0 - el worker lo manejará
                videoFileSize: videoFile.file_size || 0,
                siteId: data.site_details.site_id,
                siteName: data.site_details.site_name,
                organizationId: event.organization_id,
                telemetryFiles: telemetryFiles
            });

            await setDoc(flightRef, {
                jobId: jobId,
                processingStatus: 'queued',
                updatedAt: serverTimestamp()
            }, { merge: true });

            console.log(`✅ Job encolado: ${jobId}`);

        } else if (videoFile && data.mission_details?.mission_name) {
            console.log(`⏭️ Misión "${data.mission_details.mission_name}" ignorada (no empieza con dlos_)`);

            await setDoc(flightRef, {
                processingStatus: 'skipped',
                processingNote: 'Mission name does not start with "dlos_"',
                updatedAt: serverTimestamp()
            }, { merge: true });

        } else if (videoFile) {
            console.log(`⚠️ Video sin nombre de misión - ignorado`);
        }

        console.log(`\n✨ Procesamiento completado`);

    } catch (error) {
        console.error('❌ Error:', error);
        throw error;
    }
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';