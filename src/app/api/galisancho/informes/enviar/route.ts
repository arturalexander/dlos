import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';

export async function POST(req: NextRequest) {
  const { email, pdfBase64, periodo, generadoEn } = await req.json().catch(() => ({}));

  if (!email || !pdfBase64) {
    return NextResponse.json({ error: 'Faltan datos' }, { status: 400 });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'RESEND_API_KEY no configurada. Añádela en .env.local' }, { status: 500 });
  }

  const resend = new Resend(apiKey);

  try {
    const { data, error } = await resend.emails.send({
      from: 'Finca Galisancho <onboarding@resend.dev>',
      to: [email],
      subject: `Informe de gestión — ${periodo}`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff;">
          <div style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); padding: 32px 24px; border-radius: 12px 12px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 22px; font-weight: 800;">Finca Galisancho</h1>
            <p style="color: rgba(255,255,255,0.85); margin: 6px 0 0; font-size: 14px;">Informe de gestión · ${periodo}</p>
          </div>
          <div style="padding: 28px 24px; background: #f8fafc; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px;">
            <p style="color: #334155; font-size: 15px; line-height: 1.6; margin: 0 0 16px;">
              Se adjunta el informe de gestión generado por <strong>Antonia</strong>, la encargada virtual de Finca Galisancho, correspondiente al período <strong>${periodo}</strong>.
            </p>
            <p style="color: #64748b; font-size: 13px; margin: 0 0 8px;">El informe incluye:</p>
            <ul style="color: #64748b; font-size: 13px; line-height: 1.8; margin: 0 0 20px; padding-left: 20px;">
              <li>Resumen ejecutivo del período</li>
              <li>Estadísticas de vuelos y detecciones</li>
              <li>Tabla completa de misiones</li>
              <li>Zonas marcadas en el mapa</li>
              <li>Recomendaciones de Antonia</li>
            </ul>
            <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
            <p style="color: #94a3b8; font-size: 12px; margin: 0;">
              Generado el ${generadoEn} · <a href="https://dlosai.vercel.app/galisancho" style="color: #f59e0b;">dlos.ai</a>
            </p>
          </div>
        </div>
      `,
      attachments: [
        {
          filename: `informe-galisancho-${periodo.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()}.pdf`,
          content: pdfBase64,
        },
      ],
    });

    if (error) {
      console.error('[EMAIL] Resend error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, id: data?.id });

  } catch (e: any) {
    console.error('[EMAIL] Error:', e);
    return NextResponse.json({ error: e.message ?? 'Error enviando email' }, { status: 500 });
  }
}
