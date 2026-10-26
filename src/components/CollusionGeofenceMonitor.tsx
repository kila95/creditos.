import React, { useState } from 'react';
import { 
  ShieldAlert, 
  MapPin, 
  AlertTriangle, 
  Navigation, 
  CheckCircle2, 
  XCircle, 
  UserX, 
  Search,
  Radar
} from 'lucide-react';
import { RouteData, ClientProfile, LoanDetail, LedgerEntry } from '../data/mockData';
import { 
  detectCollectorCollusionPatterns, 
  validateCollectionGeofence, 
  calculateHaversineDistance,
  CollusionAlert 
} from '../utils/geofenceSecurity';

interface CollusionGeofenceMonitorProps {
  routes: RouteData[];
  clients: ClientProfile[];
  loans: LoanDetail[];
  ledger: LedgerEntry[];
  onClose?: () => void;
}

export const CollusionGeofenceMonitor: React.FC<CollusionGeofenceMonitorProps> = ({
  routes,
  clients,
  loans,
  ledger,
  onClose
}) => {
  const [activeTab, setActiveTab] = useState<'collusion' | 'geofence'>('collusion');
  
  // Coordenadas simuladas para probar geocerca interactiva
  const [selectedClientForGeofence, setSelectedClientForGeofence] = useState<string>(clients[0]?.id || 'cli-1');
  // Coordenada del cobrador simulada (ej. Comuna 13)
  const [collectorSimLat, setCollectorSimLat] = useState<number>(6.2520);
  const [collectorSimLng, setCollectorSimLng] = useState<number>(-75.6140);

  const client = clients.find(c => c.id === selectedClientForGeofence) || clients[0];
  const collusionAlerts: CollusionAlert[] = detectCollectorCollusionPatterns(routes, clients, loans, ledger);

  const geofenceResult = validateCollectionGeofence(
    collectorSimLat,
    collectorSimLng,
    client.lat,
    client.lng,
    100 // 100 metros tolerancia
  );

  return (
    <div className="space-y-6">
      {/* HEADER DE CIBERSEGURIDAD */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
                Cybersecurity & Anti-Fraud Center
              </span>
              <span className="text-xs text-slate-400 font-mono">Auditoría Territorial Forense</span>
            </div>
            <h2 className="text-2xl font-bold text-white tracking-tight mt-1 flex items-center gap-2">
              <ShieldAlert className="w-6 h-6 text-rose-400" />
              Detección de Colusión & Geocercas (Geofencing)
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Inspección de fraude cobrador-cliente, prórrogas sospechosas y validación presencial por GPS (Haversine &lt; 100m).
            </p>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <span className="px-3 py-1.5 rounded-xl bg-rose-950/40 border border-rose-800/40 text-rose-300 font-bold">
              {collusionAlerts.length} casos de riesgo detectados
            </span>
          </div>
        </div>

        {/* SELECTOR DE PESTAÑAS */}
        <div className="flex gap-2 mt-4 text-xs">
          <button
            onClick={() => setActiveTab('collusion')}
            className={`px-4 py-2 rounded-xl font-bold flex items-center gap-1.5 transition-all ${
              activeTab === 'collusion'
                ? 'bg-rose-600 text-white shadow-md shadow-rose-950'
                : 'bg-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            <UserX className="w-4 h-4" />
            1. Detección Forense de Colusión ({collusionAlerts.length})
          </button>

          <button
            onClick={() => setActiveTab('geofence')}
            className={`px-4 py-2 rounded-xl font-bold flex items-center gap-1.5 transition-all ${
              activeTab === 'geofence'
                ? 'bg-rose-600 text-white shadow-md shadow-rose-950'
                : 'bg-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            <Radar className="w-4 h-4" />
            2. Validador de Geocercas GPS (&lt;100m)
          </button>
        </div>
      </div>

      {/* CONTENIDO TAB 1: COLUSIÓN COBRADOR-CLIENTE */}
      {activeTab === 'collusion' && (
        <div className="space-y-4">
          {collusionAlerts.map(alert => (
            <div
              key={alert.id}
              className="bg-slate-900 border border-slate-800 hover:border-rose-800/60 rounded-2xl p-5 shadow-xl transition-all space-y-3"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <span className={`px-2.5 py-0.5 rounded text-[10px] font-black uppercase ${
                    alert.severity === 'CRITICA'
                      ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                      : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                  }`}>
                    {alert.patternType.replace(/_/g, ' ')}
                  </span>
                  <span className="font-bold text-white text-sm">{alert.tradeName} ({alert.clientName})</span>
                </div>

                <div className="flex items-center gap-3 text-xs">
                  <span className="text-slate-400">Cobrador Asignado: <strong className="text-white">{alert.collectorName}</strong></span>
                  <span className="text-rose-400 font-mono font-bold">Riesgo: {alert.riskScore}/100</span>
                </div>
              </div>

              <div className="text-xs text-slate-300 leading-relaxed">
                <strong>Evidencia Forense:</strong> {alert.evidence}
              </div>

              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-xs flex items-start gap-2 text-rose-200">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold block text-white text-[11px]">Acción de Auditoría Recomendada:</span>
                  <p className="text-[11px] text-slate-300 mt-0.5">{alert.recommendedAuditAction}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* CONTENIDO TAB 2: GEOCERCAS GPS */}
      {activeTab === 'geofence' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Navigation className="w-5 h-5 text-emerald-400" />
              Simulador & Verificador de Geocercas en Medellín
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              La aplicación móvil del cobrador valida que el dispositivo esté a menos de 100 metros del local comercial registrado.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 text-xs">
            {/* SELECTOR DE CLIENTE Y COORDENADAS REGISTRADAS */}
            <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800 space-y-3">
              <span className="text-slate-400 font-medium block">1. Negocio Destino del Cliente:</span>
              <select
                value={selectedClientForGeofence}
                onChange={(e) => setSelectedClientForGeofence(e.target.value)}
                className="w-full bg-slate-800 text-white rounded-lg p-2.5 border border-slate-700"
              >
                {clients.map(c => (
                  <option key={c.id} value={c.id}>{c.tradeName} — {c.neighborhood}</option>
                ))}
              </select>

              <div className="space-y-1 text-[11px] text-slate-400 pt-2 border-t border-slate-800">
                <div>Dirección: <strong className="text-slate-200">{client.address}</strong></div>
                <div>Coordenadas registradas: <strong className="text-slate-200 font-mono">{client.lat}° N, {client.lng}° W</strong></div>
              </div>
            </div>

            {/* SIMULADOR DE POSICIÓN DEL COBRADOR */}
            <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800 space-y-3">
              <span className="text-slate-400 font-medium block">2. Posición GPS Actual del Cobrador:</span>
              
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    // Cerca (< 30m)
                    setCollectorSimLat(client.lat + 0.0001);
                    setCollectorSimLng(client.lng + 0.0001);
                  }}
                  className="p-2 bg-slate-800 hover:bg-slate-700 text-emerald-300 font-semibold rounded-lg text-center border border-slate-700"
                >
                  Simular "En el Local" (~25m)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    // Lejos (> 350m)
                    setCollectorSimLat(client.lat + 0.0035);
                    setCollectorSimLng(client.lng + 0.0035);
                  }}
                  className="p-2 bg-slate-800 hover:bg-slate-700 text-rose-300 font-semibold rounded-lg text-center border border-slate-700"
                >
                  Simular "Remoto / Fuera" (~420m)
                </button>
              </div>

              <div className="text-[11px] text-slate-400 font-mono pt-1">
                GPS Dispositivo: {collectorSimLat.toFixed(5)}° N, {collectorSimLng.toFixed(5)}° W
              </div>
            </div>
          </div>

          {/* RESULTADO DE LA VALIDACIÓN DE GEOCERCA */}
          <div className={`p-5 rounded-2xl border flex items-center justify-between ${
            geofenceResult.isWithinGeofence
              ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-300'
              : 'bg-rose-950/40 border-rose-500/50 text-rose-300'
          }`}>
            <div className="flex items-center gap-3">
              {geofenceResult.isWithinGeofence ? (
                <CheckCircle2 className="w-8 h-8 text-emerald-400 shrink-0" />
              ) : (
                <XCircle className="w-8 h-8 text-rose-400 shrink-0" />
              )}
              <div>
                <span className="font-black uppercase tracking-wider text-xs block">
                  {geofenceResult.isWithinGeofence
                    ? 'VISITA PRESENCIAL CERTIFICADA (<100m)'
                    : 'BLOQUEO POR DISTANCIA (FUERA DE GEOCERCA)'}
                </span>
                <p className="text-xs text-slate-200 mt-0.5 leading-relaxed">
                  {geofenceResult.message}
                </p>
              </div>
            </div>

            <div className="text-right shrink-0">
              <span className="text-[10px] block uppercase opacity-80">Distancia Medida</span>
              <span className="text-2xl font-black font-mono">
                {geofenceResult.distanceMeters} m
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
