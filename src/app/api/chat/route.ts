import { NextRequest, NextResponse } from 'next/server';

const MOONDREAM_API_URL = process.env.NEXT_PUBLIC_MOONDREAM_API_URL || 'http://localhost:8000';

export async function POST(request: NextRequest) {
    try {
        const { imageUrl, question, context } = await request.json();

        if (!imageUrl || !question) {
            return NextResponse.json(
                { error: 'Missing imageUrl or question' },
                { status: 400 }
            );
        }

        // Build the full question with Spanish context
        const contextualQuestion = `${context}\n\nPregunta (responde en español): ${question}`;

        // Call local Moondream API
        const response = await fetch(`${MOONDREAM_API_URL}/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                image_url: imageUrl,
                question: contextualQuestion,
            }),
        });

        if (!response.ok) {
            throw new Error(`Moondream API error: ${response.status}`);
        }

        const data = await response.json();

        return NextResponse.json({ answer: data.answer });
    } catch (error) {
        console.error('Chat API error:', error);
        return NextResponse.json(
            { error: 'Failed to process chat request', answer: 'Error al conectar con Moondream. Asegúrate de que esté corriendo en localhost:8000' },
            { status: 500 }
        );
    }
}
