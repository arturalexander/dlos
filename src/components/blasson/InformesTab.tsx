'use client';

// Informes — Generacion de resúmenes de actividad
// TODO: Conectar con datos reales de Firebase para estadísticas
// TODO: Exportar a PDF usando librería como jsPDF

import { useState } from 'react';

type Period = 'diario' | 'semanal' | 'mensual';
type ReportCategory = 'seguridad' | 'fuego' | 'operaciones' | 'accesos';

interface ReportSection {
  title: string;
  icon: string;
  content: string;
  category: ReportCategory;
}

interface PeriodData {
  label: string;
  stats: { label: string; value: string; icon: string; color: string }[];
  sections: ReportSection[];
}

const REPORT_DATA: Record<Period, PeriodData> = {
  diario: {
    label: 'Informe Diario',
    stats: [
      { label: 'Vuelos realizados',  value: '3',   icon: 'flight_takeoff',         color: 'text-blue-700 bg-blue-50' },
      { label: 'Incidencias',        value: '1',   icon: 'warning',                color: 'text-orange-700 bg-orange-50' },
      { label: 'Alarmas activadas',  value: '2',   icon: 'notifications_active',   color: 'text-red-700 bg-red-50' },
      { label: 'Horas de vuelo',     value: '4.5', icon: 'timer',                  color: 'text-green-700 bg-green-50' },
      { label: 'Alertas fuego',      value: '1',   icon: 'local_fire_department',  color: 'text-orange-700 bg-orange-50' },
      { label: 'Falsas alarmas',     value: '1',   icon: 'cancel',                 color: 'text-slate-500 bg-slate-100' },
    ],
    sections: [
      {
        title: 'Resumen del Día',
        icon: 'today',
        category: 'operaciones',
        content: 'Operaciones completadas dentro de parámetros normales. Se realizaron 3 vuelos de patrulla con cobertura del 98% de la finca. Piloto Norte cubrió sectores 6 y 7; Piloto Sur sectores 1 y 2; Piloto Este sectores 4 y 5.',
      },
      {
        title: 'Seguridad y Vigilancia',
        icon: 'security',
        category: 'seguridad',
        content: 'Una incidencia registrada: persona con cámara fotográfica en Sector Sur (zona restringida). La persona fue observada durante 15 min y se marchó sin incidentes. Coordenadas registradas. Pendiente seguimiento.',
      },
      {
        title: 'Detección de Incendios',
        icon: 'local_fire_department',
        category: 'fuego',
        content: 'CAM-02 (Sur Entrada) activó alerta de fuego a las 14:32. Confianza IA: 87%, temperatura detectada: 38°C. Alarma enviada por Telegram. Verificación posterior: incendio real de pequeña escala controlado en 22 min. Estado: RESUELTO.',
      },
      {
        title: 'Acciones Pendientes',
        icon: 'task_alt',
        category: 'operaciones',
        content: '• Revisión urgente de CAM-04 (offline desde hace 6h)\n• Seguimiento de incidencia en Sector Sur (persona no identificada)\n• Programar vuelo preventivo nocturno (riesgo moderado incendio)\n• Verificar nivel de agua en charcas sector norte',
      },
    ],
  },
  semanal: {
    label: 'Informe Semanal',
    stats: [
      { label: 'Vuelos realizados',  value: '18',  icon: 'flight_takeoff',         color: 'text-blue-700 bg-blue-50' },
      { label: 'Incidencias',        value: '3',   icon: 'warning',                color: 'text-orange-700 bg-orange-50' },
      { label: 'Alarmas activadas',  value: '5',   icon: 'notifications_active',   color: 'text-red-700 bg-red-50' },
      { label: 'Horas de vuelo',     value: '27',  icon: 'timer',                  color: 'text-green-700 bg-green-50' },
      { label: 'Alertas fuego',      value: '2',   icon: 'local_fire_department',  color: 'text-orange-700 bg-orange-50' },
      { label: 'Falsas alarmas',     value: '3',   icon: 'cancel',                 color: 'text-slate-500 bg-slate-100' },
    ],
    sections: [
      {
        title: 'Resumen Semanal',
        icon: 'date_range',
        category: 'operaciones',
        content: 'Semana operativamente estable. 18 vuelos completados con cobertura del 100% de la finca. Tres incidencias registradas: 1 acceso no autorizado (resuelto), 1 vehículo sospechoso (reportado a Guardia Civil, ref. 2024-TR-087), 1 dron no identificado (registrado y monitoreado).',
      },
      {
        title: 'Detección de Fuego',
        icon: 'local_fire_department',
        category: 'fuego',
        content: '2 detecciones de posible incendio esta semana:\n• Lunes 14:32 — Sector Sur: incendio real de pequeña escala, controlado. Tiempo de respuesta: 22 min.\n• Miércoles 11:15 — Sector Norte: FALSA ALARMA (temperatura alta por condiciones meteorológicas).\n\nRiesgo actual de incendio: MEDIO-BAJO. Vegetación seca en zonas altas.',
      },
      {
        title: 'Vigilancia y Seguridad',
        icon: 'security',
        category: 'seguridad',
        content: 'Perímetro sin brechas estructurales detectadas. Incidencias:\n• Persona no identificada en Sector Sur (documentada, sin consecuencias)\n• Vehículo todoterreno no autorizado en Sector Este (reportado GC)\n• Dron desconocido en perímetro norte (registrado, monitorizado)\n\nCoordinación con Guardia Civil en proceso para vehículo.',
      },
      {
        title: 'Estado de la Finca',
        icon: 'landscape',
        category: 'operaciones',
        content: 'Estado general: BUENO.\n• Agua en charcas: nivel normal (70-80% capacidad)\n• Vallado perimetral: sin brechas detectadas\n• Vegetación: seca en zonas altas (riesgo moderado incendio)\n• Ganado: localizado correctamente en sector central\n• CAM-04: problemas de conectividad intermitentes',
      },
      {
        title: 'Infraestructura',
        icon: 'settings',
        category: 'accesos',
        content: '• CAM-01 (Norte): operativa 100%\n• CAM-02 (Sur): operativa 100%\n• CAM-03 (Este): operativa 100%\n• CAM-04 (Oeste): ⚠️ offline intermitente — requiere revisión urgente\n• Sistema Telegram: activo, 100% mensajes entregados\n• Firebase: conexión estable\n• Uptime global del sistema: 94%',
      },
      {
        title: 'Recomendaciones',
        icon: 'lightbulb',
        category: 'operaciones',
        content: '1. Reparar CAM-04 antes de fin de semana (prioridad alta)\n2. Aumentar frecuencia de patrullas en Sector Sur (incidencia reciente)\n3. Considerar instalación de cámara adicional en perímetro norte\n4. Actualizar protocolo de respuesta ante falsas alarmas de fuego (reducir falsos positivos)\n5. Programar reunión con brigada forestal local para coordinación',
      },
    ],
  },
  mensual: {
    label: 'Informe Mensual',
    stats: [
      { label: 'Vuelos realizados',  value: '74',   icon: 'flight_takeoff',         color: 'text-blue-700 bg-blue-50' },
      { label: 'Incidencias',        value: '11',   icon: 'warning',                color: 'text-orange-700 bg-orange-50' },
      { label: 'Alarmas activadas',  value: '18',   icon: 'notifications_active',   color: 'text-red-700 bg-red-50' },
      { label: 'Horas de vuelo',     value: '112',  icon: 'timer',                  color: 'text-green-700 bg-green-50' },
      { label: 'Alertas fuego',      value: '5',    icon: 'local_fire_department',  color: 'text-orange-700 bg-orange-50' },
      { label: 'Falsas alarmas',     value: '11',   icon: 'cancel',                 color: 'text-slate-500 bg-slate-100' },
    ],
    sections: [
      {
        title: 'Resumen Mensual',
        icon: 'calendar_month',
        category: 'operaciones',
        content: 'Mes con alta actividad operacional. 74 vuelos completados con cobertura media del 98% de la finca por patrulla. Temporada de mayor riesgo de incendio activa. Sistema de detección temprana funcionando correctamente. 3 pilotos activos con total de 112 horas de vuelo acumuladas.',
      },
      {
        title: 'Análisis de Alarmas',
        icon: 'analytics',
        category: 'fuego',
        content: '18 alarmas totales este mes:\n• 5 de fuego: 2 confirmadas (1 resuelto autonomamente, 1 con apoyo brigada), 3 falsas alarmas\n• 8 de vigilancia: 4 intrusiones, 2 vehículos, 1 dron, 1 manual\n• 5 informativas (de pilotos)\n\nTiempo medio de respuesta: 4.2 min (objetivo: <5 min) ✅\nEficiencia del sistema Telegram: 100% — todos los mensajes entregados.',
      },
      {
        title: 'Estado de la Finca',
        icon: 'landscape',
        category: 'operaciones',
        content: 'Estado general: BUENO.\n• Nivel de agua en charcas: 70% (descenso normal estival)\n• Vallado perimetral: sin brechas detectadas\n• Vegetación: seca en zonas altas (riesgo moderado de incendio)\n• Camino interior Sector Este: huella de vehículo no autorizado (reforzar vigilancia)',
      },
      {
        title: 'KPIs Operacionales',
        icon: 'bar_chart',
        category: 'operaciones',
        content: '• Cobertura de vuelos: 98% ✅ (objetivo: >95%)\n• Tiempo respuesta alarmas: 4.2 min ✅ (objetivo: <5 min)\n• Uptime cámaras: 91% ⚠️ (CAM-04 penaliza — objetivo: >98%)\n• Tasa de falsos positivos fuego: 60% ❌ (objetivo: <30% — ajustar sensibilidad)\n• Incidencias resueltas sin escalado: 82% ✅\n• Satisfacción operacional: Alta',
      },
      {
        title: 'Seguridad y Vigilancia',
        icon: 'security',
        category: 'seguridad',
        content: '11 incidencias registradas:\n• 4 intrusiones de personas (2 en zona restringida, 2 en área pública)\n• 2 vehículos no autorizados (1 reportado GC)\n• 2 drones no identificados\n• 3 incidencias menores (fauna, desperfectos menores)\n\nSin robos o daños materiales reportados. Coordinación activa con Guardia Civil.',
      },
      {
        title: 'Plan Próximo Mes',
        icon: 'event_note',
        category: 'operaciones',
        content: '1. Reparación definitiva CAM-04 (prioridad máxima)\n2. Ajuste de algoritmos de detección de fuego (reducir falsos positivos al <30%)\n3. Vuelos adicionales en zona norte (riesgo incendio elevado en agosto)\n4. Revisión y actualización de protocolo de emergencia\n5. Coordinación con brigada forestal local antes de temporada de máximo riesgo\n6. Evaluar instalación de 2 cámaras adicionales (sector norte y oeste)',
      },
    ],
  },
};

const CATEGORY_COLORS: Record<ReportCategory, string> = {
  seguridad:   'text-red-700 bg-red-50 border-red-100',
  fuego:       'text-orange-700 bg-orange-50 border-orange-100',
  operaciones: 'text-blue-700 bg-blue-50 border-blue-100',
  accesos:     'text-slate-600 bg-slate-50 border-slate-100',
};

export default function InformesTab() {
  const [period, setPeriod] = useState<Period>('semanal');
  const [generating, setGenerating] = useState(false);
  const [generatedReport, setGeneratedReport] = useState<ReportSection[] | null>(null);
  const [filterCategory, setFilterCategory] = useState<ReportCategory | 'all'>('all');

  const data = REPORT_DATA[period];

  const generateReport = async () => {
    setGenerating(true);
    setGeneratedReport(null);
    await new Promise(r => setTimeout(r, 1800));
    setGeneratedReport(data.sections);
    setGenerating(false);
  };

  const downloadReport = () => {
    const sections = generatedReport || data.sections;
    const lines = [
      `=====================================`,
      `BLASSON PROPERTY INVESTMENTS`,
      `${data.label.toUpperCase()}`,
      `Generado: ${new Date().toLocaleString('es-ES')}`,
      `=====================================`,
      ``,
      `ESTADÍSTICAS`,
      ...data.stats.map(s => `• ${s.label}: ${s.value}`),
      ``,
      `=====================================`,
      ``,
      ...sections.flatMap(s => [
        `--- ${s.title.toUpperCase()} ---`,
        s.content,
        ``,
      ]),
      `=====================================`,
      `Generado por sistema BLASSON — dlos.ai`,
    ];

    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `blasson-${period}-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const visibleSections = generatedReport
    ? (filterCategory === 'all' ? generatedReport : generatedReport.filter(s => s.category === filterCategory))
    : null;

  return (
    <div className="h-full overflow-y-auto bg-slate-50">
      <div className="p-6 space-y-6 max-w-4xl mx-auto">

        <div>
          <h2 className="text-xl font-bold text-slate-900">Informes de Actividad</h2>
          <p className="text-sm text-slate-500 mt-0.5">Resúmenes automáticos — Simulación (conectar con Firebase para datos reales)</p>
        </div>

        {/* Period + generate */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-5">
          <h3 className="font-bold text-slate-800">Configurar Informe</h3>

          {/* Period selector */}
          <div className="flex gap-2">
            {(['diario', 'semanal', 'mensual'] as Period[]).map(p => (
              <button
                key={p}
                onClick={() => { setPeriod(p); setGeneratedReport(null); }}
                className={`flex-1 py-3 rounded-xl font-bold text-sm transition-all ${
                  period === p
                    ? 'bg-primary text-white shadow-sm shadow-primary/30'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {p.charAt(0).toUpperCase() + p.slice(1)}
              </button>
            ))}
          </div>

          {/* Quick stats */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {data.stats.map(s => (
              <div key={s.label} className={`rounded-xl p-3 flex items-center gap-3 ${s.color}`}>
                <span className="material-icons-round text-xl">{s.icon}</span>
                <div>
                  <p className="text-xl font-black leading-none">{s.value}</p>
                  <p className="text-[10px] font-medium opacity-80 leading-tight mt-0.5">{s.label}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Generate button */}
          <button
            onClick={generateReport}
            disabled={generating}
            className="w-full flex items-center justify-center gap-3 bg-primary hover:bg-primary/90 disabled:opacity-60 text-white font-black py-4 rounded-xl text-base transition-colors"
          >
            <span className="material-icons-round text-xl">{generating ? 'hourglass_empty' : 'summarize'}</span>
            {generating ? 'Generando informe completo...' : `Generar ${data.label}`}
          </button>
        </div>

        {/* Generated report */}
        {visibleSections !== null && (
          <div className="space-y-4">
            {/* Report header */}
            <div className="bg-slate-900 rounded-2xl p-5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-green-500/20 rounded-xl flex items-center justify-center">
                  <span className="material-icons-round text-green-400">check_circle</span>
                </div>
                <div>
                  <p className="font-black text-white">{data.label} — Generado</p>
                  <p className="text-xs text-slate-400">{new Date().toLocaleString('es-ES')}</p>
                </div>
              </div>
              <button
                onClick={downloadReport}
                className="flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-xl text-sm font-semibold transition-colors"
              >
                <span className="material-icons-round text-sm">download</span>
                Descargar
              </button>
            </div>

            {/* Category filter */}
            <div className="flex gap-1.5 flex-wrap">
              {(['all', 'operaciones', 'seguridad', 'fuego', 'accesos'] as const).map(cat => (
                <button
                  key={cat}
                  onClick={() => setFilterCategory(cat)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${
                    filterCategory === cat
                      ? 'bg-primary text-white'
                      : 'bg-white border border-slate-200 text-slate-600 hover:border-primary hover:text-primary'
                  }`}
                >
                  {cat === 'all' ? 'Todas las secciones' : cat.charAt(0).toUpperCase() + cat.slice(1)}
                </button>
              ))}
            </div>

            {/* Sections */}
            {visibleSections.map((section, i) => (
              <div key={i} className={`bg-white rounded-2xl border overflow-hidden ${CATEGORY_COLORS[section.category]}`}>
                <div className={`px-5 py-3 flex items-center gap-3 border-b ${CATEGORY_COLORS[section.category]}`}>
                  <span className="material-icons-round text-base">{section.icon}</span>
                  <h4 className="font-bold text-sm">{section.title}</h4>
                  <span className="ml-auto text-[10px] font-bold uppercase opacity-60">{section.category}</span>
                </div>
                <div className="px-5 py-4 text-sm text-slate-700 leading-relaxed whitespace-pre-line bg-white">
                  {section.content}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Integration note */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <div className="flex items-center gap-2 mb-3">
            <span className="material-icons-round text-slate-400">integration_instructions</span>
            <h3 className="font-bold text-slate-700 text-sm">Para conectar con datos reales</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-slate-500">
            <div className="flex items-start gap-2">
              <span className="material-icons-round text-blue-400 text-base shrink-0">cloud</span>
              <p><span className="font-semibold text-slate-700">Firebase Firestore</span> — estadísticas de vuelos, alarmas e incidencias históricas</p>
            </div>
            <div className="flex items-start gap-2">
              <span className="material-icons-round text-purple-400 text-base shrink-0">smart_toy</span>
              <p><span className="font-semibold text-slate-700">Gemini AI</span> — generación automática de resúmenes narrativos con análisis</p>
            </div>
            <div className="flex items-start gap-2">
              <span className="material-icons-round text-orange-400 text-base shrink-0">picture_as_pdf</span>
              <p><span className="font-semibold text-slate-700">jsPDF / Puppeteer</span> — exportación a PDF con logo y formato corporativo</p>
            </div>
            <div className="flex items-start gap-2">
              <span className="material-icons-round text-green-400 text-base shrink-0">schedule_send</span>
              <p><span className="font-semibold text-slate-700">Envío automático</span> — informes semanales/mensuales por email y Telegram</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
