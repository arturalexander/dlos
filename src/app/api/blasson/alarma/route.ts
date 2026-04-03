// API de alarmas Blasson — Multi-canal Telegram con enrutamiento por tipo y severidad
//
// Variables de entorno soportadas:
//   TELEGRAM_BOT_TOKEN          → token del bot (requerido)
//   TELEGRAM_CHAT_ID            → canal general / fallback (requerido)
//   TELEGRAM_CHAT_FUEGO         → canal específico de incendios
//   TELEGRAM_CHAT_SEGURIDAD     → canal de seguridad (intrusión, vehículos, drones)
//   TELEGRAM_CHAT_PILOTOS       → canal de pilotos
//   TELEGRAM_CHAT_ADMIN         → escalado: recibe TODAS las alarmas de severidad ALTA
//
// Flujo de enrutamiento:
//   1. Se determina el canal por tipo de alarma
//   2. Si severidad=alta → también se envía al canal ADMIN (si está configurado)
//   3. Si el canal específico no está configurado → se usa TELEGRAM_CHAT_ID como fallback
//   4. Se deduplicarán canales repetidos (no se envía dos veces al mismo chat)

import { NextRequest, NextResponse } from 'next/server';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8219163327:AAF_FGgEIyGFSCN7kNFuKF5NgA3AY7W0OyM';

export type AlarmType = 'fuego' | 'intrusion' | 'vehiculo' | 'dron' | 'piloto' | 'manual';
export type AlarmSeverity = 'alta' | 'media' | 'baja';

interface AlarmaPayload {
  tipo: AlarmType;
  severidad: AlarmSeverity;
  fuente: string;
  mensaje: string;
  ubicacion?: string;
  coordenadas?: { lat: number; lng: number };
  confianza?: number;
  chatId?: string;   // override: fuerza un chat específico (ignora enrutamiento)
  broadcast?: boolean; // envía a TODOS los canales configurados
}

interface SendResult {
  channel: string;
  chatId: string;
  success: boolean;
  messageId?: number;
  error?: string;
}

// ── Configuración de canales ────────────────────────────────────────────────

function getConfiguredChannels(): Record<string, string | undefined> {
  return {
    general:   process.env.TELEGRAM_CHAT_ID,
    fuego:     process.env.TELEGRAM_CHAT_FUEGO,
    seguridad: process.env.TELEGRAM_CHAT_SEGURIDAD,
    pilotos:   process.env.TELEGRAM_CHAT_PILOTOS,
    admin:     process.env.TELEGRAM_CHAT_ADMIN,
  };
}

function resolveTargetChannels(tipo: AlarmType, severidad: AlarmSeverity, override?: string): string[] {
  if (override) return [override];

  const ch = getConfiguredChannels();
  const fallback = ch.general;
  const ids: string[] = [];

  // Enrutamiento por tipo
  const typeRoutes: Record<AlarmType, string | undefined> = {
    fuego:     ch.fuego     || fallback,
    intrusion: ch.seguridad || fallback,
    vehiculo:  ch.seguridad || fallback,
    dron:      ch.seguridad || fallback,
    piloto:    ch.pilotos   || fallback,
    manual:    fallback,
  };

  const primary = typeRoutes[tipo];
  if (primary) ids.push(primary);

  // Escalado: severidad alta → también al canal admin
  if (severidad === 'alta' && ch.admin && !ids.includes(ch.admin)) {
    ids.push(ch.admin);
  }

  return [...new Set(ids.filter(Boolean))];
}

// ── Formato del mensaje ─────────────────────────────────────────────────────

const TIPO_ICONS: Record<AlarmType, string> = {
  fuego:     '🔥',
  intrusion: '🚨',
  vehiculo:  '🚗',
  dron:      '🚁',
  piloto:    '✈️',
  manual:    '⚠️',
};

const TIPO_LABELS: Record<AlarmType, string> = {
  fuego:     'INCENDIO DETECTADO',
  intrusion: 'INTRUSIÓN DETECTADA',
  vehiculo:  'VEHÍCULO NO AUTORIZADO',
  dron:      'DRON NO AUTORIZADO',
  piloto:    'EVENTO DE PILOTO',
  manual:    'ALARMA MANUAL',
};

const SEV_LABELS: Record<AlarmSeverity, string> = {
  alta:  '🔴 ALTA — ACCIÓN INMEDIATA',
  media: '🟡 MEDIA — MONITORIZAR',
  baja:  '🟢 BAJA — INFORMATIVA',
};

function buildMessage(payload: AlarmaPayload): string {
  const icon = TIPO_ICONS[payload.tipo] || '⚠️';
  const ts = new Date().toLocaleString('es-ES', {
    timeZone: 'Europe/Madrid',
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });

  const lines: string[] = [
    `${icon} *BLASSON \\- ${esc(TIPO_LABELS[payload.tipo])}*`,
    ``,
    `🔴 *Severidad:* ${esc(SEV_LABELS[payload.severidad])}`,
    `📡 *Fuente:* ${esc(payload.fuente)}`,
  ];

  if (payload.ubicacion) lines.push(`📍 *Ubicación:* ${esc(payload.ubicacion)}`);
  if (payload.coordenadas) {
    const { lat, lng } = payload.coordenadas;
    lines.push(`🗺️ *Coord:* ${esc(`${lat.toFixed(5)}, ${lng.toFixed(5)}`)}`);
  }
  if (payload.confianza !== undefined) {
    lines.push(`🎯 *Confianza IA:* ${esc(`${payload.confianza}%`)}`);
  }

  lines.push(``, `📝 *Detalle:*`);
  lines.push(esc(payload.mensaje));
  lines.push(``, `⏰ _${esc(ts)}_`);
  lines.push(`_Sistema BLASSON · dlos\\.ai_`);

  return lines.join('\n');
}

// ── Envío a Telegram ────────────────────────────────────────────────────────

async function sendToChat(chatId: string, text: string, channelName: string): Promise<SendResult> {
  try {
    const res = await fetch(
      `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'MarkdownV2', disable_web_page_preview: true }),
      }
    );
    const data = await res.json();
    if (data.ok) {
      return { channel: channelName, chatId, success: true, messageId: data.result.message_id };
    }
    return { channel: channelName, chatId, success: false, error: data.description };
  } catch (err) {
    return { channel: channelName, chatId, success: false, error: String(err) };
  }
}

// ── Handler ─────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const payload: AlarmaPayload = await request.json();

    if (!payload.tipo || !payload.fuente || !payload.mensaje) {
      return NextResponse.json({ status: 'error', message: 'Required: tipo, fuente, mensaje' }, { status: 400 });
    }

    const channels = getConfiguredChannels();
    const fallback = channels.general;

    if (!fallback) {
      console.warn('⚠️ No Telegram chat ID configured');
      return NextResponse.json({ status: 'warning', message: 'No TELEGRAM_CHAT_ID configured' });
    }

    const targets: string[] = payload.broadcast
      ? [...new Set(Object.values(channels).filter(Boolean) as string[])]
      : resolveTargetChannels(payload.tipo, payload.severidad, payload.chatId);

    if (targets.length === 0) {
      return NextResponse.json({ status: 'warning', message: 'No target channels resolved' });
    }

    const text = buildMessage(payload);
    const channelEntries = Object.entries(channels);

    // Send to all targets in parallel
    const results = await Promise.all(
      targets.map(chatId => {
        const name = channelEntries.find(([, v]) => v === chatId)?.[0] || 'general';
        return sendToChat(chatId, text, name);
      })
    );

    const anySuccess = results.some(r => r.success);
    const failures = results.filter(r => !r.success);

    if (failures.length > 0) {
      console.warn('Telegram partial failure:', failures);
    }

    console.log(`📣 Blasson alarm [${payload.tipo}/${payload.severidad}] → ${results.map(r => `${r.channel}:${r.success ? '✅' : '❌'}`).join(', ')}`);

    return NextResponse.json({
      status: anySuccess ? 'success' : 'error',
      channelsSent: results.filter(r => r.success).length,
      channelsTotal: results.length,
      results,
    });
  } catch (err) {
    console.error('Blasson alarm error:', err);
    return NextResponse.json({ status: 'error', message: 'Internal server error' }, { status: 500 });
  }
}

// GET para que el UI pueda consultar qué canales están configurados (sin exponer tokens)
export async function GET() {
  const ch = getConfiguredChannels();
  return NextResponse.json({
    channels: Object.fromEntries(
      Object.entries(ch).map(([k, v]) => [k, { configured: !!v }])
    ),
  });
}

function esc(t: string): string {
  return t
    .replace(/\\/g, '\\\\').replace(/_/g, '\\_').replace(/\*/g, '\\*')
    .replace(/\[/g, '\\[').replace(/\]/g, '\\]').replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)').replace(/~/g, '\\~').replace(/`/g, '\\`')
    .replace(/>/g, '\\>').replace(/#/g, '\\#').replace(/\+/g, '\\+')
    .replace(/\-/g, '\\-').replace(/=/g, '\\=').replace(/\|/g, '\\|')
    .replace(/\{/g, '\\{').replace(/\}/g, '\\}').replace(/\./g, '\\.')
    .replace(/!/g, '\\!');
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
