import React, { useState } from 'react';
import { 
  Users, 
  MapPin, 
  ArrowRightLeft, 
  Check, 
  BarChart3, 
  ShieldCheck,
  Bike
} from 'lucide-react';
import { RouteData, ClientProfile, LoanDetail } from '../data/mockData';
import { formatCOP } from '../utils/financialCalculations';

interface DynamicRouteAssignmentProps {
  routes: RouteData[];
  clients: ClientProfile[];
  loans: LoanDetail[];
  onReassignClientRoute: (clientId: string, newRouteId: string) => void;
  onClose: () => void;
}

export const DynamicRouteAssignment: React.FC<DynamicRouteAssignmentProps> = ({
  routes,
  clients,
  loans,
  onReassignClientRoute,
  onClose
}) => {
  const [selectedRouteFilter, setSelectedRouteFilter] = useState<string>('all');
  const [transferTargetRoute, setTransferTargetRoute] = useState<string>(routes[1]?.id || 'route-2');
  const [reassignSuccessMsg, setReassignSuccessMsg] = useState<string | null>(null);

  const filteredClients = selectedRouteFilter === 'all' 
    ? clients 
    : clients.filter(c => c.routeId === selectedRouteFilter);

  const handleTransfer = (client: ClientProfile) => {
    onReassignClientRoute(client.id, transferTargetRoute);
    const targetRoute = routes.find(r => r.id === transferTargetRoute);
    setReassignSuccessMsg(`Cliente ${client.tradeName} reasignado a ${targetRoute?.name} (${targetRoute?.collectorName})`);
    setTimeout(() => setReassignSuccessMsg(null), 3000);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* HEADER */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/80">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-teal-500/20 text-teal-400 border border-teal-500/30 flex items-center justify-center">
              <ArrowRightLeft className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">
                Asignación Dinámica de Rutas & Balanceo de Carga
              </h3>
              <p className="text-[11px] text-slate-400">
                Reasigna barrios y micronegocios entre ruteros según densidad y exposición de cartera
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center text-sm"
          >
            ✕
          </button>
        </div>

        {/* FEEDBACK SUCCESS TOAST */}
        {reassignSuccessMsg && (
          <div className="bg-emerald-500/20 border-b border-emerald-500/30 p-2.5 text-xs text-emerald-300 font-semibold flex items-center gap-2 px-5">
            <Check className="w-4 h-4 text-emerald-400" />
            {reassignSuccessMsg}
          </div>
        )}

        {/* BALANCEO DE CARGA VISUAL */}
        <div className="p-5 bg-slate-950/40 border-b border-slate-800 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          {routes.map(r => {
            const count = clients.filter(c => c.routeId === r.id).length;
            const portfolio = loans
              .filter(l => l.routeId === r.id && l.status !== 'liquidado')
              .reduce((acc, l) => acc + l.remainingBalance, 0);

            return (
              <div key={r.id} className="bg-slate-800/40 border border-slate-700/60 p-3 rounded-xl">
                <div className="flex items-center gap-1.5 text-slate-300 font-bold">
                  <Bike className="w-3.5 h-3.5 text-teal-400" />
                  <span className="truncate">{r.collectorName}</span>
                </div>
                <div className="text-[10px] text-slate-400 truncate">{r.name}</div>
                <div className="mt-2 flex items-baseline justify-between">
                  <span className="text-white font-black text-sm">{count} clientes</span>
                  <span className="text-teal-400 font-mono text-[11px]">{formatCOP(portfolio)}</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* CONTROLES Y LISTA */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1 text-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-800/60 p-3 rounded-xl border border-slate-700/60">
            <div className="flex items-center gap-2">
              <span className="text-slate-300 font-medium">Filtrar por origen:</span>
              <select
                value={selectedRouteFilter}
                onChange={(e) => setSelectedRouteFilter(e.target.value)}
                className="bg-slate-800 text-white rounded-lg px-2.5 py-1.5 border border-slate-700"
              >
                <option value="all">Todas las Rutas</option>
                {routes.map(r => (
                  <option key={r.id} value={r.id}>{r.name} ({r.collectorName})</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-slate-300 font-medium">Reasignar hacia:</span>
              <select
                value={transferTargetRoute}
                onChange={(e) => setTransferTargetRoute(e.target.value)}
                className="bg-slate-800 text-teal-300 font-bold rounded-lg px-2.5 py-1.5 border border-slate-700"
              >
                {routes.map(r => (
                  <option key={r.id} value={r.id}>{r.name} — {r.collectorName}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-900 text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="py-2.5 px-3">Negocio / Cliente</th>
                  <th className="py-2.5 px-3">Sector / Comuna</th>
                  <th className="py-2.5 px-3">Ruta Actual</th>
                  <th className="py-2.5 px-3">Saldo Insoluto</th>
                  <th className="py-2.5 px-3 text-right">Acción de Reasignación</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredClients.map(client => {
                  const clientRoute = routes.find(r => r.id === client.routeId);
                  const clientLoan = loans.find(l => l.clientId === client.id);

                  return (
                    <tr key={client.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="py-3 px-3">
                        <div className="font-bold text-white">{client.tradeName}</div>
                        <div className="text-[11px] text-slate-400">{client.name}</div>
                      </td>
                      <td className="py-3 px-3 text-slate-300">
                        <div className="flex items-center gap-1">
                          <MapPin className="w-3 h-3 text-slate-500" />
                          <span>{client.neighborhood}</span>
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono text-[11px] border border-slate-700">
                          {clientRoute?.collectorName || 'Sin asignar'}
                        </span>
                      </td>
                      <td className="py-3 px-3 font-semibold text-emerald-400 font-mono">
                        {clientLoan ? formatCOP(clientLoan.remainingBalance) : '$0 COP'}
                      </td>
                      <td className="py-3 px-3 text-right">
                        <button
                          disabled={client.routeId === transferTargetRoute}
                          onClick={() => handleTransfer(client)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                            client.routeId === transferTargetRoute
                              ? 'bg-slate-800/50 text-slate-500 cursor-not-allowed'
                              : 'bg-teal-600 hover:bg-teal-500 text-white shadow-sm'
                          }`}
                        >
                          Transferir a Ruta Destino
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* FOOTER */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/90 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl font-semibold text-xs"
          >
            Finalizar Asignaciones
          </button>
        </div>
      </div>
    </div>
  );
};
