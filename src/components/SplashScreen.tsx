import React from 'react';
import { ShieldCheck } from 'lucide-react';
import { EnRutaLogo } from './EnRutaLogo';

export const SplashScreen: React.FC = () => {
  return (
    <div className="fixed inset-0 z-50 bg-[#0d1b2a] text-slate-100 flex flex-col items-center justify-center p-4 overflow-hidden">
      {/* Background radial glowing gradients */}
      <div className="absolute w-[500px] h-[500px] bg-gradient-to-tr from-[#00b4d8]/15 via-[#2ec4b6]/10 to-transparent rounded-full blur-3xl pointer-events-none animate-pulse" />
      <div className="absolute -bottom-32 -right-32 w-96 h-96 bg-[#ff9f1c]/10 rounded-full blur-3xl pointer-events-none" />

      <div className="relative z-10 w-full max-w-sm flex flex-col items-center space-y-6 text-center">
        {/* Custom Logo for Microcredit & Street Routes */}
        <EnRutaLogo size="lg" showSubtitle={true} className="justify-center" />

        <p className="text-xs text-slate-300 font-sans mt-0.5">Control de recaudo diario, rutas y microcréditos</p>

        {/* Indicador de carga animado tipo Neo-Bank */}
        <div className="flex flex-col items-center gap-3 pt-4">
          <div className="relative w-12 h-12">
            <div className="absolute inset-0 rounded-full border-2 border-[#00b4d8]/20" />
            <div className="absolute inset-0 rounded-full border-2 border-[#2ec4b6] border-t-transparent animate-spin" />
            <div className="absolute inset-2 rounded-full border-2 border-[#ff9f1c]/40 border-b-transparent animate-spin" style={{ animationDirection: 'reverse', animationDuration: '1.5s' }} />
          </div>
          <span className="text-xs text-[#2ec4b6] font-sans tracking-widest animate-pulse uppercase font-bold">
            Conectando nodo seguro...
          </span>
        </div>

        <div className="pt-6 flex items-center gap-2 text-[11px] text-slate-400 font-sans border-t border-slate-800/80 w-full justify-center">
          <ShieldCheck className="w-4 h-4 text-[#ff9f1c]" />
          <span>Infraestructura Zero-Trust · Cloud SQL</span>
        </div>
      </div>
    </div>
  );
};
