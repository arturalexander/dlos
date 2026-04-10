/**
 * POST /api/galisancho/kg/seed
 *
 * Puebla el Knowledge Graph con:
 * 1. Entidades reales: zonas de map_items, dron real de telemetría
 * 2. Misiones reales: convierte processing_jobs en eventos KG
 * 3. Datos simulados: tractor, ATV, grupos de ganado, documentos
 *
 * Llámalo una vez para inicializar. Se puede rellamar para actualizar.
 */
import { NextRequest, NextResponse } from 'next/server';
import {
  collection, getDocs, query, orderBy, limit, Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { saveKGEntity, saveKGEvent, type KGEvent } from '@/lib/kg';

// Centro aproximado de Finca Galisancho y zonas simuladas
const FINCA_CENTER = { lat: 37.7921, lng: -6.2048 };
const ZONES = [
  { id: 'zone_dehesa_norte', name: 'Dehesa Norte', lat: 37.7980, lng: -6.1990, area_ha: 45 },
  { id: 'zone_dehesa_sur',   name: 'Dehesa Sur',   lat: 37.7860, lng: -6.2100, area_ha: 38 },
  { id: 'zone_aguadero_1',   name: 'Aguadero 1',   lat: 37.7930, lng: -6.2060, area_ha: 2 },
  { id: 'zone_aguadero_2',   name: 'Aguadero 2',   lat: 37.7890, lng: -6.1980, area_ha: 2 },
  { id: 'zone_cortijo',      name: 'Cortijo',      lat: 37.7921, lng: -6.2048, area_ha: 1 },
  { id: 'zone_pradera_este', name: 'Pradera Este',  lat: 37.7940, lng: -6.1950, area_ha: 30 },
];

function tsHoursAgo(h: number) {
  const d = new Date(); d.setHours(d.getHours() - h);
  return Timestamp.fromDate(d);
}
function tsDaysAgo(d: number, h = 10) {
  const dt = new Date(); dt.setDate(dt.getDate() - d); dt.setHours(h, 0, 0, 0);
  return Timestamp.fromDate(dt);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const mode = body.mode ?? 'all'; // 'all' | 'entities' | 'events' | 'missions'

    const log: string[] = [];

    // ── 1. ENTIDADES ──────────────────────────────────────────────────────────
    if (mode === 'all' || mode === 'entities') {

      // Dron real
      await saveKGEntity('drone_1581', {
        type: 'drone',
        name: 'DJI Matrice 30T',
        properties: {
          sn: '1581F8HGX254M00A0ADR',
          modelo: 'DJI Matrice 30T',
          camara: 'RGB + Thermal + Zoom',
          max_altitude_m: 1500,
          max_speed_kmh: 82,
        },
      });

      // Vehículos terrestres (simulados)
      await saveKGEntity('vehicle_tractor_1', {
        type: 'vehicle',
        name: 'Tractor John Deere',
        properties: {
          modelo: 'John Deere 6120M',
          matricula: '1234-ABC',
          color: 'verde',
          uso: 'laboreo y alimentación',
        },
      });
      await saveKGEntity('vehicle_atv_1', {
        type: 'vehicle',
        name: 'ATV Can-Am',
        properties: {
          modelo: 'Can-Am Defender',
          color: 'naranja',
          uso: 'supervisión de campo',
        },
      });

      // Zonas de la finca
      for (const z of ZONES) {
        await saveKGEntity(z.id, {
          type: 'zone',
          name: z.name,
          properties: {
            lat: z.lat,
            lng: z.lng,
            area_ha: z.area_ha,
          },
        });
      }

      // Grupos de ganado (simulados)
      await saveKGEntity('cattle_group_limusin', {
        type: 'cattle_group',
        name: 'Vacas Limusín',
        properties: {
          raza: 'Limusín',
          cabezas_estimadas: 120,
          zona_habitual: 'Dehesa Norte',
        },
      });
      await saveKGEntity('cattle_group_cria', {
        type: 'cattle_group',
        name: 'Grupo Crías',
        properties: {
          raza: 'Limusín',
          cabezas_estimadas: 18,
          zona_habitual: 'Pradera Este',
          nota: 'Terneros de este año',
        },
      });

      // Sensores (simulados)
      await saveKGEntity('sensor_gps_tractor', {
        type: 'sensor',
        name: 'GPS Tractor',
        properties: {
          tipo: 'GPS',
          precision_m: 2,
          vehiculo: 'Tractor John Deere',
        },
      });

      // Documentos
      await saveKGEntity('doc_protocolo_vacunacion', {
        type: 'document',
        name: 'Protocolo Vacunación 2026',
        properties: {
          tipo: 'veterinario',
          fecha: '2026-01-15',
          autor: 'Dr. Pérez Veterinaria',
          descripcion: 'Calendario vacunal anual del rebaño',
        },
      });

      log.push(`✅ Entidades creadas: dron, tractor, ATV, ${ZONES.length} zonas, 2 grupos ganado, 1 sensor, 1 documento`);
    }

    // ── 2. MISIONES REALES → EVENTOS KG ──────────────────────────────────────
    if (mode === 'all' || mode === 'missions') {
      const snap = await getDocs(
        query(collection(db, 'processing_jobs'), orderBy('createdAt', 'desc'), limit(20))
      );

      let misionesConvertidas = 0;
      for (const docSnap of snap.docs) {
        const d = docSnap.data();
        if (!d.createdAt) continue;
        const r = d.results ?? {};
        const totalAnimales = r.totalCows ?? r.totalAnimals ?? 0;
        const totalPersonas = r.totalPersons ?? 0;
        const totalVehiculos = r.totalVehicles ?? r.totalCars ?? 0;
        const altMedia = r.flightInfo?.avg_altitude ?? r.flightInfo?.avgAltitude ?? null;
        const centerLat = r.flightInfo?.center_lat ?? FINCA_CENTER.lat;
        const centerLng = r.flightInfo?.center_lon ?? FINCA_CENTER.lng;

        // Determinar zona más cercana
        const zona = ZONES.reduce((prev, curr) => {
          const distPrev = Math.hypot(prev.lat - centerLat, prev.lng - centerLng);
          const distCurr = Math.hypot(curr.lat - centerLat, curr.lng - centerLng);
          return distCurr < distPrev ? curr : prev;
        }, ZONES[0]);

        await saveKGEvent({
          entityId: 'drone_1581',
          entityType: 'drone',
          entityName: 'DJI Matrice 30T',
          action: d.status === 'completed' ? 'misión completada' : `misión ${d.status}`,
          location: { lat: centerLat, lng: centerLng, zoneName: zona.name },
          relatedEntityIds: ['cattle_group_limusin'],
          metadata: {
            mision_id: docSnap.id,
            animales: totalAnimales,
            personas: totalPersonas,
            vehiculos: totalVehiculos,
            ...(altMedia ? { altitud_m: Number(altMedia).toFixed(0) } : {}),
            estado: d.status,
          },
          timestamp: d.createdAt,
          source: 'real',
        });

        // Si hay posiciones GPS de vacas → evento de ganado
        if (totalAnimales > 0) {
          await saveKGEvent({
            entityId: 'cattle_group_limusin',
            entityType: 'cattle_group',
            entityName: 'Vacas Limusín',
            action: `avistadas ${totalAnimales} cabezas por drone`,
            location: { lat: centerLat, lng: centerLng, zoneName: zona.name },
            relatedEntityIds: ['drone_1581'],
            metadata: {
              cabezas: totalAnimales,
              mision_id: docSnap.id,
            },
            timestamp: d.createdAt,
            source: 'real',
          });
        }
        misionesConvertidas++;
      }
      log.push(`✅ ${misionesConvertidas} misiones reales convertidas a eventos KG`);
    }

    // ── 3. EVENTOS SIMULADOS (tractor, ATV, veterinario…) ────────────────────
    if (mode === 'all' || mode === 'events') {
      const eventsSimulados: Omit<KGEvent, 'id'>[] = [
        // Tractor — últimas 48h
        {
          entityId: 'vehicle_tractor_1', entityType: 'vehicle', entityName: 'Tractor John Deere',
          action: 'distribución de pienso', source: 'simulated',
          location: { lat: 37.7980, lng: -6.1990, zoneName: 'Dehesa Norte' },
          relatedEntityIds: ['cattle_group_limusin', 'zone_dehesa_norte'],
          metadata: { duracion_min: 45, kg_pienso: 800 },
          timestamp: tsDaysAgo(0, 9), // hoy 9h
        },
        {
          entityId: 'vehicle_tractor_1', entityType: 'vehicle', entityName: 'Tractor John Deere',
          action: 'distribución de pienso', source: 'simulated',
          location: { lat: 37.7860, lng: -6.2100, zoneName: 'Dehesa Sur' },
          relatedEntityIds: ['cattle_group_limusin', 'zone_dehesa_sur'],
          metadata: { duracion_min: 30, kg_pienso: 600 },
          timestamp: tsDaysAgo(0, 10),
        },
        {
          entityId: 'vehicle_tractor_1', entityType: 'vehicle', entityName: 'Tractor John Deere',
          action: 'revisión de aguaderos', source: 'simulated',
          location: { lat: 37.7930, lng: -6.2060, zoneName: 'Aguadero 1' },
          relatedEntityIds: ['zone_aguadero_1'],
          metadata: { nivel_agua: '75%', estado: 'correcto' },
          timestamp: tsDaysAgo(1, 8), // ayer 8h
        },
        {
          entityId: 'vehicle_tractor_1', entityType: 'vehicle', entityName: 'Tractor John Deere',
          action: 'revisión de aguaderos', source: 'simulated',
          location: { lat: 37.7890, lng: -6.1980, zoneName: 'Aguadero 2' },
          relatedEntityIds: ['zone_aguadero_2'],
          metadata: { nivel_agua: '40%', estado: 'rellenar pronto' },
          timestamp: tsDaysAgo(1, 9),
        },
        {
          entityId: 'vehicle_tractor_1', entityType: 'vehicle', entityName: 'Tractor John Deere',
          action: 'laboreo de pradera', source: 'simulated',
          location: { lat: 37.7940, lng: -6.1950, zoneName: 'Pradera Este' },
          relatedEntityIds: ['zone_pradera_este'],
          metadata: { duracion_h: 3, superficie_ha: 12 },
          timestamp: tsDaysAgo(2, 10),
        },

        // ATV
        {
          entityId: 'vehicle_atv_1', entityType: 'vehicle', entityName: 'ATV Can-Am',
          action: 'supervisión del rebaño', source: 'simulated',
          location: { lat: 37.7980, lng: -6.1990, zoneName: 'Dehesa Norte' },
          relatedEntityIds: ['cattle_group_limusin'],
          metadata: { vacas_vistas: 87, incidencias: 0 },
          timestamp: tsDaysAgo(0, 16), // hoy tarde
        },
        {
          entityId: 'vehicle_atv_1', entityType: 'vehicle', entityName: 'ATV Can-Am',
          action: 'traslado de terneros', source: 'simulated',
          location: { lat: 37.7940, lng: -6.1950, zoneName: 'Pradera Este' },
          relatedEntityIds: ['cattle_group_cria'],
          metadata: { terneros_trasladados: 6, destino: 'Cortijo' },
          timestamp: tsDaysAgo(1, 14),
        },

        // Ganado — movimientos
        {
          entityId: 'cattle_group_limusin', entityType: 'cattle_group', entityName: 'Vacas Limusín',
          action: 'detectadas en pastoreo', source: 'simulated',
          location: { lat: 37.7980, lng: -6.1990, zoneName: 'Dehesa Norte' },
          metadata: { cabezas: 95, comportamiento: 'normal' },
          timestamp: tsDaysAgo(0, 11),
        },
        {
          entityId: 'cattle_group_limusin', entityType: 'cattle_group', entityName: 'Vacas Limusín',
          action: 'agrupadas en aguadero', source: 'simulated',
          location: { lat: 37.7930, lng: -6.2060, zoneName: 'Aguadero 1' },
          metadata: { cabezas: 42, motivo: 'calor' },
          timestamp: tsDaysAgo(0, 14),
        },

        // Veterinario
        {
          entityId: 'cattle_group_limusin', entityType: 'cattle_group', entityName: 'Vacas Limusín',
          action: 'revisión veterinaria programada', source: 'simulated',
          location: { lat: 37.7921, lng: -6.2048, zoneName: 'Cortijo' },
          relatedEntityIds: ['doc_protocolo_vacunacion'],
          metadata: { veterinario: 'Dr. Pérez', vacunas: 'IBR + BVD', cabezas_tratadas: 15 },
          timestamp: tsDaysAgo(3, 10),
        },

        // Sensor GPS tractor (pings)
        {
          entityId: 'sensor_gps_tractor', entityType: 'sensor', entityName: 'GPS Tractor',
          action: 'ping GPS', source: 'simulated',
          location: { lat: 37.7980, lng: -6.1990, zoneName: 'Dehesa Norte' },
          metadata: { precision_m: 2, bateria: '89%' },
          timestamp: tsHoursAgo(1),
        },
      ];

      for (const ev of eventsSimulados) {
        await saveKGEvent(ev);
      }
      log.push(`✅ ${eventsSimulados.length} eventos simulados creados (tractor, ATV, ganado, veterinario, GPS)`);
    }

    return NextResponse.json({ ok: true, log });
  } catch (e: any) {
    console.error('[KG SEED]', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
