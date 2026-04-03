import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { db } from '@/lib/firebase';
import { doc, setDoc, getDoc, getDocs, collection, query, where, orderBy, limit, serverTimestamp } from 'firebase/firestore';
import { MASTER_PROMPT } from '@/lib/agent-prompt';
import type { AgentAnalysis } from '@/lib/agent-types';

// Simple in-memory rate limiter: track last analysis time
let lastAnalysisTime = 0;
const MIN_INTERVAL_MS = 5000; // 5 seconds between analyses

export async function POST(request: NextRequest) {
    try {
        // 1. Validate API key
        const apiKey = request.headers.get('X-API-Key');
        const expectedApiKey = process.env.CALLBACK_API_KEY;

        if (expectedApiKey && apiKey !== expectedApiKey) {
            return NextResponse.json(
                { status: 'error', message: 'Unauthorized' },
                { status: 401 }
            );
        }

        // 2. Parse request
        const { jobId } = await request.json();

        if (!jobId) {
            return NextResponse.json(
                { status: 'error', message: 'Missing jobId' },
                { status: 400 }
            );
        }

        // 3. Rate limiting
        const now = Date.now();
        if (now - lastAnalysisTime < MIN_INTERVAL_MS) {
            const waitMs = MIN_INTERVAL_MS - (now - lastAnalysisTime);
            await new Promise(resolve => setTimeout(resolve, waitMs));
        }
        lastAnalysisTime = Date.now();

        // 4. Check Gemini API key
        const geminiApiKey = process.env.GEMINI_API_KEY;
        if (!geminiApiKey) {
            console.error('❌ GEMINI_API_KEY not configured');
            return NextResponse.json(
                { status: 'error', message: 'Gemini API key not configured' },
                { status: 500 }
            );
        }

        // 5. Fetch job data from Firestore
        const jobRef = doc(db, 'processing_jobs', jobId);
        const jobDoc = await getDoc(jobRef);

        if (!jobDoc.exists()) {
            return NextResponse.json(
                { status: 'error', message: 'Job not found' },
                { status: 404 }
            );
        }

        const jobData = jobDoc.data();

        if (jobData.status !== 'completed' || !jobData.results) {
            return NextResponse.json(
                { status: 'error', message: 'Job not completed or has no results' },
                { status: 400 }
            );
        }

        // 6. Check if analysis already exists
        const analysisRef = doc(db, 'agent_analyses', jobId);
        const existingAnalysis = await getDoc(analysisRef);
        if (existingAnalysis.exists() && existingAnalysis.data().status === 'completed') {
            return NextResponse.json({
                status: 'success',
                message: 'Analysis already exists',
                analysisId: jobId,
                analysis: existingAnalysis.data().analysis
            });
        }

        // 7. Fetch client config from Firestore
        const organizationId = jobData.organizationId;
        let clientData: { farmName: string; siteName: string; detectionTypes: string[]; zones: any[] } = {
            farmName: jobData.siteName || 'Sin nombre',
            siteName: jobData.siteName || 'Sin sitio',
            detectionTypes: ['vacas'],
            zones: []
        };

        if (organizationId) {
            const clientsSnap = await getDocs(
                query(collection(db, 'clients'), where('clientId', '==', organizationId))
            );
            if (!clientsSnap.empty) {
                const client = clientsSnap.docs[0].data();
                clientData = {
                    farmName: client.farmName || clientData.farmName,
                    siteName: client.siteName || clientData.siteName,
                    detectionTypes: client.detectionTypes || clientData.detectionTypes,
                    zones: client.zones || []
                };
            }
        }

        // 8. Fetch historical missions for trend comparison
        const historialMisiones: { fecha: string; totalDetections: number }[] = [];
        try {
            const historyQuery = query(
                collection(db, 'processing_jobs'),
                where('status', '==', 'completed'),
                where('organizationId', '==', organizationId || ''),
                orderBy('completedAt', 'desc'),
                limit(4) // current + 3 previous
            );
            const historySnap = await getDocs(historyQuery);
            historySnap.docs.forEach(d => {
                const data = d.data();
                if (d.id !== jobId && historialMisiones.length < 3) {
                    historialMisiones.push({
                        fecha: data.completedAt?.toDate?.()?.toISOString?.()?.split('T')[0] || 'N/A',
                        totalDetections: data.results?.totalCows || data.results?.totalDetections || 0
                    });
                }
            });
        } catch (err) {
            console.warn('⚠️ Could not fetch history:', err);
        }

        // 9. Mark as analyzing
        await setDoc(analysisRef, {
            jobId,
            organizationId: organizationId || null,
            missionName: jobData.missionName || 'Sin nombre',
            siteName: jobData.siteName || 'Sin sitio',
            status: 'analyzing',
            analysis: null,
            createdAt: serverTimestamp(),
            completedAt: null,
            error: null,
            rawResponse: null,
            model: 'gemini-2.0-flash'
        });

        // Update job with analysis status
        await setDoc(jobRef, { analysisStatus: 'analyzing', updatedAt: serverTimestamp() }, { merge: true });

        // 10. Build the prompt with flight data
        const flightDataPayload = {
            cliente: {
                farmName: clientData.farmName,
                siteName: clientData.siteName,
                detectionTypes: clientData.detectionTypes,
                zones: clientData.zones
            },
            vuelo: {
                missionName: jobData.missionName,
                flightInfo: jobData.results?.flightInfo,
                processingTimeSeconds: jobData.processingTimeSeconds,
                timestamp: jobData.completedAt?.toDate?.()?.toISOString?.() || null
            },
            resultados: {
                totalDetections: jobData.results?.totalCows || jobData.results?.totalDetections || 0,
                detections: jobData.results?.cows || jobData.results?.detections || [],
                summary: jobData.results?.summary || null,
                captures: jobData.results?.captures ? Object.keys(jobData.results.captures) : [],
                thermalResults: jobData.results?.thermalResults || null
            },
            historial: {
                misionesAnteriores: historialMisiones
            }
        };

        const fullPrompt = `${MASTER_PROMPT}

DATOS DEL VUELO A ANALIZAR:
${JSON.stringify(flightDataPayload, null, 2)}`;

        // 11. Call Gemini
        console.log(`\n🤖 ANÁLISIS IA INICIADO`);
        console.log(`   Job: ${jobId}`);
        console.log(`   Misión: ${jobData.missionName}`);
        console.log(`   Detecciones: ${flightDataPayload.resultados.totalDetections}`);

        const genAI = new GoogleGenerativeAI(geminiApiKey);
        const model = genAI.getGenerativeModel({
            model: 'gemini-2.0-flash',
            generationConfig: {
                responseMimeType: 'application/json',
            }
        });

        const result = await model.generateContent(fullPrompt);
        const responseText = result.response.text();

        // 12. Parse response with error handling
        let analysis: AgentAnalysis;
        try {
            analysis = JSON.parse(responseText);
        } catch (parseError) {
            console.error('❌ Gemini returned malformed JSON:', parseError);
            console.error('   Raw response (first 500 chars):', responseText.substring(0, 500));

            // Save failed analysis with raw response for debugging
            await setDoc(analysisRef, {
                status: 'failed',
                error: `JSON parse error: ${parseError instanceof Error ? parseError.message : 'Unknown parse error'}`,
                rawResponse: responseText.substring(0, 5000),
                completedAt: serverTimestamp()
            }, { merge: true });

            await setDoc(jobRef, { analysisStatus: 'failed', updatedAt: serverTimestamp() }, { merge: true });

            return NextResponse.json(
                { status: 'error', message: 'Gemini returned malformed JSON', rawPreview: responseText.substring(0, 200) },
                { status: 502 }
            );
        }

        // 13. Save completed analysis
        await setDoc(analysisRef, {
            status: 'completed',
            analysis,
            completedAt: serverTimestamp(),
            rawResponse: null,
            error: null
        }, { merge: true });

        await setDoc(jobRef, { analysisStatus: 'completed', updatedAt: serverTimestamp() }, { merge: true });

        console.log(`✅ ANÁLISIS IA COMPLETADO`);
        console.log(`   Índice general: ${analysis.indice_general}`);
        console.log(`   Agentes: ${analysis.agentes_activados?.join(', ')}`);
        console.log(`   Alertas: ${analysis.alertas?.length || 0}`);
        console.log(`   Tareas: ${analysis.tareas?.length || 0}`);

        return NextResponse.json({
            status: 'success',
            analysisId: jobId,
            indice_general: analysis.indice_general,
            agentes: analysis.agentes_activados,
            alertas: analysis.alertas?.length || 0,
            tareas: analysis.tareas?.length || 0
        });

    } catch (error) {
        console.error('❌ Error en análisis IA:', error);

        // Try to update status if we have the jobId
        try {
            const { jobId } = await request.clone().json().catch(() => ({ jobId: null }));
            if (jobId) {
                const analysisRef = doc(db, 'agent_analyses', jobId);
                await setDoc(analysisRef, {
                    status: 'failed',
                    error: error instanceof Error ? error.message : 'Unknown error',
                    completedAt: serverTimestamp()
                }, { merge: true });

                const jobRef = doc(db, 'processing_jobs', jobId);
                await setDoc(jobRef, { analysisStatus: 'failed', updatedAt: serverTimestamp() }, { merge: true });
            }
        } catch { /* ignore cleanup errors */ }

        return NextResponse.json(
            { status: 'error', message: 'Internal server error' },
            { status: 500 }
        );
    }
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
