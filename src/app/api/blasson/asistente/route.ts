// POST /api/blasson/asistente
// Asistente IA para el dashboard del cliente (propietario de la finca)
// Usa Gemini con contexto de estado actual — respuestas simples, no técnicas

import { GoogleGenerativeAI } from '@google/generative-ai';
import { NextRequest, NextResponse } from 'next/server';

const GEMINI_KEY =
  process.env.GEMINI_API_KEY ||
  process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
  process.env.GOOGLE_AI_API_KEY;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { pregunta, contexto } = body as {
      pregunta: string;
      contexto: {
        alertCount: number;
        temp: number;
        humidity: number;
        wind: number;
        fireRisk: string;
        camerasOk: number;
        camerasTotal: number;
        lastDrone: string;
        date: string;
      };
    };

    if (!pregunta?.trim()) {
      return NextResponse.json({ respuesta: 'Por favor escribe una pregunta.' });
    }

    // Si no hay API key, devuelve respuesta simulada para demo
    if (!GEMINI_KEY) {
      const demo = getDemoAnswer(pregunta, contexto);
      return NextResponse.json({ respuesta: demo, demo: true });
    }

    const genAI = new GoogleGenerativeAI(GEMINI_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

    const systemPrompt = `Eres el asistente de seguridad personal de una finca en Cáceres, España.
Fecha y hora: ${contexto.date}.

ESTADO ACTUAL DE LA FINCA:
- Alertas activas: ${contexto.alertCount === 0 ? 'Ninguna, todo tranquilo' : `${contexto.alertCount} alerta(s) activa(s)`}
- Temperatura exterior: ${contexto.temp}°C | Humedad: ${contexto.humidity}% | Viento: ${contexto.wind} km/h
- Riesgo de incendio: ${contexto.fireRisk}
- Cámaras de vigilancia: ${contexto.camerasOk} de ${contexto.camerasTotal} operativas
- Última ronda de dron: ${contexto.lastDrone}

REGLAS IMPORTANTES:
- Responde SIEMPRE en español
- Máximo 2-3 frases cortas y claras
- Usa lenguaje de una persona normal, NO técnico
- Sé tranquilizador cuando todo va bien, directo cuando hay problemas
- Nunca menciones: YOLO, GPU, API, Firebase, tokens, ni términos técnicos
- Actúa como si fueras el guarda de seguridad de confianza del propietario`;

    const result = await model.generateContent(
      `${systemPrompt}\n\nEl propietario pregunta: "${pregunta}"`
    );

    return NextResponse.json({ respuesta: result.response.text().trim() });
  } catch (error) {
    console.error('[Asistente] Error:', error);
    return NextResponse.json({
      respuesta: 'No puedo conectar con el asistente ahora mismo. Inténtalo en un momento.',
    });
  }
}

// Respuestas demo cuando no hay API key configurada
function getDemoAnswer(pregunta: string, ctx: any): string {
  const q = pregunta.toLowerCase();
  if (q.includes('bien') || q.includes('normal') || q.includes('todo')) {
    return ctx.alertCount === 0
      ? `Sí, todo está en orden. Las cámaras funcionan correctamente y no hay ninguna incidencia registrada hoy. Puedes estar tranquilo.`
      : `Hay ${ctx.alertCount} alerta activa que requiere tu atención. Te recomiendo revisar la sección de alertas.`;
  }
  if (q.includes('incendio') || q.includes('fuego') || q.includes('riesgo')) {
    return `El riesgo de incendio hoy es ${ctx.fireRisk}. Con ${ctx.temp}°C y ${ctx.humidity}% de humedad, las condiciones son ${ctx.fireRisk === 'BAJO' ? 'favorables y no hay motivo de preocupación' : 'a tener en cuenta, te recomendamos estar atentos'}.`;
  }
  if (q.includes('dron') || q.includes('ronda') || q.includes('vuelo')) {
    return `La última ronda de dron fue a las ${ctx.lastDrone} y transcurrió sin novedades. No se detectó ninguna anomalía durante el vuelo.`;
  }
  if (q.includes('cámara') || q.includes('camara') || q.includes('vigilancia')) {
    return `${ctx.camerasOk} de ${ctx.camerasTotal} cámaras están activas y grabando correctamente. El perímetro está monitorizando sin interrupciones.`;
  }
  if (q.includes('tiempo') || q.includes('clima') || q.includes('temperatura')) {
    return `Ahora mismo hay ${ctx.temp}°C en la finca, con una humedad del ${ctx.humidity}% y viento de ${ctx.wind} km/h. El riesgo de incendio es ${ctx.fireRisk}.`;
  }
  return `Todo está funcionando con normalidad. Las ${ctx.camerasOk} cámaras operativas y el sistema de alertas están activos. ¿Hay algo concreto que quieras saber?`;
}
