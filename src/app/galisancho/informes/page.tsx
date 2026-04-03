'use client';

import { useState, useCallback } from 'react';
import { collection, query, orderBy, limit, getDocs, doc, setDoc, getDoc, deleteDoc, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useEffect } from 'react';
import Link from 'next/link';

// ── Tipos ─────────────────────────────────────────────────────────────────────
interface ReportData {
  id: string;
  periodo: string;
  desde: string;
  hasta: string;
  stats: {
    totalMisiones: number;
    completadas: number;
    enProceso: number;
    totalAnimales: number;
    totalPersonas: number;
    totalVehiculos: number;
    mediaAnimales: string;
    mejorVuelo: string | null;
  };
  misiones: {
    id: string; nombre: string; estado: string; fecha: string; hora: string;
    animales: number; personas: number; vehiculos: number; altitud: string; duracion: string;
  }[];
  graficaVuelos: { label: string; animales: number }[];
  mapItems: { tipo: string; nombre: string; tag: string | null }[];
  insights: { text: string; category: string }[];
  conversaciones: { user: string; bot: string }[];
  resumenIA: string;
  generadoEn: string;
}

// InformeGuardado extiende ReportData con los metadatos de Firestore
interface InformeGuardado extends ReportData {
  createdAt: any;
}

interface Schedule {
  activo: boolean;
  frecuencia: 'semanal' | 'mensual';
  email: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function getDefaultRange(tipo: string) {
  const hoy = new Date();
  if (tipo === 'semana') {
    const lunes = new Date(hoy);
    const dow = hoy.getDay();
    lunes.setDate(hoy.getDate() - (dow === 0 ? 6 : dow - 1));
    return { desde: lunes.toISOString().split('T')[0], hasta: hoy.toISOString().split('T')[0] };
  }
  if (tipo === 'mes') {
    return {
      desde: new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString().split('T')[0],
      hasta: hoy.toISOString().split('T')[0],
    };
  }
  if (tipo === 'mes_anterior') {
    const m = hoy.getMonth() - 1;
    const y = m < 0 ? hoy.getFullYear() - 1 : hoy.getFullYear();
    const mm = m < 0 ? 11 : m;
    return {
      desde: new Date(y, mm, 1).toISOString().split('T')[0],
      hasta: new Date(y, mm + 1, 0).toISOString().split('T')[0],
    };
  }
  return { desde: '', hasta: '' };
}

// Parsea el resumen de Gemini en secciones
function parseSecciones(texto: string): { titulo: string; contenido: string }[] {
  const secciones: { titulo: string; contenido: string }[] = [];
  const partes = texto.split(/^## /m).filter(Boolean);
  for (const parte of partes) {
    const nl = parte.indexOf('\n');
    if (nl === -1) continue;
    secciones.push({
      titulo: parte.slice(0, nl).trim(),
      contenido: parte.slice(nl + 1).trim(),
    });
  }
  return secciones;
}

// Renderiza markdown básico (**bold**)
function renderMd(text: string) {
  const parts = text.split(/\*\*([^*]+)\*\*/g);
  return parts.map((p, i) => i % 2 === 1 ? <strong key={i}>{p}</strong> : p);
}

// ── Componente gráfica de barras (SVG inline) ─────────────────────────────────
function BarChart({ data }: { data: { label: string; animales: number }[] }) {
  if (!data.length) return <p className="text-slate-400 text-sm">Sin datos de vuelos.</p>;
  const max = Math.max(...data.map(d => d.animales), 1);
  return (
    <div className="w-full overflow-x-auto">
      <div className="flex items-end gap-2 min-w-0" style={{ minHeight: 120 }}>
        {data.map((d, i) => (
          <div key={i} className="flex flex-col items-center gap-1 flex-1 min-w-[28px]">
            <span className="text-[10px] font-bold text-amber-700">{d.animales}</span>
            <div
              className="w-full rounded-t-sm bg-amber-400"
              style={{ height: `${Math.max((d.animales / max) * 88, 4)}px`, minHeight: 4 }}
            />
            <span className="text-[9px] text-slate-400 text-center leading-tight">{d.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Página principal ──────────────────────────────────────────────────────────
export default function InformesPage() {
  const [periodo, setPeriodo] = useState<'semana' | 'mes' | 'mes_anterior' | 'custom'>('mes');
  const [rango, setRango] = useState(getDefaultRange('mes'));
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<ReportData | null>(null);
  const [error, setError] = useState('');
  const [email, setEmail] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [informesGuardados, setInformesGuardados] = useState<InformeGuardado[]>([]);
  const [activeSection, setActiveSection] = useState<'nuevo' | 'historial' | 'programar'>('nuevo');

  // Programación
  const [schedule, setSchedule] = useState<Schedule>({ activo: false, frecuencia: 'semanal', email: '' });
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [scheduleSaved, setScheduleSaved] = useState(false);

  // Cargar historial + programación
  useEffect(() => {
    getDocs(query(collection(db, 'ai_informes'), orderBy('createdAt', 'desc'), limit(10)))
      .then(snap => setInformesGuardados(snap.docs.map(d => ({
        id:            d.id,
        createdAt:     d.data().createdAt,
        // Campos completos de ReportData guardados en Firestore
        periodo:       d.data().periodo       ?? '',
        desde:         d.data().desde         ?? '',
        hasta:         d.data().hasta         ?? '',
        stats:         d.data().stats         ?? {},
        misiones:      d.data().misiones       ?? [],
        graficaVuelos: d.data().graficaVuelos ?? [],
        mapItems:      d.data().mapItems       ?? [],
        insights:      d.data().insights       ?? [],
        conversaciones: [],                          // no se necesita en historial
        resumenIA:     d.data().resumenIA      ?? '',
        generadoEn:    d.data().generadoEn    ?? '',
      }) as InformeGuardado)))
      .catch(() => {});
    // Cargar programación guardada
    getDoc(doc(db, 'report_schedules', 'galisancho'))
      .then(snap => { if (snap.exists()) setSchedule(snap.data() as Schedule); })
      .catch(() => {});
  }, [report]);

  function handlePeriodoChange(p: 'semana' | 'mes' | 'mes_anterior' | 'custom') {
    setPeriodo(p);
    if (p !== 'custom') setRango(getDefaultRange(p));
  }

  async function generarInforme() {
    if (!rango.desde || !rango.hasta) return;
    setLoading(true);
    setError('');
    setReport(null);
    setEnviado(false);
    try {
      const res = await fetch('/api/galisancho/informes/datos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ desde: rango.desde, hasta: rango.hasta, periodo }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Error generando informe');
      setReport(data);
    } catch (e: any) {
      setError(e.message || 'Error desconocido');
    } finally {
      setLoading(false);
    }
  }

  async function descargarPDF() {
    if (!report) return;
    const pdf = await buildPDF(report);
    pdf.save(`informe-galisancho-${report.periodo.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()}.pdf`);
  }

  // Carga un informe guardado directamente desde Firestore (sin llamar a Antonia de nuevo)
  function verInformeGuardado(inf: InformeGuardado) {
    setReport(inf as ReportData);
    setEnviado(false);
    setActiveSection('nuevo');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function borrarInforme(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm('¿Eliminar este informe del historial?')) return;
    try {
      await deleteDoc(doc(db, 'ai_informes', id));
      setInformesGuardados(prev => prev.filter(i => i.id !== id));
      if (report?.id === id) setReport(null);
    } catch (err) { console.error(err); }
  }

  async function guardarProgramacion() {
    setScheduleLoading(true);
    setScheduleSaved(false);
    try {
      await setDoc(doc(db, 'report_schedules', 'galisancho'), {
        ...schedule,
        updatedAt: Timestamp.now(),
      });
      setScheduleSaved(true);
      setTimeout(() => setScheduleSaved(false), 3000);
    } catch (e) {
      console.error(e);
    } finally {
      setScheduleLoading(false);
    }
  }

  async function enviarEmail() {
    if (!report || !email) return;
    setEnviando(true);
    setEmailError('');
    try {
      const pdf = await buildPDF(report);
      const pdfBase64 = pdf.output('datauristring').split(',')[1];
      const res = await fetch('/api/galisancho/informes/enviar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, pdfBase64, periodo: report.periodo, generadoEn: report.generadoEn }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Error enviando email');
      setEnviado(true);
    } catch (e: any) {
      setEmailError(e.message || 'Error enviando. Revisa la configuración RESEND_API_KEY.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="flex flex-col h-full bg-slate-50 overflow-hidden">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-4 py-4 shrink-0">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center">
            <span className="material-icons-round text-amber-600 text-lg">summarize</span>
          </div>
          <div>
            <h1 className="font-black text-slate-800 text-lg leading-tight">Informes de gestión</h1>
            <p className="text-xs text-slate-400">Resúmenes generados por Antonia con datos reales de la finca</p>
          </div>
        </div>
        {/* Tabs */}
        <div className="flex gap-2 mt-3 flex-wrap">
          {[
            { key: 'nuevo',     label: 'Nuevo informe' },
            { key: 'historial', label: `Historial (${informesGuardados.length})` },
            { key: 'programar', label: schedule.activo ? '⏰ Programado' : 'Programar' },
          ].map(t => (
            <button key={t.key} onClick={() => setActiveSection(t.key as any)}
              className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${activeSection === t.key ? 'bg-amber-500 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {activeSection === 'historial' ? (
          /* ── Historial ── */
          <div className="space-y-2">
            {informesGuardados.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
                <span className="material-icons-round text-slate-300 text-4xl">history</span>
                <p className="text-slate-400 text-sm mt-2">Aún no hay informes generados.</p>
              </div>
            ) : informesGuardados.map(inf => (
              <div key={inf.id} className="bg-white rounded-2xl border border-slate-200 p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
                  <span className="material-icons-round text-amber-500 text-xl">picture_as_pdf</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-slate-700 text-sm truncate">{inf.periodo || `Informe ${inf.desde?.slice(0,10)}`}</p>
                  <p className="text-xs text-slate-400">
                    {inf.misiones?.length ?? 0} misiones · {inf.generadoEn || inf.desde?.slice(0,10)}
                  </p>
                </div>
                <div className="flex gap-1.5 shrink-0">
                  <button onClick={() => verInformeGuardado(inf)}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-amber-50 text-amber-600 hover:bg-amber-100 text-xs font-bold transition-all border border-amber-200">
                    <span className="material-icons-round text-sm">visibility</span>
                    Ver
                  </button>
                  <button onClick={(e) => borrarInforme(inf.id, e)}
                    className="flex items-center gap-1 px-2 py-1.5 rounded-xl bg-red-50 text-red-400 hover:bg-red-100 text-xs font-bold transition-all border border-red-200">
                    <span className="material-icons-round text-sm">delete</span>
                  </button>
                </div>
              </div>
            ))}
          </div>

        ) : activeSection === 'programar' ? (
          /* ── Programar ── */
          <div className="space-y-4">
            <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-4">
              <h2 className="font-bold text-slate-700 text-sm flex items-center gap-2">
                <span className="material-icons-round text-amber-500 text-base">schedule</span>
                Envío automático de informes
              </h2>
              <p className="text-xs text-slate-400 leading-relaxed">
                Antonia generará y enviará el informe automáticamente al correo indicado con la frecuencia elegida.
              </p>

              {/* Toggle activo */}
              <div className="flex items-center justify-between bg-slate-50 rounded-xl px-4 py-3">
                <div>
                  <p className="text-sm font-bold text-slate-700">Envío automático</p>
                  <p className="text-xs text-slate-400">{schedule.activo ? 'Activado' : 'Desactivado'}</p>
                </div>
                <button
                  onClick={() => setSchedule(s => ({ ...s, activo: !s.activo }))}
                  className={`relative w-12 h-6 rounded-full transition-colors ${schedule.activo ? 'bg-amber-500' : 'bg-slate-300'}`}
                >
                  <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all ${schedule.activo ? 'left-7' : 'left-1'}`} />
                </button>
              </div>

              {/* Frecuencia */}
              <div className="space-y-2">
                <label className="text-[11px] text-slate-500 font-semibold uppercase tracking-wide">Frecuencia</label>
                <div className="flex gap-2">
                  {[
                    { key: 'semanal', label: 'Semanal', sub: 'Cada lunes' },
                    { key: 'mensual', label: 'Mensual', sub: 'Día 1 de cada mes' },
                  ].map(f => (
                    <button key={f.key} onClick={() => setSchedule(s => ({ ...s, frecuencia: f.key as any }))}
                      className={`flex-1 rounded-xl border py-3 text-center transition-all ${schedule.frecuencia === f.key ? 'border-amber-400 bg-amber-50' : 'border-slate-200 bg-white hover:bg-slate-50'}`}>
                      <p className={`text-sm font-bold ${schedule.frecuencia === f.key ? 'text-amber-600' : 'text-slate-700'}`}>{f.label}</p>
                      <p className="text-[10px] text-slate-400">{f.sub}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Email */}
              <div className="space-y-2">
                <label className="text-[11px] text-slate-500 font-semibold uppercase tracking-wide">Correo destinatario</label>
                <input
                  type="email"
                  placeholder="correo@ejemplo.com"
                  value={schedule.email}
                  onChange={e => setSchedule(s => ({ ...s, email: e.target.value }))}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-amber-300 focus:border-amber-400 outline-none"
                />
              </div>

              {/* Guardar */}
              <button onClick={guardarProgramacion} disabled={scheduleLoading || !schedule.email}
                className="w-full bg-amber-500 hover:bg-amber-600 disabled:opacity-40 text-white font-bold py-2.5 rounded-xl flex items-center justify-center gap-2 text-sm transition-all active:scale-[.98]">
                {scheduleLoading ? (
                  <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                ) : scheduleSaved ? (
                  <><span className="material-icons-round text-base">check_circle</span> Guardado</>
                ) : (
                  <><span className="material-icons-round text-base">save</span> Guardar programación</>
                )}
              </button>
            </div>

          </div>

        ) : (
          /* ── Nuevo informe ── */
          <>
            {/* Configuración del período */}
            <div className="bg-white rounded-2xl border border-slate-200 p-4">
              <h2 className="font-bold text-slate-700 text-sm mb-3 flex items-center gap-2">
                <span className="material-icons-round text-amber-500 text-base">date_range</span>
                Período del informe
              </h2>
              <div className="flex flex-wrap gap-2 mb-3">
                {[
                  { key: 'semana', label: 'Esta semana' },
                  { key: 'mes', label: 'Este mes' },
                  { key: 'mes_anterior', label: 'Mes anterior' },
                  { key: 'custom', label: 'Personalizado' },
                ].map(p => (
                  <button key={p.key} onClick={() => handlePeriodoChange(p.key as any)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${periodo === p.key ? 'bg-amber-500 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
                    {p.label}
                  </button>
                ))}
              </div>
              {periodo === 'custom' && (
                <div className="flex gap-2 flex-wrap">
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] text-slate-400 font-semibold uppercase tracking-wide">Desde</label>
                    <input type="date" value={rango.desde} onChange={e => setRango(r => ({ ...r, desde: e.target.value }))}
                      className="border border-slate-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-amber-300 focus:border-amber-400 outline-none" />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] text-slate-400 font-semibold uppercase tracking-wide">Hasta</label>
                    <input type="date" value={rango.hasta} onChange={e => setRango(r => ({ ...r, hasta: e.target.value }))}
                      className="border border-slate-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-amber-300 focus:border-amber-400 outline-none" />
                  </div>
                </div>
              )}
              {rango.desde && rango.hasta && (
                <p className="text-xs text-slate-400 mt-2">
                  {new Date(rango.desde).toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })} —{' '}
                  {new Date(rango.hasta).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}
                </p>
              )}
            </div>

            {/* Botón generar */}
            <button onClick={generarInforme} disabled={loading || !rango.desde || !rango.hasta}
              className="w-full bg-amber-500 hover:bg-amber-600 disabled:opacity-40 text-white font-bold py-3 rounded-2xl flex items-center justify-center gap-2 transition-all active:scale-[.98] shadow-sm">
              {loading ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  Generando informe con Antonia…
                </>
              ) : (
                <>
                  <span className="material-icons-round text-xl">auto_awesome</span>
                  Generar informe
                </>
              )}
            </button>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-2xl px-4 py-3 text-sm text-red-700 flex items-center gap-2">
                <span className="material-icons-round text-red-400 text-base">error_outline</span>
                {error}
              </div>
            )}

            {/* ── Vista previa del informe ── */}
            {report && <ReportPreview report={report} />}

            {/* ── Acciones: descargar + email ── */}
            {report && (
              <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-4">
                <h2 className="font-bold text-slate-700 text-sm flex items-center gap-2">
                  <span className="material-icons-round text-amber-500 text-base">share</span>
                  Exportar informe
                </h2>
                <button onClick={descargarPDF}
                  className="w-full bg-slate-800 hover:bg-slate-700 text-white font-bold py-2.5 rounded-xl flex items-center justify-center gap-2 text-sm transition-all active:scale-[.98]">
                  <span className="material-icons-round text-base">download</span>
                  Descargar PDF
                </button>
                <div className="space-y-2">
                  <label className="text-[11px] text-slate-500 font-semibold uppercase tracking-wide">Enviar por email</label>
                  <div className="flex gap-2">
                    <input
                      type="email"
                      placeholder="correo@ejemplo.com"
                      value={email}
                      onChange={e => { setEmail(e.target.value); setEnviado(false); setEmailError(''); }}
                      className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-amber-300 focus:border-amber-400 outline-none"
                    />
                    <button onClick={enviarEmail} disabled={enviando || !email || enviado}
                      className="bg-amber-500 hover:bg-amber-600 disabled:opacity-40 text-white font-bold px-4 py-2 rounded-xl text-sm flex items-center gap-1.5 transition-all active:scale-[.98] whitespace-nowrap">
                      {enviando ? (
                        <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                      ) : enviado ? (
                        <><span className="material-icons-round text-base">check_circle</span> Enviado</>
                      ) : (
                        <><span className="material-icons-round text-base">send</span> Enviar</>
                      )}
                    </button>
                  </div>
                  {emailError && <p className="text-xs text-red-500">{emailError}</p>}
                  {enviado && <p className="text-xs text-green-600 font-medium">✓ Informe enviado correctamente a {email}</p>}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Componente vista previa ────────────────────────────────────────────────────
function ReportPreview({ report }: { report: ReportData }) {
  const secciones = parseSecciones(report.resumenIA);
  const seccionIcons: Record<string, string> = {
    'Resumen del período':    'summarize',
    'Actividad ganadera':     'pets',
    'Estado de la finca':     'landscape',
    'Aspectos a destacar':    'star',
    'Recomendaciones':        'tips_and_updates',
  };

  const [mapImg, setMapImg] = useState<string | null>(null);
  const [mapLoading, setMapLoading] = useState(true);

  useEffect(() => {
    fetch('/api/galisancho/informes/mapa')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.image) setMapImg(d.image); })
      .catch(() => {})
      .finally(() => setMapLoading(false));
  }, []);

  return (
    <div className="space-y-4">
      {/* Stats cards */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {[
          { icon: 'flight_takeoff', label: 'Vuelos',     value: report.stats.totalMisiones, sub: `${report.stats.completadas} completados` },
          { icon: 'pets',           label: 'Animales',   value: report.stats.totalAnimales,  sub: `Media: ${report.stats.mediaAnimales}/vuelo` },
          { icon: 'person',         label: 'Personas',   value: report.stats.totalPersonas,  sub: 'detectadas' },
          { icon: 'directions_car', label: 'Vehículos',  value: report.stats.totalVehiculos, sub: 'detectados' },
          { icon: 'place',          label: 'Zonas mapa', value: report.mapItems.length,       sub: 'marcadas' },
          { icon: 'psychology',     label: 'Aprendizajes', value: report.insights.length,   sub: 'registrados' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-2xl border border-slate-200 p-3 flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
              <span className="material-icons-round text-amber-500 text-base">{s.icon}</span>
            </div>
            <div>
              <p className="text-xl font-black text-slate-800 leading-tight">{s.value}</p>
              <p className="text-[10px] text-slate-400 font-medium">{s.label}</p>
              <p className="text-[10px] text-slate-300">{s.sub}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Gráfica de vuelos */}
      {report.graficaVuelos.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <h3 className="font-bold text-slate-700 text-sm mb-3 flex items-center gap-2">
            <span className="material-icons-round text-amber-500 text-base">bar_chart</span>
            Animales detectados por vuelo
          </h3>
          <BarChart data={report.graficaVuelos} />
        </div>
      )}

      {/* Mapa de la finca */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="material-icons-round text-amber-500 text-base">satellite_alt</span>
            <h3 className="font-bold text-slate-700 text-sm">Finca Galisancho — Cáceres</h3>
          </div>
          <Link href="/galisancho/mapa"
            className="flex items-center gap-1 text-xs text-amber-500 hover:text-amber-600 font-bold transition-colors">
            Ver mapa completo
            <span className="material-icons-round text-sm">open_in_new</span>
          </Link>
        </div>
        {mapLoading ? (
          <div className="h-44 flex items-center justify-center bg-slate-50">
            <span className="w-5 h-5 border-2 border-amber-300 border-t-amber-500 rounded-full animate-spin" />
          </div>
        ) : mapImg ? (
          <div className="relative">
            <img src={mapImg} alt="Mapa Finca Galisancho" className="w-full object-cover" style={{ maxHeight: 200 }} />
            {/* Overlay con zonas marcadas */}
            {report.mapItems.length > 0 && (
              <div className="absolute bottom-2 left-2 right-2 flex flex-wrap gap-1">
                {report.mapItems.slice(0, 5).map((pin, i) => (
                  <span key={i} className="bg-black/60 backdrop-blur-sm text-white text-[10px] font-medium px-2 py-0.5 rounded-full flex items-center gap-1">
                    <span className="material-icons-round text-[10px]">place</span>
                    {pin.nombre}
                  </span>
                ))}
                {report.mapItems.length > 5 && (
                  <span className="bg-black/60 backdrop-blur-sm text-white text-[10px] font-medium px-2 py-0.5 rounded-full">
                    +{report.mapItems.length - 5} más
                  </span>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="h-44 flex flex-col items-center justify-center bg-slate-50 gap-2">
            <span className="material-icons-round text-slate-300 text-3xl">map</span>
            <p className="text-slate-400 text-xs">No se pudo cargar el mapa</p>
          </div>
        )}
      </div>

      {/* Resumen de Antonia por secciones */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="bg-gradient-to-r from-amber-500 to-amber-600 px-4 py-3 flex items-center gap-2">
          <img src="/assets/antonia-avatar.png" alt="Antonia" className="w-7 h-7 rounded-full border-2 border-white/50 object-cover"
            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          <div>
            <p className="text-white font-bold text-sm">Resumen de Antonia</p>
            <p className="text-white/70 text-[10px]">{report.periodo}</p>
          </div>
        </div>
        <div className="divide-y divide-slate-100">
          {secciones.map((sec, i) => (
            <div key={i} className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="material-icons-round text-amber-400 text-base">
                  {seccionIcons[sec.titulo] ?? 'chevron_right'}
                </span>
                <h4 className="font-bold text-slate-700 text-sm">{sec.titulo}</h4>
              </div>
              <div className="text-sm text-slate-600 leading-relaxed space-y-1">
                {sec.contenido.split('\n').map((line, j) => {
                  const isBullet = line.trim().startsWith('-') || line.trim().startsWith('•') || line.trim().match(/^\d+\./);
                  return line.trim() ? (
                    <p key={j} className={isBullet ? 'pl-3' : ''}>
                      {renderMd(line.trim())}
                    </p>
                  ) : null;
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Tabla de misiones */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
          <span className="material-icons-round text-amber-500 text-base">flight_takeoff</span>
          <h3 className="font-bold text-slate-700 text-sm">Misiones del período ({report.misiones.length})</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                {['Fecha', 'Misión', 'Estado', 'Animales', 'Personas', 'Altitud', ''].map(h => (
                  <th key={h} className="px-3 py-2 text-left text-slate-500 font-semibold uppercase tracking-wide text-[10px] whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {report.misiones.map((m, i) => (
                <tr key={i} className="hover:bg-amber-50/30 transition-colors">
                  <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{m.fecha}</td>
                  <td className="px-3 py-2 text-slate-700 font-medium truncate max-w-[120px]">{m.nombre}</td>
                  <td className="px-3 py-2">
                    <span className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                      m.estado === 'completed' ? 'bg-green-100 text-green-700' :
                      m.estado === 'processing' || m.estado === 'starting' ? 'bg-amber-100 text-amber-700' :
                      'bg-slate-100 text-slate-500'
                    }`}>{m.estado === 'completed' ? 'OK' : m.estado}</span>
                  </td>
                  <td className="px-3 py-2 text-slate-700 font-bold">{m.animales}</td>
                  <td className="px-3 py-2 text-slate-500">{m.personas}</td>
                  <td className="px-3 py-2 text-slate-500">{m.altitud}</td>
                  <td className="px-3 py-2">
                    <Link href={`/mision/${m.id}`}
                      className="flex items-center gap-0.5 text-amber-500 hover:text-amber-600 font-bold text-[10px] whitespace-nowrap transition-colors">
                      <span className="material-icons-round text-sm">open_in_new</span>
                    </Link>
                  </td>
                </tr>
              ))}
              {report.misiones.length === 0 && (
                <tr><td colSpan={6} className="px-3 py-6 text-center text-slate-400">Sin misiones en este período.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Zonas del mapa */}
      {report.mapItems.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <h3 className="font-bold text-slate-700 text-sm mb-3 flex items-center gap-2">
            <span className="material-icons-round text-amber-500 text-base">place</span>
            Zonas marcadas en el mapa ({report.mapItems.length})
          </h3>
          <div className="flex flex-wrap gap-2">
            {report.mapItems.map((pin, i) => (
              <div key={i} className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5">
                <span className="material-icons-round text-slate-400 text-sm">place</span>
                <div>
                  <p className="text-xs font-semibold text-slate-700">{pin.nombre}</p>
                  {pin.tag && <p className="text-[10px] text-slate-400">{pin.tag}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pie */}
      <div className="text-center py-2">
        <p className="text-[11px] text-slate-300">Generado el {report.generadoEn} · dlos.ai / Finca Galisancho</p>
      </div>
    </div>
  );
}

// ── Obtener imagen del mapa via proxy server-side (evita CORS) ─────────────────
async function fetchMapImage(): Promise<string | null> {
  try {
    const res = await fetch('/api/galisancho/informes/mapa');
    if (!res.ok) return null;
    const { image } = await res.json();
    return image ?? null;
  } catch { return null; }
}

// ── Generador de PDF (client-side con jsPDF) ───────────────────────────────────
async function buildPDF(report: ReportData) {
  const { jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;

  // Pre-carga mapa en paralelo con la inicialización del doc
  const mapImagePromise = fetchMapImage();

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W = 210;
  const MARGIN = 15;
  const CONTENT_W = W - MARGIN * 2;
  const AMBER = [245, 158, 11] as [number, number, number];
  const SLATE8 = [30, 41, 59] as [number, number, number];
  const SLATE5 = [100, 116, 139] as [number, number, number];
  const SLATE1 = [248, 250, 252] as [number, number, number];

  // ── Portada ──────────────────────────────────────────────────────────────────
  doc.setFillColor(...AMBER);
  doc.rect(0, 0, W, 70, 'F');
  doc.setFillColor(214, 138, 10);
  doc.rect(0, 60, W, 10, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(28);
  doc.setFont('helvetica', 'bold');
  doc.text('FINCA GALISANCHO', MARGIN, 28);
  doc.setFontSize(13);
  doc.setFont('helvetica', 'normal');
  doc.text('Informe de gestión', MARGIN, 37);
  doc.setFontSize(11);
  doc.text(report.periodo, MARGIN, 46);

  doc.setFontSize(9);
  doc.setTextColor(255, 255, 255, 0.7);
  doc.text(`Generado el ${report.generadoEn} · dlos.ai`, MARGIN, 57);

  // Estadísticas en portada
  let y = 85;
  doc.setTextColor(...SLATE8);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Estadísticas del período', MARGIN, y);
  y += 8;

  const statsGrid = [
    ['Vuelos totales', String(report.stats.totalMisiones)],
    ['Completados', String(report.stats.completadas)],
    ['Animales detectados', String(report.stats.totalAnimales)],
    ['Media por vuelo', String(report.stats.mediaAnimales)],
    ['Personas detectadas', String(report.stats.totalPersonas)],
    ['Vehículos detectados', String(report.stats.totalVehiculos)],
  ];

  const colW = CONTENT_W / 3;
  statsGrid.forEach(([label, value], i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const x = MARGIN + col * colW;
    const yy = y + row * 22;

    doc.setFillColor(...SLATE1);
    doc.roundedRect(x, yy, colW - 3, 18, 2, 2, 'F');
    doc.setTextColor(...AMBER);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text(value, x + 4, yy + 11);
    doc.setTextColor(...SLATE5);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(label, x + 4, yy + 16);
  });
  y += 55;

  if (report.stats.mejorVuelo) {
    doc.setFillColor(255, 251, 235);
    doc.roundedRect(MARGIN, y, CONTENT_W, 12, 2, 2, 'F');
    doc.setTextColor(...AMBER);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('Vuelo destacado:', MARGIN + 3, y + 8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...SLATE8);
    doc.text(report.stats.mejorVuelo.slice(0, 80), MARGIN + 35, y + 8);
    y += 18;
  }

  // ── Imagen del mapa (espera el resultado del fetch) ──────────────────────
  const mapImage = await mapImagePromise;
  if (mapImage) {
    y += 4;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...SLATE8);
    doc.text('Ubicación — Finca Galisancho', MARGIN, y);
    y += 5;
    try {
      const mapH = 52;
      doc.addImage(mapImage, 'PNG', MARGIN, y, CONTENT_W, mapH);
      // Marco sutil
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.3);
      doc.rect(MARGIN, y, CONTENT_W, mapH);
      y += mapH + 8;
    } catch { /* si falla la imagen, seguimos sin ella */ }
  }

  // ── Gráfica de barras ─────────────────────────────────────────────────────
  if (report.graficaVuelos.length > 0) {
    y += 4;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...SLATE8);
    doc.text('Animales detectados por vuelo', MARGIN, y);
    y += 8;

    const chartH = 35;
    const chartW = CONTENT_W;
    const maxVal = Math.max(...report.graficaVuelos.map(d => d.animales), 1);
    const barW = Math.min(chartW / report.graficaVuelos.length - 2, 15);
    const startX = MARGIN;

    // Fondo
    doc.setFillColor(...SLATE1);
    doc.rect(startX, y, chartW, chartH, 'F');

    report.graficaVuelos.forEach((d, i) => {
      const bh = Math.max((d.animales / maxVal) * (chartH - 8), 2);
      const bx = startX + i * (chartW / report.graficaVuelos.length) + 1;
      const by = y + chartH - bh - 4;
      doc.setFillColor(...AMBER);
      doc.rect(bx, by, barW, bh, 'F');
      if (d.animales > 0) {
        doc.setFontSize(6);
        doc.setTextColor(...SLATE8);
        doc.text(String(d.animales), bx + barW / 2, by - 1, { align: 'center' });
      }
    });
    y += chartH + 8;
  }

  // ── Página 2: Resumen ejecutivo de Antonia ────────────────────────────────
  doc.addPage();
  y = MARGIN;

  doc.setFillColor(...AMBER);
  doc.rect(0, 0, W, 12, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('INFORME FINCA GALISANCHO · RESUMEN EJECUTIVO', MARGIN, 8);

  y = 22;
  doc.setTextColor(...SLATE8);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('Resumen ejecutivo — Antonia', MARGIN, y);
  y += 8;

  const secciones = parseSecciones(report.resumenIA);
  for (const sec of secciones) {
    if (y > 260) { doc.addPage(); y = MARGIN + 10; }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...AMBER);
    doc.text(sec.titulo, MARGIN, y);
    y += 5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...SLATE8);
    const lines = doc.splitTextToSize(sec.contenido.replace(/\*\*/g, ''), CONTENT_W);
    doc.text(lines, MARGIN, y);
    y += lines.length * 4.5 + 6;
  }

  // ── Página 3: Tabla de misiones ───────────────────────────────────────────
  doc.addPage();

  doc.setFillColor(...AMBER);
  doc.rect(0, 0, W, 12, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('INFORME FINCA GALISANCHO · MISIONES', MARGIN, 8);

  autoTable(doc, {
    startY: 20,
    head: [['Fecha', 'Misión', 'Estado', 'Animales', 'Personas', 'Alt.', 'Ver']],
    body: report.misiones.map(m => [
      m.fecha,
      m.nombre.slice(0, 24),
      m.estado === 'completed' ? 'OK' : m.estado,
      m.animales,
      m.personas,
      m.altitud,
      'Abrir →',
    ]),
    headStyles: { fillColor: AMBER, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
    bodyStyles: { fontSize: 8, textColor: SLATE8 },
    alternateRowStyles: { fillColor: SLATE1 },
    margin: { left: MARGIN, right: MARGIN },
    styles: { cellPadding: 2.5 },
    columnStyles: { 6: { textColor: [245, 158, 11], fontStyle: 'bold', cellWidth: 18 } },
    // Añade link clicable en la columna "Ver" de cada fila
    didDrawCell: (data: any) => {
      if (data.column.index === 6 && data.cell.section === 'body') {
        const mId = report.misiones[data.row.index]?.id;
        if (mId) {
          doc.link(
            data.cell.x,
            data.cell.y,
            data.cell.width,
            data.cell.height,
            { url: `https://dlosai.vercel.app/mision/${mId}` }
          );
        }
      }
    },
  });

  // ── Página 4: Zonas del mapa + Aprendizajes ───────────────────────────────
  if (report.mapItems.length > 0 || report.insights.length > 0) {
    doc.addPage();
    doc.setFillColor(...AMBER);
    doc.rect(0, 0, W, 12, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('INFORME FINCA GALISANCHO · ZONAS Y APRENDIZAJES', MARGIN, 8);

    y = 22;
    if (report.mapItems.length > 0) {
      doc.setTextColor(...SLATE8);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text(`Zonas marcadas en el mapa (${report.mapItems.length})`, MARGIN, y);
      y += 6;
      autoTable(doc, {
        startY: y,
        head: [['Tipo', 'Nombre', 'Etiqueta']],
        body: report.mapItems.map(p => [p.tipo ?? '—', p.nombre, p.tag ?? '—']),
        headStyles: { fillColor: AMBER, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
        bodyStyles: { fontSize: 8, textColor: SLATE8 },
        alternateRowStyles: { fillColor: SLATE1 },
        margin: { left: MARGIN, right: MARGIN },
        styles: { cellPadding: 2.5 },
      });
      y = (doc as any).lastAutoTable.finalY + 10;
    }

    if (report.insights.length > 0) {
      if (y > 240) { doc.addPage(); y = MARGIN + 10; }
      doc.setTextColor(...SLATE8);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text('Aprendizajes registrados por Antonia', MARGIN, y);
      y += 6;
      autoTable(doc, {
        startY: y,
        head: [['Categoría', 'Aprendizaje']],
        body: report.insights.map(i => [i.category, i.text]),
        headStyles: { fillColor: [71, 85, 105], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
        bodyStyles: { fontSize: 8, textColor: SLATE8 },
        alternateRowStyles: { fillColor: SLATE1 },
        margin: { left: MARGIN, right: MARGIN },
        styles: { cellPadding: 2.5 },
        columnStyles: { 0: { cellWidth: 30 }, 1: { cellWidth: CONTENT_W - 30 } },
      });
    }
  }

  // ── Footer en todas las páginas ───────────────────────────────────────────
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFillColor(248, 250, 252);
    doc.rect(0, 287, W, 10, 'F');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...SLATE5);
    doc.text('dlos.ai · Finca Galisancho · Gestión ganadera inteligente', MARGIN, 293);
    doc.text(`Pág. ${p} / ${totalPages}`, W - MARGIN, 293, { align: 'right' });
  }

  return doc;
}
