import React, { useMemo } from 'react';
import {
  DollarSign,
  TrendingUp,
  Wallet,
  Activity,
  Calendar,
  Layers,
  ArrowUpRight,
  ShieldCheck,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
} from 'recharts';
import { RouteData, ClientProfile, LoanDetail, LedgerEntry } from '../data/mockData';
import { formatCOP, roundCOP } from '../utils/financialCalculations';
import { isDateTodayLocal } from '../services/clientSyncService';

interface DashboardAnalyticsProps {
  routes: RouteData[];
  clients: ClientProfile[];
  loans: LoanDetail[];
  ledger: LedgerEntry[];
  tenantId?: string;
}

export const DashboardAnalytics: React.FC<DashboardAnalyticsProps> = ({
  routes,
  clients,
  loans,
  ledger,
  tenantId = 'org-medellin-01',
}) => {
  // 1. CÁLCULO DE KPIS SUPERIORES (Recaudo Hoy, Préstamos Activos, Capital en Calle)
  const stats = useMemo(() => {
    // A) Recaudo de Hoy
    const todayLedger = ledger.filter((entry) => isDateTodayLocal(entry.timestamp));
    const todayCollectedTotal = roundCOP(
      todayLedger.reduce((acc, entry) => acc + roundCOP(entry.amount), 0)
    );

    // B) Total Préstamos Activos
    const activeLoans = loans.filter(
      (l) => l.remainingBalance > 0 && l.status !== 'liquidado' && l.status !== 'completed'
    );
    const totalActiveLoansCount = activeLoans.length;

    // C) Capital en la Calle (Saldo pendiente de cobro)
    const capitalInTheStreet = roundCOP(
      activeLoans.reduce((acc, l) => acc + roundCOP(l.remainingBalance), 0)
    );

    return {
      todayCollectedTotal,
      totalActiveLoansCount,
      capitalInTheStreet,
    };
  }, [ledger, loans]);

  // 2. CONSTRUCCIÓN DE RECAUDO DIARIO DE LOS ÚLTIMOS 7 DÍAS PARA RECHARTS BARCHART
  const last7DaysData = useMemo(() => {
    const daysArr: { day: string; fullDate: string; amount: number }[] = [];
    const now = new Date();

    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(now.getDate() - i);
      const isoDate = d.toISOString().split('T')[0];

      const dayName = d.toLocaleDateString('es-CO', { weekday: 'short' });
      const dayNum = d.getDate();
      const label = `${dayName.charAt(0).toUpperCase() + dayName.slice(1, 3)} ${dayNum}`;

      const dayLedger = ledger.filter((entry) => {
        const entryDate = new Date(entry.timestamp).toISOString().split('T')[0];
        return entryDate === isoDate;
      });

      const dayTotal = roundCOP(
        dayLedger.reduce((acc, entry) => acc + roundCOP(entry.amount), 0)
      );

      daysArr.push({
        day: label,
        fullDate: isoDate,
        amount: dayTotal,
      });
    }

    return daysArr;
  }, [ledger]);

  return (
    <div className="space-y-6">
      {/* 3 TARJETAS KPIS PRINCIPALES (Recaudo de Hoy, Préstamos Activos, Capital en la Calle) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* KPI 1: Recaudo de Hoy */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl relative overflow-hidden flex flex-col justify-between">
          <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-2xl pointer-events-none" />
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Recaudo de Hoy
            </span>
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <DollarSign className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl sm:text-3xl font-black text-emerald-400 font-mono tracking-tight block">
              {formatCOP(stats.todayCollectedTotal)}
            </span>
            <div className="flex items-center gap-1.5 mt-1 text-xs text-slate-400 font-medium">
              <Activity className="w-3.5 h-3.5 text-emerald-400" />
              <span>Validado en tiempo real desde libro mayor</span>
            </div>
          </div>
        </div>

        {/* KPI 2: Total Préstamos Activos */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl relative overflow-hidden flex flex-col justify-between">
          <div className="absolute top-0 right-0 w-32 h-32 bg-sky-500/10 rounded-full blur-2xl pointer-events-none" />
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Total Préstamos Activos
            </span>
            <div className="w-10 h-10 rounded-2xl bg-sky-500/15 border border-sky-500/30 flex items-center justify-center text-sky-400">
              <Layers className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl sm:text-3xl font-black text-white font-mono tracking-tight block">
              {stats.totalActiveLoansCount}
            </span>
            <div className="flex items-center gap-1.5 mt-1 text-xs text-slate-400 font-medium">
              <ShieldCheck className="w-3.5 h-3.5 text-sky-400" />
              <span>Créditos vigentes en ruta</span>
            </div>
          </div>
        </div>

        {/* KPI 3: Capital en la Calle */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl relative overflow-hidden flex flex-col justify-between">
          <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/10 rounded-full blur-2xl pointer-events-none" />
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Capital en la Calle
            </span>
            <div className="w-10 h-10 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Wallet className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl sm:text-3xl font-black text-amber-300 font-mono tracking-tight block">
              {formatCOP(stats.capitalInTheStreet)}
            </span>
            <div className="flex items-center gap-1.5 mt-1 text-xs text-slate-400 font-medium">
              <TrendingUp className="w-3.5 h-3.5 text-amber-400" />
              <span>Saldo total por recuperar</span>
            </div>
          </div>
        </div>
      </div>

      {/* GRÁFICO DE BARRAS (RECHARTS): RECAUDO DIARIO DE LOS ÚLTIMOS 7 DÍAS */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-2xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
          <div>
            <span className="text-[11px] font-mono text-emerald-400 font-bold uppercase tracking-wider block">
              Inteligencia Financiera &amp; Flujo de Caja
            </span>
            <h3 className="text-base sm:text-lg font-black text-white flex items-center gap-2">
              <Calendar className="w-4 h-4 text-emerald-400" />
              Recaudo Diario de los Últimos 7 Días
            </h3>
          </div>
          <span className="text-xs font-mono text-slate-400 bg-slate-950 px-3 py-1 rounded-xl border border-slate-800">
            Tenant: <strong className="text-emerald-400">{tenantId}</strong>
          </span>
        </div>

        <div className="w-full h-72 sm:h-80 pt-2">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={last7DaysData} margin={{ top: 15, right: 15, left: 15, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
              <XAxis
                dataKey="day"
                stroke="#64748b"
                tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 700 }}
                axisLine={{ stroke: '#334155' }}
              />
              <YAxis
                stroke="#64748b"
                tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 600 }}
                axisLine={{ stroke: '#334155' }}
                tickFormatter={(value) => `$${(value / 1000000).toFixed(1)}M`}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#090d16',
                  borderColor: '#334155',
                  borderRadius: '16px',
                  color: '#fff',
                  boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.5)',
                  fontSize: '12px',
                }}
                formatter={(value: any) => [formatCOP(Number(value) || 0), 'Recaudo Total']}
                labelFormatter={(label) => `Fecha: ${label}`}
              />
              <Bar dataKey="amount" radius={[8, 8, 0, 0]}>
                {last7DaysData.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={index === last7DaysData.length - 1 ? '#10b981' : '#059669'}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};
