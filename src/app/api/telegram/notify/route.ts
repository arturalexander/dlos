// src/app/api/telegram/notify/route.ts
import { NextRequest, NextResponse } from 'next/server';

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8219163327:AAF_FGgEIyGFSCN7kNFuKF5NgA3AY7W0OyM';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID; // ID del chat donde enviar

interface NotifyPayload {
    jobId: string;
    missionName: string;
    siteName: string;
    totalCows: number;
    processingTimeSeconds?: number;
    status: 'completed' | 'failed';
    error?: string;
    chatId?: string; // Opcional, si quieres enviar a un chat específico
}

export async function POST(request: NextRequest) {
    try {
        const payload: NotifyPayload = await request.json();

        if (!payload.jobId) {
            return NextResponse.json(
                { status: 'error', message: 'Missing jobId' },
                { status: 400 }
            );
        }

        const chatId = payload.chatId || TELEGRAM_CHAT_ID;

        if (!chatId) {
            console.warn('⚠️ No Telegram chat ID configured');
            return NextResponse.json(
                { status: 'warning', message: 'No chat ID configured' },
                { status: 200 }
            );
        }

        const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://dlosai.vercel.app';
        const missionUrl = `${appUrl}/mision/${payload.jobId}`;

        let message: string;

        if (payload.status === 'completed') {
            const duration = payload.processingTimeSeconds
                ? `${(payload.processingTimeSeconds / 60).toFixed(1)} minutos`
                : 'N/A';

            message = `
🐄 *DLOS AI \\- Procesamiento Completado*

✅ *Estado:* Proceso finalizado con éxito

📍 *Misión:* ${escapeMarkdownV2(payload.missionName.replace('dlos_', ''))}
📌 *Sitio:* ${escapeMarkdownV2(payload.siteName)}

🔢 *Resultado:*
• Vacas detectadas: *${payload.totalCows}*
• Tiempo de proceso: ${escapeMarkdownV2(duration)}

🔗 [Ver análisis completo y mapa interactivo](${escapeMarkdownV2(missionUrl)})

_ID: ${escapeMarkdownV2(payload.jobId)}_
            `.trim();
        } else {
            message = `
🐄 *DLOS AI \\- Error en Procesamiento*

❌ *Estado:* El procesamiento ha fallado

📍 *Misión:* ${escapeMarkdownV2(payload.missionName.replace('dlos_', ''))}
📌 *Sitio:* ${escapeMarkdownV2(payload.siteName)}

⚠️ *Error:* ${escapeMarkdownV2(payload.error || 'Error desconocido')}

🔗 [Ver detalles](${escapeMarkdownV2(missionUrl)})

_ID: ${escapeMarkdownV2(payload.jobId)}_
            `.trim();
        }

        // Enviar mensaje a Telegram
        const telegramResponse = await fetch(
            `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    chat_id: chatId,
                    text: message,
                    parse_mode: 'MarkdownV2',
                    disable_web_page_preview: false,
                }),
            }
        );

        const telegramResult = await telegramResponse.json();

        if (!telegramResult.ok) {
            console.error('❌ Telegram API error:', telegramResult);
            return NextResponse.json(
                { status: 'error', message: telegramResult.description },
                { status: 500 }
            );
        }

        console.log(`✅ Telegram notification sent for job ${payload.jobId}`);

        return NextResponse.json({
            status: 'success',
            message: 'Notification sent',
            messageId: telegramResult.result.message_id,
        });

    } catch (error) {
        console.error('❌ Error sending Telegram notification:', error);
        return NextResponse.json(
            { status: 'error', message: 'Internal server error' },
            { status: 500 }
        );
    }
}

// Escapar caracteres especiales de MarkdownV2
function escapeMarkdownV2(text: string): string {
    return text
        .replace(/\\/g, '\\\\')
        .replace(/_/g, '\\_')
        .replace(/\*/g, '\\*')
        .replace(/\[/g, '\\[')
        .replace(/\]/g, '\\]')
        .replace(/\(/g, '\\(')
        .replace(/\)/g, '\\)')
        .replace(/~/g, '\\~')
        .replace(/`/g, '\\`')
        .replace(/>/g, '\\>')
        .replace(/#/g, '\\#')
        .replace(/\+/g, '\\+')
        .replace(/\-/g, '\\-')
        .replace(/=/g, '\\=')
        .replace(/\|/g, '\\|')
        .replace(/\{/g, '\\{')
        .replace(/\}/g, '\\}')
        .replace(/\./g, '\\.')
        .replace(/!/g, '\\!');
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';