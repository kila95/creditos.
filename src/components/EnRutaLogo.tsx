import React from 'react';

interface EnRutaLogoProps {
  size?: 'sm' | 'md' | 'lg';
  showSubtitle?: boolean;
  compactOnMobile?: boolean;
  className?: string;
}

export const EnRutaLogo: React.FC<EnRutaLogoProps> = ({ 
  size = 'md', 
  showSubtitle = true,
  compactOnMobile = false,
  className = '' 
}) => {
  const dimensionMap = {
    sm: 'w-8 h-8 sm:w-10 sm:h-10',
    md: 'w-10 h-10 sm:w-14 sm:h-14',
    lg: 'w-16 h-16 sm:w-20 sm:h-20',
  };

  const textMap = {
    sm: 'text-base sm:text-xl',
    md: 'text-lg sm:text-2xl md:text-3xl',
    lg: 'text-2xl sm:text-4xl md:text-5xl',
  };

  return (
    <div className={`flex items-center gap-2.5 sm:gap-3 flex-wrap min-h-fit ${className}`}>
      {/* Isotipo Vectorial Específico para Microcréditos y Rutas de Cobro */}
      <div className="relative group shrink-0">
        <div className="absolute -inset-1.5 sm:-inset-2 rounded-2xl bg-gradient-to-r from-[#00b4d8] via-[#2ec4b6] to-[#ff9f1c] opacity-60 blur-md animate-pulse" />
        <div className={`relative ${dimensionMap[size]} rounded-2xl bg-gradient-to-br from-[#1b263b] via-[#0d1b2a] to-[#080e18] border border-[#2ec4b6]/50 flex items-center justify-center text-white shadow-xl shadow-[#00b4d8]/25`}>
          <svg className="w-4/5 h-4/5 text-[#2ec4b6] drop-shadow-[0_0_10px_rgba(46,196,182,0.7)]" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            {/* Ruta / Camino dinámico de calle */}
            <path d="M4 24C8 24 10 16 16 16C22 16 24 8 28 8" stroke="#00b4d8" strokeWidth="2.5" strokeDasharray="3 3" opacity="0.8" />
            
            {/* Escudo / Pin de ubicación de alta precisión */}
            <path d="M16 3C11.5 3 8 6.5 8 11C8 17 16 27 16 27C16 27 24 17 24 11C24 6.5 20.5 3 16 3Z" fill="url(#logoGradient)" fillOpacity="0.3" stroke="#2ec4b6" strokeWidth="2" />
            
            {/* Flecha de avance / velocidad en ruta */}
            <path d="M13 11L16 8L19 11" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M16 8V16" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" />

            {/* Símbolo de pesos ($) del microcrédito */}
            <text x="16" y="20.5" fontSize="8.5" fontWeight="900" fill="#ff9f1c" textAnchor="middle" dominantBaseline="middle">$</text>

            <defs>
              <linearGradient id="logoGradient" x1="8" y1="3" x2="24" y2="27" gradientUnits="userSpaceOnUse">
                <stop stopColor="#00b4d8" />
                <stop offset="0.5" stopColor="#2ec4b6" />
                <stop offset="1" stopColor="#ff9f1c" />
              </linearGradient>
            </defs>
          </svg>
        </div>
      </div>

      {/* Tipografía de Marca Fluida y Elástica */}
      <div className="flex flex-col min-w-0 break-words">
        <h1 className={`${textMap[size]} font-brand font-extrabold tracking-tight text-white flex items-center gap-1 leading-none`}>
          <span className="bg-gradient-to-r from-white via-slate-100 to-[#00b4d8] bg-clip-text text-transparent">En</span>
          <span className="bg-gradient-to-r from-[#00b4d8] via-[#2ec4b6] to-[#ff9f1c] bg-clip-text text-transparent">Ruta</span>
        </h1>
        {showSubtitle && (
          <span className={`text-[9px] sm:text-[10px] md:text-xs text-[#ff9f1c] font-bold tracking-widest uppercase mt-1 ${compactOnMobile ? 'hidden md:inline' : ''}`}>
            GESTIÓN DE CARTERA {compactOnMobile ? '' : '· 2026'}
          </span>
        )}
      </div>
    </div>
  );
};
