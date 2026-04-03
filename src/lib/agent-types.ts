// Types for AI Agent Analysis system

export type DetectionType = 'vacas' | 'fuegos' | 'personas' | 'coches' | 'animales_muertos' | 'plagas' | 'inundaciones';

export type AgentEstado = 'normal' | 'atencion' | 'alerta' | 'critico';

export type AlertaSeveridad = 'critica' | 'alta' | 'media' | 'baja';

export type TareaPrioridad = 'alta' | 'media' | 'baja';

export interface Anomalia {
    descripcion: string;
    gps: [number, number] | null;
    severidad: AlertaSeveridad;
    accion_recomendada: string;
}

export interface AnalisisAgente {
    indice: number;
    estado: AgentEstado;
    hallazgos: string[];
    anomalias: Anomalia[];
    recomendaciones: string[];
}

export interface Tarea {
    titulo: string;
    descripcion: string;
    prioridad: TareaPrioridad;
    detectionType: string;
    gps: [number, number] | null;
    plazo: string;
}

export interface Alerta {
    titulo: string;
    descripcion: string;
    severidad: AlertaSeveridad;
    detectionType: string;
    lat: number | null;
    lon: number | null;
    requiere_accion: boolean;
}

export interface EstadisticasCalculadas {
    centroide_grupo: [number, number] | null;
    deteccion_mas_alejada: {
        track_id: number;
        distancia_m: number;
        gps: [number, number];
    } | null;
    variacion_vs_historico: string;
    zonas_criticas_afectadas: string[];
}

export interface ParaElCliente {
    mensaje_whatsapp: string;
    nivel_urgencia: string;
    proxima_accion: string;
}

export interface AgentAnalysis {
    agentes_activados: string[];
    resumen_ejecutivo: string;
    indice_general: number;
    analisis_por_agente: Record<string, AnalisisAgente>;
    tareas: Tarea[];
    alertas: Alerta[];
    estadisticas_calculadas: EstadisticasCalculadas;
    para_el_cliente: ParaElCliente;
}

export interface AnalysisDocument {
    jobId: string;
    organizationId: string;
    missionName: string;
    siteName: string;
    status: 'analyzing' | 'completed' | 'failed';
    analysis: AgentAnalysis | null;
    createdAt: any;
    completedAt: any | null;
    error: string | null;
    rawResponse: string | null;
    model: string;
}

export interface ClientZone {
    label: string;
    lat: number;
    lon: number;
    radiusMeters: number;
    criticality: 'alta' | 'media' | 'baja';
}

export interface ClientConfig {
    farmName: string;
    siteName: string;
    detectionTypes: DetectionType[];
    zones: ClientZone[];
}

export const DETECTION_TYPE_CONFIG: Record<DetectionType, { label: string; icon: string; emoji: string }> = {
    vacas: { label: 'Vacas', icon: 'pets', emoji: '🐄' },
    fuegos: { label: 'Fuegos', icon: 'local_fire_department', emoji: '🔥' },
    personas: { label: 'Personas', icon: 'person_search', emoji: '👤' },
    coches: { label: 'Coches', icon: 'directions_car', emoji: '🚗' },
    animales_muertos: { label: 'Animales Muertos', icon: 'report', emoji: '💀' },
    plagas: { label: 'Plagas', icon: 'bug_report', emoji: '🐛' },
    inundaciones: { label: 'Inundaciones', icon: 'water', emoji: '🌊' },
};

export const ESTADO_CONFIG: Record<AgentEstado, { label: string; color: string; bgColor: string }> = {
    normal: { label: 'Normal', color: 'text-emerald-700', bgColor: 'bg-emerald-100' },
    atencion: { label: 'Atención', color: 'text-yellow-700', bgColor: 'bg-yellow-100' },
    alerta: { label: 'Alerta', color: 'text-orange-700', bgColor: 'bg-orange-100' },
    critico: { label: 'Crítico', color: 'text-red-700', bgColor: 'bg-red-100' },
};

export const SEVERIDAD_CONFIG: Record<AlertaSeveridad, { label: string; color: string; bgColor: string; borderColor: string }> = {
    critica: { label: 'Crítica', color: 'text-red-700', bgColor: 'bg-red-100', borderColor: 'border-red-300' },
    alta: { label: 'Alta', color: 'text-red-600', bgColor: 'bg-red-50', borderColor: 'border-red-200' },
    media: { label: 'Media', color: 'text-orange-700', bgColor: 'bg-orange-100', borderColor: 'border-orange-300' },
    baja: { label: 'Baja', color: 'text-blue-700', bgColor: 'bg-blue-100', borderColor: 'border-blue-300' },
};

export const PRIORIDAD_CONFIG: Record<TareaPrioridad, { label: string; color: string; bgColor: string }> = {
    alta: { label: 'Alta', color: 'text-red-700', bgColor: 'bg-red-100' },
    media: { label: 'Media', color: 'text-orange-700', bgColor: 'bg-orange-100' },
    baja: { label: 'Baja', color: 'text-slate-600', bgColor: 'bg-slate-100' },
};
