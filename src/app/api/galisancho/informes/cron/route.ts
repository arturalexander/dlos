/**
 * GET /api/galisancho/informes/cron
 *
 * Invocado por Vercel Cron cada día a las 07:00 UTC.
 * Lee la configuración de programación desde Firestore y,
 * si hoy toca (lunes → semanal, día 1 → mensual), genera
 * el informe y lo envía por email via Resend.
 */
import { NextRequest, NextResponse } from 'next/server';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  // Seguridad: Vercel envía Authorization: Bearer <CRON_SECRET>
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.get('authorization');
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  try {
    // Leer configuración de programación
    const scheduleSnap = await getDoc(doc(db, 'report_schedules', 'galisancho'));
    if (!scheduleSnap.exists()) {
      return NextResponse.json({ skip: true, reason: 'No hay programación configurada' });
    }

    const schedule = scheduleSnap.data();
    if (!schedule.activo || !schedule.email) {
      return NextResponse.json({ skip: true, reason: 'Programación desactivada o sin email' });
    }

    // Comprobar si hoy toca enviar
    const hoy = new Date();
    const diaSemana = hoy.getDay(); // 0=dom, 1=lun, ...
    const diaMes    = hoy.getDate();

    let toca = false;
    let desde: string;
    let hasta: string;

    if (schedule.frecuencia === 'semanal' && diaSemana === 1) {
      // Lunes → informe de la semana anterior (lun-dom)
      toca = true;
      const lunPasado = new Date(hoy);
      lunPasado.setDate(hoy.getDate() - 7);
      const domPasado = new Date(hoy);
      domPasado.setDate(hoy.getDate() - 1);
      desde = lunPasado.toISOString().split('T')[0];
      hasta = domPasado.toISOString().split('T')[0];
    } else if (schedule.frecuencia === 'mensual' && diaMes === 1) {
      // Día 1 → informe del mes anterior
      toca = true;
      const mesPasado = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1);
      const ultimoDia = new Date(hoy.getFullYear(), hoy.getMonth(), 0);
      desde = mesPasado.toISOString().split('T')[0];
      hasta = ultimoDia.toISOString().split('T')[0];
    }

    if (!toca) {
      return NextResponse.json({ skip: true, reason: `Hoy no toca (${schedule.frecuencia})` });
    }

    // Generar informe llamando al endpoint existente
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://dlosai.vercel.app';
    const datosRes = await fetch(`${baseUrl}/api/galisancho/informes/datos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ desde: desde!, hasta: hasta!, periodo: schedule.frecuencia }),
    });

    if (!datosRes.ok) {
      const err = await datosRes.json().catch(() => ({}));
      return NextResponse.json({ error: 'Error generando informe', detail: err }, { status: 500 });
    }

    const reportData = await datosRes.json();

    // Generar PDF server-side (usando jsPDF en Node)
    // Delegamos la generación al cliente: enviamos email con el resumen en HTML
    // (jsPDF en server requiere canvas, que Vercel no tiene fácilmente)
    // → Enviamos email con resumen completo en HTML bien estructurado
    const { Resend } = await import('resend');
    const resend = new Resend(process.env.RESEND_API_KEY!);

    const { stats, misiones, resumenIA, periodo, generadoEn } = reportData;

    const misionesHtml = misiones.slice(0, 20).map((m: any) => `
      <tr>
        <td style="padding:6px 8px;border-bottom:1px solid #f1f5f9;font-size:12px;color:#334155;">${m.fecha}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #f1f5f9;font-size:12px;color:#334155;font-weight:600;">${m.nombre}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #f1f5f9;font-size:12px;color:#16a34a;font-weight:700;">${m.animales}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #f1f5f9;font-size:12px;">
          <a href="${baseUrl}/mision/${m.id}" style="color:#f59e0b;font-weight:700;text-decoration:none;font-size:11px;">Ver →</a>
        </td>
      </tr>
    `).join('');

    const resumenHtml = resumenIA
      .replace(/## ([^\n]+)/g, '<h3 style="color:#f59e0b;font-size:14px;margin:16px 0 4px;font-weight:700;">$1</h3>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/^- (.+)$/gm, '<li style="margin:3px 0;color:#475569;">$1</li>')
      .replace(/\n/g, '<br>');

    const emailHtml = `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:620px;margin:0 auto;background:#fff;">
        <!-- Header -->
        <div style="background:linear-gradient(135deg,#f59e0b,#d97706);padding:28px 24px;border-radius:12px 12px 0 0;">
          <h1 style="color:white;margin:0;font-size:20px;font-weight:800;">Finca Galisancho</h1>
          <p style="color:rgba(255,255,255,0.85);margin:6px 0 0;font-size:13px;">Informe automático · ${periodo}</p>
        </div>
        <!-- Stats -->
        <div style="background:#fffbeb;padding:20px 24px;border:1px solid #fde68a;display:flex;gap:16px;flex-wrap:wrap;">
          ${[
            ['Vuelos', stats.totalMisiones],
            ['Completados', stats.completadas],
            ['Animales detectados', stats.totalAnimales],
            ['Media/vuelo', stats.mediaAnimales],
          ].map(([l, v]) => `
            <div style="text-align:center;min-width:80px;">
              <p style="font-size:22px;font-weight:900;color:#92400e;margin:0;">${v}</p>
              <p style="font-size:11px;color:#b45309;margin:2px 0 0;">${l}</p>
            </div>
          `).join('')}
        </div>
        <!-- Resumen Antonia -->
        <div style="padding:20px 24px;background:#fff;border-left:1px solid #e2e8f0;border-right:1px solid #e2e8f0;">
          <h2 style="color:#334155;font-size:15px;margin:0 0 12px;font-weight:700;">📋 Resumen de Antonia</h2>
          <div style="color:#475569;font-size:13px;line-height:1.7;">${resumenHtml}</div>
        </div>
        <!-- Tabla misiones -->
        <div style="padding:0 24px 20px;background:#fff;border:1px solid #e2e8f0;border-top:none;">
          <h2 style="color:#334155;font-size:15px;margin:0 0 12px;font-weight:700;">✈️ Misiones del período</h2>
          <table style="width:100%;border-collapse:collapse;">
            <thead>
              <tr style="background:#f59e0b;">
                <th style="padding:8px;text-align:left;color:white;font-size:11px;font-weight:700;">Fecha</th>
                <th style="padding:8px;text-align:left;color:white;font-size:11px;font-weight:700;">Misión</th>
                <th style="padding:8px;text-align:left;color:white;font-size:11px;font-weight:700;">Animales</th>
                <th style="padding:8px;text-align:left;color:white;font-size:11px;font-weight:700;">Link</th>
              </tr>
            </thead>
            <tbody>${misionesHtml}</tbody>
          </table>
        </div>
        <!-- Footer -->
        <div style="padding:16px 24px;background:#f8fafc;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;">
          <p style="color:#94a3b8;font-size:11px;margin:0;">
            Generado automáticamente el ${generadoEn} ·
            <a href="${baseUrl}/galisancho/informes" style="color:#f59e0b;">Ver todos los informes</a>
          </p>
        </div>
      </div>
    `;

    const { error } = await resend.emails.send({
      from: 'Antonia · Finca Galisancho <onboarding@resend.dev>',
      to: [schedule.email],
      subject: `Informe ${schedule.frecuencia === 'semanal' ? 'semanal' : 'mensual'} — ${periodo}`,
      html: emailHtml,
    });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, enviado: schedule.email, periodo });

  } catch (e: any) {
    console.error('[CRON] Error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
