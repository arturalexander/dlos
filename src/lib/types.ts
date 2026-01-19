// Types for Cattle Vision mission data

export interface MissionSummary {
    total_confirmed_cows: number;
    total_time_min: number;
    max_simultaneous: number;
    gps_tracking_enabled: boolean;
    visited_zones: number;
    gps_zone_radius_m: number;
}

export interface FlightInfo {
    center_lat: number;
    center_lon: number;
    min_lat: number;
    max_lat: number;
    min_lon: number;
    max_lon: number;
    avg_altitude_m: number;
    min_altitude_m: number;
    max_altitude_m: number;
}

export interface CaptureFiles {
    clean: string;
    bbox: string;
}

export interface Telemetry {
    latitude: number;
    longitude: number;
    rel_alt: number;
    abs_alt: number;
    yaw: number;
    pitch: number;
    roll: number;
}

export interface CaptureEvent {
    count?: number;
    area?: number;
    avg_dist?: number;
    files: CaptureFiles;
    frame: number;
    telemetry?: Telemetry;
}

export interface PeriodicCapture {
    files: CaptureFiles;
    frame: number;
    telemetry?: Telemetry;
}

export interface Captures {
    max_cows: CaptureEvent;
    first_cow: CaptureEvent;
    closest_cow: CaptureEvent;
    furthest_cow: CaptureEvent;
    most_grouped: CaptureEvent;
    lone_cow: CaptureEvent;
    periodic: PeriodicCapture[];
}

export interface CowData {
    track_id: number;
    detections: number;
    duration_s: number;
    gps_location: [number, number];
    in_visited_zone: boolean;
}

export interface MissionData {
    id?: string;
    name?: string;
    date?: string;
    summary: MissionSummary;
    flight_info: FlightInfo;
    captures: Captures;
    cows: CowData[];
}

export interface GalleryImage {
    type: string;
    label: string;
    emoji: string;
    file: string;
    frame: number;
    suggestedQuestions: string[];
}

// Scene type labels and suggested questions
export const SCENE_CONFIG: Record<string, { label: string; emoji: string; questions: string[] }> = {
    max_cows: {
        label: 'Grupo Principal',
        emoji: '🔥',
        questions: ['¿Cuántos terneros hay?', '¿Estado del pasto?', '¿Hay vacas echadas?']
    },
    lone_cow: {
        label: 'Vaca Aislada',
        emoji: '🧍',
        questions: ['¿Está la vaca herida?', '¿Hay agua cerca?', '¿Se ve estresada?']
    },
    closest_cow: {
        label: 'Detalle Cercano',
        emoji: '🔍',
        questions: ['¿Qué raza parece ser?', '¿Estado corporal?', '¿Tiene marcas?']
    },
    first_cow: {
        label: 'Primera Detección',
        emoji: '1️⃣',
        questions: ['¿Qué está haciendo la vaca?', '¿Hay más animales cerca?']
    },
    most_grouped: {
        label: 'Grupo Compacto',
        emoji: '👨‍👩‍👧',
        questions: ['¿Cuántas vacas hay exactamente?', '¿Hay terneros en el grupo?']
    },
    furthest_cow: {
        label: 'Más Lejana',
        emoji: '🔭',
        questions: ['¿Es una vaca o es otro animal?', '¿Está sola?']
    }
};
