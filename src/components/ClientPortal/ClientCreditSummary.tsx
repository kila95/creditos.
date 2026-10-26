import React from 'react';
import { 
  Building2, 
  Calendar, 
  Clock, 
  TrendingUp, 
  Award, 
  AlertCircle, 
  CheckCircle2,
  DollarSign
} from 'lucide-react';
import { ClientProfile, LoanDetail } from '../../data/mockData';
import { formatCOP } from '../../utils/financialCalculations';

interface ClientCreditSummaryProps {
  client: ClientProfile;
  loan: LoanDetail;
  onOpenPaymentActions: () => void;
}

export const ClientCreditSummary: React.FC<ClientCreditSummaryProps> = ({
  client,
  loan,
  onOpenPaymentActions
}) => {
  const totalInstallments = loan.termDays;
  const paidCount = loan.installmentsPaid;
  const remainingCount = Math.max(0, totalInstallments - paidCount);
  const progressPercent = Math.min(100, Math.round((paidCount / totalInstallments) * 100));

  const isUpToDate = loan.daysOverdue === 0;

  return (
    <div className="space-y-4">
      {/* HEADER DE BIENVENIDA AL MICROEMPRESARIO */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl relative overflow-hidden">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                {client.category}
              </span>
              <span className="text-[11px] font-mono text-slate-400">{client.neighborhood}</span>
            </div>
            <h1 className="text-xl font-black text-white mt-2 tracking-tight">
              {client.tradeName}
            </h1>
            <p className="text-xs text-slate-300">
              Titular: {client.name} • <span className="font-mono text-slate-400">{client.document}</span>
            </p>
          </div>

          <div className="w-11 h-11 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
            <Building2 className="w-6 h-6" />
          </div>
        </div>

        {/* SALDO PENDIENTE ACTUAL (BIG NUMBER PARA VISIBILIDAD EN CALLE) */}
        <div className="mt-5 pt-4 border-t border-slate-800/80">
          <div className="flex items-baseline justify-between">
            <span className="text-[11px] text-slate-400 font-bold uppercase tracking-wider">
              Saldo Pendiente Actual
            </span>
            <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${
              isUpToDate 
                ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20' 
                : 'bg-rose-500/10 text-rose-300 border-rose-500/20'
            }`}>
              {isUpToDate ? '● Al Día' : `● ${loan.daysOverdue} días de mora`}
            </span>
          </div>

          <div className="text-3xl sm:text-4xl font-black text-white font-mono mt-1 tracking-tight">
            {formatCOP(loan.remainingBalance)}
          </div>

          {/* CUOTA DIARIA Y PRÓXIMO PAGO */}
          <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
            <div className="bg-slate-950/70 p-3 rounded-2xl border border-slate-800">
              <span className="text-[10px] text-slate-400 uppercase font-medium block">Valor Cuota Diaria</span>
              <span className="text-base font-black text-emerald-400 font-mono mt-0.5 block">
                {formatCOP(loan.installmentAmount)}
              </span>
              <span className="text-[10px] text-slate-500 block mt-0.5">Cuota fija en pesos</span>
            </div>

            <div className="bg-slate-950/70 p-3 rounded-2xl border border-slate-800">
              <span className="text-[10px] text-slate-400 uppercase font-medium block">Fecha Próximo Pago</span>
              <span className="text-sm font-bold text-white font-mono mt-0.5 block">
                {loan.dueDate}
              </span>
              <span className="text-[10px] text-emerald-400 block mt-0.5 font-medium">Horario matutino</span>
            </div>
          </div>

          {/* BARRA DE PROGRESO VISUAL */}
          <div className="mt-5 space-y-2">
            <div className="flex justify-between text-xs text-slate-300 font-semibold">
              <span>Progreso: Cuota {paidCount} de {totalInstallments}</span>
              <span className="font-mono text-emerald-400 font-bold">{progressPercent}% completado</span>
            </div>
            <div className="w-full bg-slate-950 h-3.5 rounded-full p-0.5 border border-slate-800 overflow-hidden">
              <div 
                className="bg-gradient-to-r from-emerald-600 to-teal-400 h-full rounded-full transition-all duration-700 shadow-sm shadow-emerald-500"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <div className="flex justify-between text-[11px] text-slate-500 font-mono">
              <span>Pagadas: {paidCount} cuotas</span>
              <span>Restantes: {remainingCount} cuotas</span>
            </div>
          </div>
        </div>
      </div>

      {/* GAMIFICACIÓN: NIVEL DE CRÉDITO Y AUMENTO DE CUPO */}
      <div className="bg-gradient-to-r from-blue-950/30 via-slate-900 to-slate-900 border border-blue-500/20 rounded-2xl p-4 flex items-center justify-between text-xs">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-500/20 text-blue-300 border border-blue-500/30 flex items-center justify-center">
            <Award className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-blue-300 block">
              Línea de Crédito Escalonada
            </span>
            <span className="font-bold text-white block mt-0.5">
              Nivel 2: Crecimiento ($800.000 COP)
            </span>
            <span className="text-[11px] text-slate-400 block">
              Próximo cupo: <strong className="text-emerald-400">$1.500.000 COP</strong> (Faltan 2 pagos limpios)
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
