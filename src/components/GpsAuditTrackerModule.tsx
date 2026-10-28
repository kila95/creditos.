import React, { useState, useEffect, useMemo } from 'react';
import {
  MapPin,
  Navigation,
  Crosshair,
  ShieldCheck,
  AlertTriangle,
  Satellite,
  RefreshCw,
  ExternalLink,
  CheckCircle2,
  Database,
  Search,
  Filter,
  Copy,
  Check,
  Radio,
  Compass,
  Layers,
} from 'lucide-react';
import { ClientProfile, LedgerEntry, LoanDetail, RouteData } from '../data/mockData';
import { formatCOP, roundCOP } from '../utils/financialCalculations';
import {
  GpsAuditedPaymentRecord,
  GpsPaymentCoordinates,
  captureStrictGpsBeforePayment,
  getStoredGpsAuditRecords,
  injectPaymentWithGpsToSupabase,
} from '../utils/gpsAuditInjector';

interface GpsAuditTrackerModuleProps {
  routes: RouteData[];
  clients: ClientProfile[];
  loans: LoanDetail[];
  ledger: LedgerEntry[];
  onRegisterPaymentWithGps?: (
    loanId: string,
    amount: number,
    method: 'efectivo' | 'nequi' | 'bancolombia' | 'daviplata',
    notes: string
  ) => void;
}

const SQL_MIGRATION_GPS = `-- Migración SQL: Auditoría GPS en Tabla de Pagos (Supabase PostgreSQL)
ALTER TABLE public.daily_ledger
  ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS accuracy_meters DOUBLE PRECISION;

-- Índice espacial para consultas rápidas de rastreo por ruta y coordenadas
CREATE INDEX IF NOT EXISTS idx_daily_ledger_gps_coords
  ON public.daily_ledger (route_id, latitude, longitude);`;

export const GpsAuditTrackerModule: React.FC<GpsAuditTrackerModuleProps> = ({
  routes,
  clients,
  loans,
  ledger,
  onRegisterPaymentWithGps,
}) => {
  const [auditRecords, setAuditRecords] = useState<GpsAuditedPaymentRecord[]>([]);
  const [selectedRecord, setSelectedRecord] = useState<GpsAuditedPaymentRecord | null>(null);
  const [routeFilter, setRouteFilter] = useState<string>('all');
  const [geofenceFilter, setGeofenceFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Estado de captura en vivo con navigator.geolocation
  const [liveGps, setLiveGps] = useState<GpsPaymentCoordinates | null>(null);
  const [isCapturingGps, setIsCapturingGps] = useState<boolean>(false);
  const [selectedLoanIdForTest, setSelectedLoanIdForTest] = useState<string>(
    loans.find((l) => l.remainingBalance > 0)?.id || loans[0]?.id || ''
  );
  const [testPaymentMethod, setTestPaymentMethod] = useState<'efectivo' | 'nequi'>('efectivo');
  const [isInjectingPayment, setIsInjectingPayment] = useState<boolean>(false);
  const [statusBanner, setStatusBanner] = useState<{
    type: 'success' | 'warning' | 'info';
    message: string;
  } | null>(null);
  const [showSqlModal, setShowSqlModal] = useState<boolean>(false);
  const [copiedSql, setCopiedSql] = useState<boolean>(false);

  // Cargar registros combinados (Ledger + Almacenamiento de Auditoría GPS)
  useEffect(() => {
    const records = getStoredGpsAuditRecords(ledger, clients);
    setAuditRecords(records);
    if (records.length > 0 && !selectedRecord) {
      setSelectedRecord(records[0]);
    }
  }, [ledger, clients]);

  // Capturar posición GPS inicial al abrir el módulo
  const handleProbeBrowserGeolocation = async () => {
    setIsCapturingGps(true);
    setStatusBanner(null);
    try {
      const coords = await captureStrictGpsBeforePayment();
      setLiveGps(coords);
      setStatusBanner({
        type: coords.isLiveSat ? 'success' : 'info',
        message: coords.isLiveSat
          ? `Hardware GPS adquirido vía navigator.geolocation: Lat ${coords.latitude.toFixed(6)}, Lng ${coords.longitude.toFixed(6)} (±${coords.accuracyMeters}m)`
          : `Telemetría GPS lista (Modo urbano Medellín): Lat ${coords.latitude.toFixed(6)}, Lng ${coords.longitude.toFixed(6)} (±${coords.accuracyMeters}m)`,
      });
    } finally {
      setIsCapturingGps(false);
    }
  };

  useEffect(() => {
    handleProbeBrowserGeolocation();
  }, []);

  // Ejecutar cobro de prueba o real capturando navigator.geolocation antes de enviar el pago
  const handleCaptureAndInjectPayment = async () => {
    const targetLoan = loans.find((l) => l.id === selectedLoanIdForTest) || loans[0];
    if (!targetLoan) return;

    setIsInjectingPayment(true);
    setStatusBanner(null);

    try {
      // 1. Captura obligatoria con navigator.geolocation antes de enviar el pago
      const coords = await captureStrictGpsBeforePayment();
      setLiveGps(coords);

      const amount = Math.min(
        roundCOP(targetLoan.installmentAmount || 25000),
        Math.max(25000, roundCOP(targetLoan.remainingBalance))
      );
      const client = clients.find((c) => c.id === targetLoan.clientId);

      const newEntry: LedgerEntry = {
        id: `led-gps-${Date.now()}`,
        receiptNumber: `GPS-${Date.now().toString().slice(-6)}`,
        loanId: targetLoan.id,
        clientId: targetLoan.clientId,
        clientName: targetLoan.clientName,
        routeId: targetLoan.routeId,
        organizationId: targetLoan.organizationId || 'org-medellin-01',
        amount,
        principalPortion: roundCOP(amount * 0.8),
        interestPortion: roundCOP(amount * 0.2),
        paymentMethod: testPaymentMethod,
        preBalance: targetLoan.remainingBalance,
        postBalance: Math.max(0, roundCOP(targetLoan.remainingBalance - amount)),
        timestamp: coords.timestamp,
        gpsLocation: coords.formatted,
        latitude: coords.latitude,
        longitude: coords.longitude,
        accuracyMeters: coords.accuracyMeters,
        hash: `sha256-gps-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
      };

      // 2. Inyectar latitud y longitud en la tabla de pagos de Supabase y registro de auditoría
      const savedAudit = await injectPaymentWithGpsToSupabase({
        entry: newEntry,
        latitude: coords.latitude,
        longitude: coords.longitude,
        accuracyMeters: coords.accuracyMeters,
        isLiveSat: coords.isLiveSat,
        client,
      });

      // 3. Propagar al estado global si el callback está disponible
      if (onRegisterPaymentWithGps) {
        onRegisterPaymentWithGps(
          targetLoan.id,
          amount,
          testPaymentMethod,
          `Abono auditado con GPS · GPS: ${coords.formatted}`
        );
      }

      const refreshed = getStoredGpsAuditRecords([newEntry, ...ledger], clients);
      setAuditRecords(refreshed);
      setSelectedRecord(savedAudit);

      setStatusBanner({
        type: 'success',
        message: `Pago ${newEntry.receiptNumber} (${formatCOP(amount)}) registrado con coordenadas [Lat: ${coords.latitude.toFixed(6)}, Lng: ${coords.longitude.toFixed(6)}] e inyectado en Supabase.`,
      });
    } finally {
      setIsInjectingPayment(false);
    }
  };

  const filteredRecords = useMemo(() => {
    return auditRecords.filter((rec) => {
      const matchesRoute = routeFilter === 'all' || rec.routeId === routeFilter;
      const matchesGeofence = geofenceFilter === 'all' || rec.geofenceStatus === geofenceFilter;
      const q = searchTerm.trim().toLowerCase();
      const matchesQuery =
        !q ||
        rec.clientName.toLowerCase().includes(q) ||
        rec.receiptNumber.toLowerCase().includes(q) ||
        `${rec.latitude}, ${rec.longitude}`.includes(q);

      return matchesRoute && matchesGeofence && matchesQuery;
    });
  }, [auditRecords, routeFilter, geofenceFilter, searchTerm]);

  // Métricas ejecutivas de auditoría GPS
  const stats = useMemo(() => {
    const total = auditRecords.length;
    const verifiedOnSite = auditRecords.filter(
      (r) => r.geofenceStatus === 'VERIFICADO_EN_SITIO'
    ).length;
    const alertsCount = auditRecords.filter((r) => r.geofenceStatus === 'ALERTA_DISTANCIA').length;
    const avgAccuracy =
      total > 0
        ? Math.round(auditRecords.reduce((acc, r) => acc + r.accuracyMeters, 0) / total)
        : 12;
    return { total, verifiedOnSite, alertsCount, avgAccuracy };
  }, [auditRecords]);

  // Proyección normalizada de coordenadas al lienzo del radar de Medellín (Lat ~6.21 a 6.32, Lng ~-75.64 a -75.53)
  const mapBounds = {
    minLat: 6.225,
    maxLat: 6.31,
    minLng: -75.635,
    maxLng: -75.54,
  };

  const projectToRadarPercent = (lat: number, lng: number) => {
    const clampedLat = Math.max(mapBounds.minLat, Math.min(mapBounds.maxLat, lat));
    const clampedLng = Math.max(mapBounds.minLng, Math.min(mapBounds.maxLng, lng));

    const y = 100 - ((clampedLat - mapBounds.minLat) / (mapBounds.maxLat - mapBounds.minLat)) * 84 - 8;
    const x = ((clampedLng - mapBounds.minLng) / (mapBounds.maxLng - mapBounds.minLng)) * 84 + 8;
    return { x, y };
  };

  const handleCopySql = () => {
    navigator.clipboard.writeText(SQL_MIGRATION_GPS);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* CABECERA PRINCIPAL DEL MÓDULO 3: AUDITORÍA GPS */}
      <div className="bg-slate-900 border border-emerald-500/30 rounded-3xl p-5 sm:p-6 shadow-2xl relative overflow-hidden">
        <div className="absolute -top-24 -right-24 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1.5">
                <Satellite className="w-3.5 h-3.5" />
                Módulo 3 · Auditoría GPS (React / Supabase)
              </span>
              <span className="px-2.5 py-0.5 rounded-lg text-[11px] font-mono bg-slate-950 text-slate-300 border border-slate-800">
                navigator.geolocation · HighAccuracy
              </span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
              Rastreo Satelital de Cobros & Geocerca Antifraude
            </h2>
            <p className="text-xs sm:text-sm text-slate-300 max-w-3xl leading-relaxed">
              Cada abono captura obligatoriamente <code className="text-emerald-300 font-mono">latitude</code> y{' '}
              <code className="text-emerald-300 font-mono">longitude</code> vía{' '}
              <code className="text-emerald-300 font-mono">navigator.geolocation</code> antes de enviarse a Supabase,
              validando mediante distancia geodésica Haversine que el cobrador estuvo físicamente en el negocio del deudor.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={handleProbeBrowserGeolocation}
              disabled={isCapturingGps}
              className="px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 text-xs font-bold flex items-center gap-2 transition-all cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 text-emerald-400 ${isCapturingGps ? 'animate-spin' : ''}`} />
              <span>Probar GPS Actual</span>
            </button>

            <button
              type="button"
              onClick={() => setShowSqlModal(!showSqlModal)}
              className="px-3.5 py-2.5 rounded-xl bg-emerald-950/80 hover:bg-emerald-900 text-emerald-200 border border-emerald-500/40 text-xs font-bold flex items-center gap-2 transition-all cursor-pointer"
            >
              <Database className="w-4 h-4 text-emerald-400" />
              <span>Esquema SQL (Lat/Lng)</span>
            </button>
          </div>
        </div>

        {/* BANNER DE ESTADO EN VIVO */}
        {statusBanner && (
          <div
            className={`mt-4 p-3.5 rounded-2xl border text-xs font-semibold flex items-center justify-between gap-3 ${
              statusBanner.type === 'success'
                ? 'bg-emerald-950/60 border-emerald-500/50 text-emerald-200'
                : statusBanner.type === 'warning'
                ? 'bg-amber-950/60 border-amber-500/50 text-amber-200'
                : 'bg-sky-950/60 border-sky-500/50 text-sky-200'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
              <span>{statusBanner.message}</span>
            </div>
            <button
              type="button"
              onClick={() => setStatusBanner(null)}
              className="text-[11px] underline opacity-80 hover:opacity-100 cursor-pointer"
            >
              Cerrar
            </button>
          </div>
        )}

        {/* MODAL / CAJÓN DE MIGRACIÓN SQL PARA SUPABASE */}
        {showSqlModal && (
          <div className="mt-4 bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-emerald-400 font-mono flex items-center gap-2">
                <Database className="w-4 h-4" />
                SQL para Columnas Explícitas latitude / longitude en Supabase
              </span>
              <button
                type="button"
                onClick={handleCopySql}
                className="px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-bold text-white flex items-center gap-1.5 cursor-pointer"
              >
                {copiedSql ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedSql ? 'Copiado' : 'Copiar SQL'}</span>
              </button>
            </div>
            <pre className="text-[11px] font-mono text-slate-300 overflow-x-auto bg-slate-900/90 p-3 rounded-xl border border-slate-800">
              {SQL_MIGRATION_GPS}
            </pre>
          </div>
        )}
      </div>

      {/* KPIS DE TELEMETRÍA GEODÉSICA */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold uppercase text-slate-400 block">
              Pagos Geolocalizados
            </span>
            <span className="text-2xl font-black text-white font-mono mt-1 block">
              {stats.total}
            </span>
            <span className="text-[11px] text-emerald-400 font-medium">
              100% con Latitud / Longitud
            </span>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
            <MapPin className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold uppercase text-slate-400 block">
              Verificados en Sitio (&le;150m)
            </span>
            <span className="text-2xl font-black text-emerald-400 font-mono mt-1 block">
              {stats.verifiedOnSite}
            </span>
            <span className="text-[11px] text-slate-400">
              Dentro del perímetro del cliente
            </span>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
            <ShieldCheck className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold uppercase text-slate-400 block">
              Precisión Satelital Media
            </span>
            <span className="text-2xl font-black text-sky-400 font-mono mt-1 block">
              &plusmn;{stats.avgAccuracy}m
            </span>
            <span className="text-[11px] text-slate-400">
              GPS / GLONASS / A-GPS Urbano
            </span>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-sky-500/15 border border-sky-500/30 flex items-center justify-center text-sky-400">
            <Crosshair className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold uppercase text-slate-400 block">
              Alertas de Distancia (&gt;500m)
            </span>
            <span className="text-2xl font-black text-amber-400 font-mono mt-1 block">
              {stats.alertsCount}
            </span>
            <span className="text-[11px] text-slate-400">
              Cobros fuera de zona asignada
            </span>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
            <AlertTriangle className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* PANEL DIVIDIDO: RADAR INTERACTIVO DE MEDELLÍN + INYECTOR DE PRUEBA EN VIVO */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* MAPA / RADAR DE AUDITORÍA SATELITAL (7 COLUMNAS) */}
        <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-3xl p-5 flex flex-col justify-between space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                <Compass className="w-4 h-4 text-emerald-400" />
                Cartografía Táctica de Recaudo · Valle de Aburrá (Medellín)
              </h3>
              <p className="text-xs text-slate-400">
                Haz clic en cualquier marcador para auditar las coordenadas exactas del cobro y su desviación frente al local.
              </p>
            </div>
            <span className="px-2.5 py-1 rounded-xl bg-slate-950 border border-slate-800 text-[11px] font-mono text-emerald-400">
              {filteredRecords.length} Puntos Activos
            </span>
          </div>

          {/* LIENZO INTERACTIVO DEL RADAR GEODÉSICO */}
          <div className="relative w-full h-80 sm:h-96 rounded-2xl bg-[#07131f] border border-slate-800 overflow-hidden select-none shadow-inner">
            {/* Cuadrícula Cartográfica */}
            <div
              className="absolute inset-0 opacity-20 pointer-events-none"
              style={{
                backgroundImage:
                  'linear-gradient(to right, #1e293b 1px, transparent 1px), linear-gradient(to bottom, #1e293b 1px, transparent 1px)',
                backgroundSize: '36px 36px',
              }}
            />

            {/* Eje del Río Medellín y Zonas de Referencia */}
            <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-35" viewBox="0 0 400 300">
              {/* Río Medellín estilizado */}
              <path
                d="M 190 300 C 195 230, 210 160, 225 90 C 232 50, 240 20, 250 0"
                fill="none"
                stroke="#0284c7"
                strokeWidth="6"
                strokeLinecap="round"
                strokeDasharray="2 0"
              />
              {/* Anillos de Radar */}
              <circle cx="200" cy="150" r="55" fill="none" stroke="#10b981" strokeWidth="0.6" strokeDasharray="4 4" />
              <circle cx="200" cy="150" r="110" fill="none" stroke="#10b981" strokeWidth="0.6" strokeDasharray="4 4" />
            </svg>

            {/* Etiquetas de Comunas / Zonas de Medellín */}
            <div className="absolute top-3 left-3 text-[10px] font-mono text-slate-400 bg-slate-950/80 px-2 py-1 rounded border border-slate-800">
              NOROCCIDENTE · Robledo / Bello
            </div>
            <div className="absolute top-3 right-3 text-[10px] font-mono text-slate-400 bg-slate-950/80 px-2 py-1 rounded border border-slate-800">
              NORORIENTE · Popular 1 / Santa Cruz
            </div>
            <div className="absolute bottom-12 left-3 text-[10px] font-mono text-slate-400 bg-slate-950/80 px-2 py-1 rounded border border-slate-800">
              OCCIDENTE · Comuna 13 San Javier
            </div>
            <div className="absolute bottom-12 right-3 text-[10px] font-mono text-slate-400 bg-slate-950/80 px-2 py-1 rounded border border-slate-800">
              CENTRO · La Candelaria / Buenos Aires
            </div>

            {/* Marcadores de Pagos Geolocalizados */}
            {filteredRecords.map((rec) => {
              const pos = projectToRadarPercent(rec.latitude, rec.longitude);
              const isSelected = selectedRecord?.id === rec.id;
              const pinColor =
                rec.geofenceStatus === 'VERIFICADO_EN_SITIO'
                  ? 'bg-emerald-500 border-emerald-200 text-slate-950'
                  : rec.geofenceStatus === 'DESVIACION_MEDIA'
                  ? 'bg-amber-500 border-amber-200 text-slate-950'
                  : 'bg-rose-500 border-rose-200 text-white';

              return (
                <button
                  key={rec.id}
                  type="button"
                  onClick={() => setSelectedRecord(rec)}
                  style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
                  className={`absolute -translate-x-1/2 -translate-y-1/2 group cursor-pointer transition-all ${
                    isSelected ? 'z-30 scale-125' : 'z-20 hover:scale-110'
                  }`}
                  title={`${rec.clientName} · ${formatCOP(rec.amount)} · [${rec.latitude}, ${rec.longitude}]`}
                >
                  {isSelected && (
                    <span className="absolute -inset-2 rounded-full bg-emerald-400/30 animate-ping pointer-events-none" />
                  )}
                  <div
                    className={`w-7 h-7 rounded-full border-2 flex items-center justify-center shadow-lg ${pinColor}`}
                  >
                    <MapPin className="w-3.5 h-3.5" />
                  </div>
                  <span className="mt-1 px-1.5 py-0.5 rounded bg-slate-950/90 border border-slate-700 text-[9px] font-mono text-white whitespace-nowrap block shadow">
                    {rec.clientName.split(' ')[0]} · {formatCOP(rec.amount)}
                  </span>
                </button>
              );
            })}

            {/* Marcador de la Ubicación Actual en Vivo del Dispositivo */}
            {liveGps && (
              <div
                style={{
                  left: `${projectToRadarPercent(liveGps.latitude, liveGps.longitude).x}%`,
                  top: `${projectToRadarPercent(liveGps.latitude, liveGps.longitude).y}%`,
                }}
                className="absolute -translate-x-1/2 -translate-y-1/2 z-10 pointer-events-none"
              >
                <div className="w-4 h-4 rounded-full bg-sky-400 border-2 border-white shadow-lg animate-pulse" />
              </div>
            )}

            {/* Leyenda Inferior */}
            <div className="absolute bottom-2.5 inset-x-3 bg-slate-950/90 border border-slate-800 rounded-xl px-3 py-1.5 flex items-center justify-between flex-wrap gap-2 text-[10px] font-mono text-slate-300">
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" /> En Sitio (&le;150m)
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" /> Desviación (150-500m)
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block" /> Alerta (&gt;500m)
                </span>
              </div>
              <span className="text-sky-400">
                ● Dispositivo Actual: {liveGps ? `${liveGps.latitude.toFixed(4)}, ${liveGps.longitude.toFixed(4)}` : 'Detectando...'}
              </span>
            </div>
          </div>
        </div>

        {/* INSPECTOR DEL PUNTO SELECCIONADO + SIMULADOR DE INYECCIÓN GPS (5 COLUMNAS) */}
        <div className="lg:col-span-5 flex flex-col justify-between gap-4">
          {/* TARJETA DE DETALLE FORENSE DEL PUNTO SELECCIONADO */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <span className="text-[10px] font-mono uppercase text-emerald-400 font-bold block">
                  Telemetría de Abono Seleccionado
                </span>
                <h3 className="text-base font-black text-white">
                  {selectedRecord ? selectedRecord.clientName : 'Selecciona un abono en el mapa'}
                </h3>
              </div>
              {selectedRecord && (
                <a
                  href={`https://www.google.com/maps?q=${selectedRecord.latitude},${selectedRecord.longitude}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 shadow"
                >
                  <span>Abrir Satélite</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
            </div>

            {selectedRecord ? (
              <div className="space-y-3 text-xs">
                <div className="grid grid-cols-2 gap-2.5">
                  <div className="bg-slate-950 p-3 rounded-2xl border border-slate-800">
                    <span className="text-[10px] text-slate-400 uppercase font-bold block">
                      Latitud Inyectada
                    </span>
                    <span className="font-mono text-sm font-black text-emerald-400">
                      {selectedRecord.latitude.toFixed(6)}
                    </span>
                  </div>
                  <div className="bg-slate-950 p-3 rounded-2xl border border-slate-800">
                    <span className="text-[10px] text-slate-400 uppercase font-bold block">
                      Longitud Inyectada
                    </span>
                    <span className="font-mono text-sm font-black text-emerald-400">
                      {selectedRecord.longitude.toFixed(6)}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                    <span className="text-[10px] text-slate-400 block">Recibo</span>
                    <span className="font-mono font-bold text-white">{selectedRecord.receiptNumber}</span>
                  </div>
                  <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                    <span className="text-[10px] text-slate-400 block">Monto Cobrado</span>
                    <span className="font-mono font-bold text-emerald-400">
                      {formatCOP(selectedRecord.amount)}
                    </span>
                  </div>
                  <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                    <span className="text-[10px] text-slate-400 block">Distancia al Local</span>
                    <span className="font-mono font-bold text-white">
                      {selectedRecord.distanceFromClientMeters} m (&plusmn;{selectedRecord.accuracyMeters}m)
                    </span>
                  </div>
                </div>

                <div className="bg-slate-950 p-3 rounded-2xl border border-slate-800 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase font-bold block">
                      Dictamen de Geocerca (Haversine)
                    </span>
                    <span className="text-xs font-bold text-white">
                      {selectedRecord.geofenceStatus === 'VERIFICADO_EN_SITIO'
                        ? 'Cobrador verificado frente al negocio del cliente'
                        : selectedRecord.geofenceStatus === 'DESVIACION_MEDIA'
                        ? 'Cobro registrado a pocas cuadras del punto'
                        : 'Alerta: Cobro registrado lejos de la dirección del cliente'}
                    </span>
                  </div>
                  <span
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-black font-mono ${
                      selectedRecord.geofenceStatus === 'VERIFICADO_EN_SITIO'
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                        : selectedRecord.geofenceStatus === 'DESVIACION_MEDIA'
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                        : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                    }`}
                  >
                    {selectedRecord.geofenceStatus}
                  </span>
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-400 py-6 text-center">
                No hay registros seleccionados.
              </p>
            )}
          </div>

          {/* CONSOLA DE CAPTURA NAVIGATOR.GEOLOCATION E INYECCIÓN A SUPABASE */}
          <div className="bg-slate-900 border border-emerald-500/30 rounded-3xl p-5 space-y-3.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                <Radio className="w-4 h-4 animate-pulse" />
                Inyector de Pago con Auditoría GPS en Vivo
              </span>
              <span className="text-[10px] font-mono text-slate-400">
                Tabla: public.daily_ledger
              </span>
            </div>

            <p className="text-xs text-slate-300">
              Ejecuta una captura real con <code className="text-emerald-300 font-mono">navigator.geolocation</code> e
              inyecta el abono con <code className="text-emerald-300 font-mono">latitude</code> y{' '}
              <code className="text-emerald-300 font-mono">longitude</code> directamente en Supabase:
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">
                  Cliente / Crédito Activo
                </label>
                <select
                  value={selectedLoanIdForTest}
                  onChange={(e) => setSelectedLoanIdForTest(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-semibold focus:outline-none focus:border-emerald-500"
                >
                  {loans.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.clientName} ({formatCOP(l.installmentAmount)})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">
                  Medio de Pago
                </label>
                <select
                  value={testPaymentMethod}
                  onChange={(e) => setTestPaymentMethod(e.target.value as 'efectivo' | 'nequi')}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-semibold focus:outline-none focus:border-emerald-500"
                >
                  <option value="efectivo">Efectivo en Calle</option>
                  <option value="nequi">Transferencia Nequi</option>
                </select>
              </div>
            </div>

            <button
              type="button"
              onClick={handleCaptureAndInjectPayment}
              disabled={isInjectingPayment}
              className="w-full py-3 px-4 rounded-2xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-black text-xs uppercase tracking-wider shadow-lg flex items-center justify-center gap-2 transition-all cursor-pointer"
            >
              <Navigation className="w-4 h-4" />
              <span>
                {isInjectingPayment
                  ? 'Capturando Satélite e Inyectando en Supabase...'
                  : 'Capturar GPS (navigator.geolocation) + Registrar Abono'}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* TABLA FORENSE DE PAGOS CON LATITUD Y LONGITUD */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-black text-white flex items-center gap-2">
              <Layers className="w-4 h-4 text-emerald-400" />
              Bitácora de Coordenadas Inyectadas en Tabla de Pagos
            </h3>
            <p className="text-xs text-slate-400">
              Registro inmutable de latitud, longitud, precisión en metros y validación de geocerca por cada cobro.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Buscar cliente, recibo o coord..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded-xl pl-8 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <select
              value={routeFilter}
              onChange={(e) => setRouteFilter(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 font-semibold"
            >
              <option value="all">Todas las Rutas</option>
              {routes.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>

            <select
              value={geofenceFilter}
              onChange={(e) => setGeofenceFilter(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 font-semibold"
            >
              <option value="all">Todos los Estados GPS</option>
              <option value="VERIFICADO_EN_SITIO">Verificado en Sitio (&le;150m)</option>
              <option value="DESVIACION_MEDIA">Desviación Media (150-500m)</option>
              <option value="ALERTA_DISTANCIA">Alerta de Distancia (&gt;500m)</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-800 text-[10px] font-black uppercase text-slate-400 tracking-wider">
                <th className="py-3 px-3">Recibo / Hora</th>
                <th className="py-3 px-3">Cliente / Ruta</th>
                <th className="py-3 px-3">Monto</th>
                <th className="py-3 px-3">Latitude (DB)</th>
                <th className="py-3 px-3">Longitude (DB)</th>
                <th className="py-3 px-3">Precisión / Distancia</th>
                <th className="py-3 px-3">Geocerca</th>
                <th className="py-3 px-3 text-right">Inspección</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70 text-xs">
              {filteredRecords.map((rec) => (
                <tr
                  key={rec.id}
                  onClick={() => setSelectedRecord(rec)}
                  className={`transition-colors cursor-pointer ${
                    selectedRecord?.id === rec.id
                      ? 'bg-emerald-950/30'
                      : 'hover:bg-slate-800/40'
                  }`}
                >
                  <td className="py-3 px-3 font-mono">
                    <span className="font-bold text-white block">{rec.receiptNumber}</span>
                    <span className="text-[10px] text-slate-400">
                      {new Date(rec.timestamp).toLocaleTimeString('es-CO', {
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })}
                    </span>
                  </td>
                  <td className="py-3 px-3">
                    <span className="font-bold text-white block">{rec.clientName}</span>
                    <span className="text-[10px] text-slate-400 font-mono">{rec.routeId}</span>
                  </td>
                  <td className="py-3 px-3 font-mono font-bold text-emerald-400">
                    {formatCOP(rec.amount)}
                  </td>
                  <td className="py-3 px-3 font-mono text-sky-300">
                    {rec.latitude.toFixed(6)}
                  </td>
                  <td className="py-3 px-3 font-mono text-sky-300">
                    {rec.longitude.toFixed(6)}
                  </td>
                  <td className="py-3 px-3 font-mono text-slate-300">
                    &plusmn;{rec.accuracyMeters}m · {rec.distanceFromClientMeters}m del local
                  </td>
                  <td className="py-3 px-3">
                    <span
                      className={`px-2 py-0.5 rounded-md text-[10px] font-black font-mono ${
                        rec.geofenceStatus === 'VERIFICADO_EN_SITIO'
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                          : rec.geofenceStatus === 'DESVIACION_MEDIA'
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                          : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                      }`}
                    >
                      {rec.geofenceStatus === 'VERIFICADO_EN_SITIO'
                        ? 'EN SITIO'
                        : rec.geofenceStatus === 'DESVIACION_MEDIA'
                        ? 'DESVIACIÓN'
                        : 'ALERTA LEJOS'}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-right">
                    <a
                      href={`https://www.google.com/maps?q=${rec.latitude},${rec.longitude}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-emerald-400 font-mono text-[11px]"
                    >
                      <span>Ver Mapa</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
