import React, { useState } from 'react';
import { 
  PieChart, 
  TrendingUp, 
  Award, 
  ShieldCheck, 
  DollarSign, 
  ChevronRight, 
  Zap, 
  Users,
  CheckCircle2,
  Lock,
  ArrowUpRight
} from 'lucide-react';
import { INITIAL_INVESTORS, CREDIT_TIERS, InvestorPartner, CreditTierLevel } from '../data/investorFundData';
import { formatCOP } from '../utils/financialCalculations';

export const InvestorFundView: React.FC = () => {
  const [investors, setInvestors] = useState<InvestorPartner[]>(INITIAL_INVESTORS);
  const [tiers] = useState<CreditTierLevel[]>(CREDIT_TIERS);

  const totalFundCapital = investors.reduce((acc, i) => acc + i.capitalContributed, 0);
  const totalNetDividends = investors.reduce((acc, i) => acc + i.netDividendsPayable, 0);
  const averageRoi = (investors.reduce((acc, i) => acc + i.historicRoiPercent, 0) / investors.length).toFixed(1);

  return (
    <div className="space-y-6">
      {/* HEADER FONDO DE INVERSIÓN */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                Syndicate & Capital Pool
              </span>
              <span className="text-xs text-slate-400">Estructura Multi-Socio Medellín</span>
            </div>
            <h2 className="text-2xl font-bold text-white tracking-tight mt-1 flex items-center gap-2">
              <Users className="w-6 h-6 text-emerald-400" />
              Fondo Común de Inversión & Dividendos Proporcionales
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Cálculo automatizado de ROI, absorción proporcional de OpEx y utilidades netas distribuibles por socio.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs font-mono px-3 py-1.5 rounded-xl bg-slate-800 text-slate-300 border border-slate-700">
              Pool Total: <strong className="text-emerald-400">{formatCOP(totalFundCapital)}</strong>
            </span>
          </div>
        </div>

        {/* METRIC CARDS DEL FONDO */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-5">
          <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-4">
            <span className="text-slate-400 text-xs block">Capital Activo en Calle</span>
            <span className="text-2xl font-black text-white font-mono mt-1 block">
              {formatCOP(totalFundCapital)}
            </span>
            <span className="text-[11px] text-slate-400 mt-1 block">
              4 Socios / Inversionistas participando
            </span>
          </div>

          <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-4">
            <span className="text-slate-400 text-xs block">Dividendos Netos Generados</span>
            <span className="text-2xl font-black text-emerald-400 font-mono mt-1 block">
              {formatCOP(totalNetDividends)}
            </span>
            <span className="text-[11px] text-emerald-300 mt-1 block font-medium">
              OpEx y Provisiones de Cartera ya deducidos
            </span>
          </div>

          <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-4">
            <span className="text-slate-400 text-xs block">Rendimiento Promedio (ROI)</span>
            <span className="text-2xl font-black text-amber-300 font-mono mt-1 block">
              {averageRoi}% E.A.
            </span>
            <span className="text-[11px] text-slate-400 mt-1 block">
              Superior a CDTs y renta fija colombiana
            </span>
          </div>
        </div>
      </div>

      {/* TABLA DE SOCIOS / INVERSIONISTAS */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <PieChart className="w-4 h-4 text-emerald-400" />
            Distribución Proporcional de Rendimientos por Socio
          </h3>
          <span className="text-xs text-slate-400">Regla: Prorrateo estricto por cuota de capital</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 font-mono">
              <tr>
                <th className="py-3 px-4">Inversionista / Socio</th>
                <th className="py-3 px-4">Tipo</th>
                <th className="py-3 px-4">Aporte Capital</th>
                <th className="py-3 px-4">Participación</th>
                <th className="py-3 px-4">Interés Bruto</th>
                <th className="py-3 px-4">OpEx Asignado</th>
                <th className="py-3 px-4">Utilidad Neta</th>
                <th className="py-3 px-4 text-right">ROI Neto</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {investors.map((inv) => (
                <tr key={inv.id} className="hover:bg-slate-800/30 transition-colors">
                  <td className="py-3.5 px-4">
                    <div className="font-bold text-white text-xs">{inv.name}</div>
                    <div className="text-[10px] text-slate-500 font-mono">Ingreso: {inv.joinedDate}</div>
                  </td>
                  <td className="py-3.5 px-4">
                    <span className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase bg-slate-800 text-slate-300 border border-slate-700">
                      {inv.type.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 font-mono font-bold text-slate-200">
                    {formatCOP(inv.capitalContributed)}
                  </td>
                  <td className="py-3.5 px-4">
                    <span className="font-mono font-bold text-emerald-400 text-sm">
                      {inv.equitySharePercent}%
                    </span>
                  </td>
                  <td className="py-3.5 px-4 font-mono text-slate-300">
                    {formatCOP(inv.grossYieldEarned)}
                  </td>
                  <td className="py-3.5 px-4 font-mono text-amber-400">
                    -{formatCOP(inv.allocatedOpexCost)}
                  </td>
                  <td className="py-3.5 px-4 font-mono font-bold text-emerald-300 text-sm">
                    {formatCOP(inv.netDividendsPayable)}
                  </td>
                  <td className="py-3.5 px-4 text-right font-mono font-bold text-amber-300">
                    +{inv.historicRoiPercent}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* LÍNEAS DE CRÉDITO ESCALONADAS (GAMIFICACIÓN DEL CRÉDITO) */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">
                Fidelización & Control de Pérdidas
              </span>
            </div>
            <h3 className="text-base font-bold text-white mt-1 flex items-center gap-2">
              <Award className="w-5 h-5 text-amber-400" />
              Líneas de Crédito Escalonadas (Gamificación del Microcrédito)
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Si un cliente cumple 3 créditos consecutivos sin un solo día de mora, el sistema desbloquea automáticamente el siguiente nivel de cupo.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {tiers.map((tier) => (
            <div 
              key={tier.levelNumber}
              className="bg-slate-950/60 border border-slate-800 rounded-2xl p-5 flex flex-col justify-between hover:border-slate-700 transition-all space-y-4"
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase ${tier.badgeColor}`}>
                    Nivel {tier.levelNumber}
                  </span>
                  <span className="text-[11px] font-mono text-slate-400">
                    {tier.minConsecutiveCleanCredits === 0 
                      ? 'Inicio' 
                      : `${tier.minConsecutiveCleanCredits} créditos limpios`}
                  </span>
                </div>

                <h4 className="text-base font-bold text-white mt-3">{tier.name}</h4>
                <div className="mt-2 text-2xl font-black text-emerald-400 font-mono">
                  {formatCOP(tier.creditLimit)}
                </div>
                <span className="text-[10px] text-slate-400 block uppercase font-medium">Cupo Máximo Aprobado</span>

                {/* BENEFICIOS DEL NIVEL */}
                <ul className="mt-4 space-y-2 text-xs text-slate-300">
                  {tier.perks.map((perk, i) => (
                    <li key={i} className="flex items-start gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                      <span className="text-[11px] leading-tight">{perk}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="pt-3 border-t border-slate-800/80 text-[10px] text-slate-500 font-mono">
                Plazo máx: {tier.maxTermDays} días • Tasa desc: -{tier.rateDiscountPercent}%
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
