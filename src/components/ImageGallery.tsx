'use client';

import { useState } from 'react';
import Image from 'next/image';
import { Captures, GalleryImage, SCENE_CONFIG } from '@/lib/types';

interface ImageGalleryProps {
    captures: Captures;
    baseImageUrl: string;
    onImageClick: (image: GalleryImage) => void;
}

export default function ImageGallery({ captures, baseImageUrl, onImageClick }: ImageGalleryProps) {
    const galleryItems: GalleryImage[] = [];
    const captureTypes = ['lone_cow', 'max_cows', 'most_grouped'] as const; // Prioritize these

    captureTypes.forEach((type) => {
        const capture = captures[type];
        if (capture && capture.files?.bbox) {
            const config = SCENE_CONFIG[type];
            galleryItems.push({
                type,
                label: config.label,
                emoji: config.emoji,
                file: capture.files.bbox,
                frame: capture.frame,
                suggestedQuestions: config.questions,
            });
        }
    });

    const getStatusStyle = (type: string) => {
        if (type === 'lone_cow') {
            return {
                container: 'border-2 border-accent-orange/30',
                badge: 'bg-accent-orange text-white',
                title: 'text-accent-orange',
                label: 'Alerta'
            };
        }
        if (type === 'max_cows') {
            return {
                container: 'border border-slate-200 dark:border-slate-800',
                badge: 'bg-primary text-white',
                title: 'dark:text-white text-slate-900',
                label: 'Grupo'
            };
        }
        return {
            container: 'border border-slate-200 dark:border-slate-800',
            badge: 'bg-slate-500 text-white',
            title: 'text-slate-500',
            label: 'Normal'
        };
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h3 className="font-bold text-sm uppercase tracking-wider text-slate-500">Capturas Recientes</h3>
                <button className="text-[10px] font-bold text-primary hover:underline uppercase">Ver todo</button>
            </div>

            <div className="space-y-4 overflow-y-auto max-h-[600px] pr-2 hide-scrollbar">
                {galleryItems.map((item) => {
                    const style = getStatusStyle(item.type);

                    return (
                        <div
                            key={item.type}
                            onClick={() => onImageClick(item)}
                            className={`group bg-white dark:bg-surface-dark rounded-2xl p-4 shadow-sm hover:shadow-md transition-all cursor-pointer ${style.container}`}
                        >
                            <div className={`relative rounded-xl overflow-hidden mb-3 aspect-video bg-slate-800 ${item.type === 'most_grouped' ? 'opacity-80 group-hover:opacity-100' : ''}`}>
                                <Image
                                    src={item.file ? `${baseImageUrl}/${item.file}` : "/placeholder.jpg"}
                                    alt={item.label}
                                    fill
                                    className="object-cover transition-transform group-hover:scale-105"
                                    sizes="(max-width: 768px) 100vw, 300px"
                                />
                                <div className={`absolute top-2 right-2 px-2 py-0.5 text-[10px] font-bold rounded uppercase shadow-lg ${style.badge}`}>
                                    {style.label}
                                </div>
                            </div>

                            <div className="flex items-center justify-between">
                                <div>
                                    <h4 className={`text-xs font-bold mb-0.5 ${style.title}`}>{item.label}</h4>
                                    <p className="text-[10px] text-slate-500 font-mono">Frame #{item.frame}</p>
                                </div>
                                <button className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${item.type === 'lone_cow'
                                        ? 'bg-accent-orange/10 text-accent-orange group-hover:bg-accent-orange group-hover:text-white'
                                        : 'bg-slate-100 dark:bg-slate-800 text-slate-400 group-hover:bg-primary group-hover:text-white'
                                    }`}>
                                    <span className="material-icons-round text-lg">arrow_forward</span>
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
