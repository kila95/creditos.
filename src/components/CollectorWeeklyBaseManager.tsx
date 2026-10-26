import React, { useState } from 'react';
import { 
  Wallet, 
  Calendar, 
  UserCheck, 
  CheckCircle2, 
  RotateCcw, 
  ShieldCheck, 
  Coins, 
  ArrowUpRight,
  Clock
} from 'lucide-react';
import { RouteData, CollectorBase } from '../data/mockData';
import { formatCOP } from '../utils/financialCalculations';

interface CollectorWeeklyBaseManagerProps {
  routes: RouteData[];
  collectorBases: CollectorBase[];
  onAssignBase: (newBase: CollectorBase) => Promise<void> | void;
  onUpdateBaseStatus: (baseId: string, status: 'ACTIVA' | 'DEVUELTA') => Promise<void> | void;
}

// Mapeo determinístico de IDs de usuario cobrador (Supabase Auth / RBAC) por ruta
const ROUTE_COLLECTOR_UUID_MAP: Record<string, string> = {
  'route-1': 'usr-collector-004',
  'route-2': 'usr-collector-005',
  'route-3': 'usr-collector-006',
  'route-4': 'usr-collector-007',
};

function getCurrentMondayISO(): string {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(now.setDate(diff));
  return monday.toISOString().split('T')[0];
}

export const CollectorWeeklyBaseManager: React.FC<CollectorWeeklyBaseManagerProps> = ({
  routes,
  collectorBases,
  onAssignBase,
  onUpdateBaseStatus,
}) => {
  const [selectedRouteId, setSelectedRouteId] = useState<string>(routes[0]?.id || 'route-1');
  const [amount, setAmount] = useState<number>(500000);
  const [weekStartDate, setWeekStartDate] = useState<string>(getCurrentMondayISO());
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const selectedRoute = routes.find((r) => r.id === selectedRouteId) || routes[0];
  const selectedCollectorId = ROUTE_COLLECTOR_UUID_MAP[selectedRouteId] || `usr-${selectedRouteId}`;

  const activeBasesTotal = collectorBases
    .filter((b) => b.status === 'ACTIVA')
    .reduce((acc, b) => acc + b.amount, 0);

  const handleAssignSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRoute || amount <= 0) return;

    setIsSubmitting(true);
    setSuccessMessage(null);

    const newBase: CollectorBase = {
      id: `base-${Date.now()}`,
      collectorId: selectedCollectorId,
      collectorName: selectedRoute.collectorName,
      routeId: selectedRoute.id,
      amount: Number(amount),
      weekStartDate,
      status: 'ACTIVA',
      createdAt: new Date().toISOString(),
    };

    try {
      await onAssignBase(newBase);
      setSuccessMessage(
        `Base semanal de ${formatCOP(amount)} asignada a ${selectedRoute.collectorName} (${selectedRoute.code}) en estado ACTIVA.`
      );
      setTimeout(() => setSuccessMessage(null), 5000);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
      {/* ENCABEZADO DEL MÓDULO */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5" />
              Tabla: public.collector_bases (RLS Activo)
            </span>
            <span className="text-xs text-slate-400 font-mono">Fondeo de Liquidez en Ruta</span>
          </div>
          <h3 className="text-lg font-bold text-white mt-1 flex items-center gap-2">
            <Wallet className="w-5 h-5 text-emerald-400" />
            Gestión de Bases Semanales para Cobradores (Ruteros)
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Asigna el capital operativo inicial de la semana a cada cobrador. El monto se sincroniza en tiempo real con el panel del rutero y su arqueo de turno.
          </p>
        </div>

        {/* TOTAL EN PODER DE COBRADORES */}
        <div className="bg-slate-950 border border-emerald-500/30 rounded-xl px-4 py-2.5 flex items-center gap-3 shrink-0">
          <div className="w-9 h-9 rounded-lg bg-emerald-500/15 text-emerald-400 flex items-center justify-center">
            <Coins className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold block">
              Capital Total en Bases Activas
            </span>
            <span className="text-base font-black text-emerald-400 font-mono">
              {formatCOP(activeBasesTotal)} COP
            </span>
          </div>
        </div>
      </div>

      {/* CONTENIDO EN 2 COLUMNAS: FORMULARIO DE ASIGNACIÓN + TABLA DE BASES */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mt-5">
        {/* COLUMNA IZQUIERDA: FORMULARIO DE ASIGNACIÓN DE BASE SEMANAL */}
        <form onSubmit={handleAssignSubmit} className="lg:col-span-5 bg-slate-950/70 border border-slate-800 rounded-xl p-4 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-2.5">
            <span className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
              <UserCheck className="w-4 h-4 text-emerald-400" />
              Asignar Nueva Base Semanal
            </span>
            <span className="text-[10px] font-mono text-slate-400">Moneda: COP ($)</span>
          </div>

          {/* SELECCIÓN DE COBRADOR */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              1. Seleccionar Cobrador (Rutero) y Zona
            </label>
            <select
              value={selectedRouteId}
              onChange={(e) => setSelectedRouteId(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white font-semibold focus:outline-none focus:border-emerald-500"
            >
              {routes.map((route) => (
                <option key={route.id} value={route.id}>
                  {route.collectorName} — {route.name} ({route.code})
                </option>
              ))}
            </select>
            <div className="flex items-center justify-between text-[10px] text-slate-400 mt-1 font-mono">
              <span>collector_id: {selectedCollectorId}</span>
              <span>Ruta: {selectedRoute?.code}</span>
            </div>
          </div>

          {/* MONTO DE LA BASE EN COP */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              2. Valor de la Base Semanal Entregada (COP)
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-2.5 text-xs font-bold text-emerald-400">$</span>
              <input
                type="number"
                min={50000}
                step={10000}
                required
                value={amount}
                onChange={(e) => setAmount(Number(e.target.value))}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-8 pr-4 py-2.5 text-sm font-black text-white font-mono focus:outline-none focus:border-emerald-500"
              />
            </div>

            {/* BOTONES RÁPIDOS DE MONTO */}
            <div className="grid grid-cols-4 gap-1.5 mt-2">
              {[300000, 500000, 800000, 1000000].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setAmount(preset)}
                  className={`py-1.5 rounded-lg text-[11px] font-mono font-bold border transition-all ${
                    amount === preset
                      ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  ${(preset / 1000).toFixed(0)}k
                </button>
              ))}
            </div>
          </div>

          {/* FECHA DE INICIO DE LA SEMANA */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              3. Fecha de Inicio de Semana (week_start_date)
            </label>
            <div className="relative">
              <Calendar className="w-4 h-4 text-slate-400 absolute left-3.5 top-2.5" />
              <input
                type="date"
                required
                value={weekStartDate}
                onChange={(e) => setWeekStartDate(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-10 pr-4 py-2 text-xs text-white font-mono focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          {successMessage && (
            <div className="bg-emerald-950/60 border border-emerald-500/40 rounded-xl p-3 text-xs text-emerald-300 flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* BOTÓN ASIGNAR BASE */}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-lg shadow-emerald-950/60 flex items-center justify-center gap-2 transition-all cursor-pointer"
          >
            <Wallet className="w-4 h-4" />
            {isSubmitting ? 'Guardando en Base de Datos...' : `Asignar Base (${formatCOP(amount)} COP)`}
          </button>
        </form>

        {/* COLUMNA DERECHA: CONTROL DE BASES ENTREGADAS (ACTIVA / DEVUELTA) */}
        <div className="lg:col-span-7 flex flex-col justify-between bg-slate-950/50 border border-slate-800 rounded-xl p-4">
          <div>
            <div className="flex items-center justify-between border-b border-slate-800 pb-2.5 mb-3">
              <span className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-emerald-400" />
                Historial y Estado de Bases Semanales (`collector_bases`)
              </span>
              <span className="text-[11px] text-slate-400">
                {collectorBases.filter((b) => b.status === 'ACTIVA').length} Activa(s) • {collectorBases.length} Total
              </span>
            </div>

            {collectorBases.length === 0 ? (
              <div className="text-center py-10 px-4 border border-dashed border-slate-800 rounded-xl">
                <Wallet className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                <p className="text-xs font-bold text-slate-300">
                  No hay bases semanales asignadas todavía
                </p>
                <p className="text-[11px] text-slate-500 mt-1 max-w-md mx-auto">
                  Selecciona un cobrador a la izquierda, ingresa el capital inicial (ej. $500.000 COP) y haz clic en "Asignar Base" para habilitar su caja semanal en calle.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 text-[10px] text-slate-400 uppercase">
                      <th className="py-2 px-2">Cobrador / Ruta</th>
                      <th className="py-2 px-2">Monto Base</th>
                      <th className="py-2 px-2">Inicio Semana</th>
                      <th className="py-2 px-2">Estado</th>
                      <th className="py-2 px-2 text-right">Acción CFO</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-xs">
                    {collectorBases.map((base) => {
                      const routeInfo = routes.find((r) => r.id === base.routeId);
                      const isActiva = base.status === 'ACTIVA';

                      return (
                        <tr key={base.id} className="hover:bg-slate-900/60 transition-colors">
                          <td className="py-2.5 px-2">
                            <div className="font-bold text-white">{base.collectorName}</div>
                            <div className="text-[10px] text-slate-400 font-mono">
                              {routeInfo ? `${routeInfo.name} (${routeInfo.code})` : base.collectorId}
                            </div>
                          </td>
                          <td className="py-2.5 px-2 font-mono font-black text-emerald-400">
                            {formatCOP(base.amount)} COP
                          </td>
                          <td className="py-2.5 px-2 font-mono text-slate-300 text-[11px]">
                            {base.weekStartDate}
                          </td>
                          <td className="py-2.5 px-2">
                            {isActiva ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                ACTIVA
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-slate-400 border border-slate-700">
                                DEVUELTA
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-2 text-right">
                            {isActiva ? (
                              <button
                                type="button"
                                onClick={() => onUpdateBaseStatus(base.id, 'DEVUELTA')}
                                className="px-2.5 py-1 bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 rounded-lg text-[10px] font-bold inline-flex items-center gap-1 transition-all cursor-pointer"
                                title="Registrar devolución del capital base al cierre de la semana"
                              >
                                <RotateCcw className="w-3 h-3" />
                                Marcar DEVUELTA
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => onUpdateBaseStatus(base.id, 'ACTIVA')}
                                className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-[10px] font-semibold inline-flex items-center gap-1 transition-all cursor-pointer"
                              >
                                <ArrowUpRight className="w-3 h-3" />
                                Reactivar
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="mt-4 pt-3 border-t border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px] text-slate-400">
            <span>
              Política RLS: <code className="text-emerald-300 font-mono">collector_id = auth.uid()</code> (El rutero solo visualiza su propia base activa).
            </span>
            <span className="font-mono text-[10px] text-slate-500">
              Sincronizado con Cloud SQL PostgreSQL
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
