'use client';

import { useState, useRef, useEffect } from 'react';
import Image from 'next/image';
import { GalleryImage } from '@/lib/types';

interface AIChatModalProps {
    image: GalleryImage;
    imageUrl: string;
    onClose: () => void;
}

interface ChatMessage {
    role: 'user' | 'ai';
    content: string;
}

export default function AIChatModal({ image, imageUrl, onClose }: AIChatModalProps) {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    useEffect(() => {
        const greeting = image.type === 'lone_cow'
            ? 'He detectado un animal aislado con posibles signos de alerta. ¿Quieres que analice su postura o estado físico?'
            : `Análisis de ${image.label.toLowerCase()} iniciado. ¿Qué información específica necesitas sobre esta captura?`;

        setMessages([{ role: 'ai', content: greeting }]);
    }, [image]);

    const sendMessage = async (question: string) => {
        if (!question.trim() || isLoading) return;

        const userMessage: ChatMessage = { role: 'user', content: question };
        setMessages((prev) => [...prev, userMessage]);
        setInput('');
        setIsLoading(true);

        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    imageUrl,
                    question,
                    context: `Análisis técnico de ${image.label}. ${image.type === 'lone_cow' ? 'Alerta: Animal aislado.' : 'Estado normal.'}`,
                }),
            });

            const data = await response.json();
            setMessages((prev) => [...prev, { role: 'ai', content: data.answer || 'No pude procesar la imagen.' }]);
        } catch (error) {
            setMessages((prev) => [...prev, { role: 'ai', content: 'Error de conexión con el motor neuronal. Asegúrate de que moondream_api.py esté corriendo.' }]);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        sendMessage(input);
    };

    return (
        <div className="fixed inset-0 z-[100] flex flex-col bg-white animate-fade-in-up">
            {/* Header */}
            <div className="absolute top-0 left-0 right-0 z-20 p-4 bg-white/80 backdrop-blur-md border-b border-slate-100 dark:border-slate-800">
                <div className="max-w-7xl mx-auto flex items-center justify-between">
                    <button
                        onClick={onClose}
                        className="w-10 h-10 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 transition-all"
                    >
                        <span className="material-icons-round">close</span>
                    </button>

                    <div className="flex items-center gap-3 bg-slate-50 px-4 py-2 rounded-full border border-slate-200">
                        <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse-slow"></div>
                        <span className="text-xs font-bold text-slate-700 tracking-widest uppercase">Moondream Neural Link</span>
                    </div>

                    <div className="w-10 h-10"></div>
                </div>
            </div>

            <div className="flex-1 lg:grid lg:grid-cols-2 h-full pt-20 lg:pt-0">
                {/* Image View */}
                <div className="relative h-[40%] lg:h-full bg-slate-100 group overflow-hidden">
                    <Image
                        src={imageUrl}
                        alt={image.label}
                        fill
                        className="object-contain"
                        priority
                    />

                    {/* Bounding Box Info Overlay */}
                    <div className="absolute bottom-4 left-4 right-4">
                        <div className="glass p-4 rounded-xl border border-white/50 shadow-lg animate-fade-in-up">
                            <h2 className="text-lg font-bold text-slate-800">{image.label}</h2>
                            <div className="flex items-center gap-2 text-xs text-slate-500 font-mono mt-1">
                                <span className="bg-white/50 px-2 py-0.5 rounded">Frame: {image.frame}</span>
                                <span className="bg-white/50 px-2 py-0.5 rounded">Confianza: 98.4%</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Chat Interface */}
                <div className="flex flex-col h-[60%] lg:h-full bg-white relative">
                    {/* Messages Area */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-4 scroll-smooth pb-4">
                        <div className="text-center py-4">
                            <div className="w-12 h-12 mx-auto rounded-full bg-primary/10 flex items-center justify-center mb-2 animate-float">
                                <span className="material-icons-round text-2xl text-primary">psychology</span>
                            </div>
                            <p className="text-[10px] text-slate-400 uppercase tracking-widest">IA Conectada</p>
                        </div>

                        {messages.map((msg, i) => (
                            <div
                                key={i}
                                className={`flex gap-3 ${msg.role === 'ai' ? 'animate-fade-in-up' : 'flex-row-reverse animate-fade-in-up'}`}
                            >
                                {msg.role === 'ai' && (
                                    <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center shrink-0 mt-1 shadow-md shadow-primary/20">
                                        <span className="material-icons-round text-xs text-white">smart_toy</span>
                                    </div>
                                )}

                                <div className={`max-w-[85%] p-3.5 rounded-2xl text-sm leading-relaxed shadow-sm ${msg.role === 'ai'
                                    ? 'bg-slate-50 text-slate-700 rounded-tl-none border border-slate-100'
                                    : 'bg-primary text-white shadow-primary/20 rounded-tr-none'
                                    }`}>
                                    {msg.content}
                                </div>
                            </div>
                        ))}

                        {isLoading && (
                            <div className="flex gap-3 animate-pulse">
                                <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
                                    <span className="material-icons-round text-xs text-slate-400">sync</span>
                                </div>
                                <div className="flex items-center gap-1 h-8">
                                    <div className="w-1.5 h-1.5 rounded-full bg-slate-300 animate-bounce"></div>
                                    <div className="w-1.5 h-1.5 rounded-full bg-slate-300 animate-bounce delay-75"></div>
                                    <div className="w-1.5 h-1.5 rounded-full bg-slate-300 animate-bounce delay-150"></div>
                                </div>
                            </div>
                        )}
                        <div ref={messagesEndRef} className="h-2" />
                    </div>

                    {/* Input Area */}
                    <div className="p-4 bg-white border-t border-slate-100 pb-8 lg:pb-4">
                        {/* Quick Actions */}
                        <div className="flex gap-2 overflow-x-auto hide-scrollbar mb-3">
                            {['Analizar salud', 'Peso', 'Anomalías'].map((pill, i) => (
                                <button
                                    key={i}
                                    onClick={() => sendMessage(pill)}
                                    className="whitespace-nowrap px-3 py-1.5 rounded-full bg-slate-50 border border-slate-200 text-xs text-slate-600 hover:bg-primary/10 hover:text-primary hover:border-primary/20 transition-all"
                                >
                                    {pill}
                                </button>
                            ))}
                        </div>

                        <form onSubmit={handleSubmit} className="relative group">
                            <input
                                type="text"
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                placeholder="Escribe tu consulta..."
                                className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 pr-12 text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all"
                                disabled={isLoading}
                            />
                            <button
                                type="submit"
                                disabled={!input.trim() || isLoading}
                                className="absolute right-2 top-2 bottom-2 w-10 text-primary hover:bg-primary/10 rounded-xl transition-all disabled:opacity-30 disabled:hover:bg-transparent flex items-center justify-center"
                            >
                                <span className="material-icons-round">send</span>
                            </button>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    );
}
