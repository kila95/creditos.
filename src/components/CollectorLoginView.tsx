import React, { useState, useEffect } from 'react';
import { 
  Bike, 
  Lock, 
  Mail, 
  Eye, 
  EyeOff, 
  CheckCircle2, 
  MapPin, 
  Smartphone, 
  ShieldCheck, 
  ArrowRight, 
  AlertCircle,
  Clock,
  Compass
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { getRememberedCollectorEmail } from '../services/supabaseAuth';

interface CollectorLoginViewProps {
  onSuccess?: () => void;
  message?: string;
}

export const CollectorLoginView: React.FC<CollectorLoginViewProps> = ({ onSuccess, message }) => {
  const { login } = useAuth();
  const [email, setEmail] = useState('cobrador@rutacapital.co');
  const [password, setPassword] = useState('cobrador123@Medellin');
  const [rememberMe, setRememberMe] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    // Si ya había una sesión guardada de cobrador, precargar su correo
    const savedEmail = getRememberedCollectorEmail();
    if (savedEmail) {
      setEmail(savedEmail);
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setIsLoading(true);

    const result = await login(email, password, rememberMe);
    setIsLoading(false);

    if (result.success) {
      if (onSuccess) onSuccess();
    } else {
      setErrorMessage(result.error || 'Credenciales de cobrador inválidas.');
    }
  };

  const handleSelectPreset = (userEmail: string, userPass: string) => {
    setEmail(userEmail);
    setPassword(userPass);
    setErrorMessage(null);
  };

  return (
    <div className="w-full max-w-md mx-auto py-4 px-3 sm:px-4">
      <div className="bg-slate-900 border-2 border-emerald-500/40 rounded-3xl p-5 sm:p-7 shadow-2xl relative overflow-hidden backdrop-blur-xl">
        {/* Glow de fondo para visibilidad diurna en calle */}
        <div className="absolute -top-16 -right-16 w-40 h-40 bg-emerald-500/15 rounded-full blur-2xl pointer-events-none" />

        {/* Encabezado Mobile-First grande */}
        <div className="text-center space-y-2.5 mb-6">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-400 border-2 border-emerald-400 mx-auto flex items-center justify-center text-white shadow-lg shadow-emerald-950/60">
            <Bike className="w-9 h-9 stroke-[2.2]" />
          </div>
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[11px] font-bold uppercase tracking-wider mb-1">
              <Compass className="w-3.5 h-3.5" />
              Terminal Móvil de Calle · Rutero
            </div>
            <h2 className="text-2xl font-black text-white tracking-tight">
              Ingreso de Cobrador
            </h2>
            <p className="text-xs text-slate-300 mt-1 max-w-xs mx-auto">
              Acceso a ruta asignada, registro de cobros diarios y emisión de recibos WhatsApp.
            </p>
          </div>
        </div>

        {/* Mensajes de notificación o error */}
        {message && (
          <div className="mb-4 p-3 rounded-xl bg-amber-500/15 border border-amber-500/40 flex items-start gap-2.5 text-amber-200 text-xs">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
            <span>{message}</span>
          </div>
        )}

        {errorMessage && (
          <div className="mb-4 p-3 rounded-xl bg-rose-500/15 border border-rose-500/40 flex items-start gap-2.5 text-rose-200 text-xs">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Formulario con campos de alto tamaño para tecleo táctil */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-200 mb-1.5 flex items-center justify-between">
              <span>Correo del Rutero</span>
              <span className="text-[10px] text-emerald-400 font-mono">auth.users</span>
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <Mail className="w-5 h-5" />
              </div>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="cobrador@rutacapital.co"
                className="w-full bg-slate-950 border-2 border-slate-700 rounded-2xl pl-11 pr-4 py-3 text-sm text-white placeholder-slate-500 font-medium focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/30 transition-all"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-200 mb-1.5 flex items-center justify-between">
              <span>Contraseña de Acceso</span>
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="text-xs text-emerald-400 hover:text-emerald-300 flex items-center gap-1 font-semibold"
              >
                {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                {showPassword ? 'Ocultar' : 'Ver'}
              </button>
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <Lock className="w-5 h-5" />
              </div>
              <input
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full bg-slate-950 border-2 border-slate-700 rounded-2xl pl-11 pr-11 py-3 text-sm text-white placeholder-slate-500 font-medium focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/30 transition-all font-mono"
              />
            </div>
          </div>

          {/* CHECKBOX GRANDE PARA RECORDAR SESIÓN EN LA CALLE */}
          <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-3 flex items-center justify-between">
            <label htmlFor="rememberMe" className="flex items-center gap-2.5 cursor-pointer select-none">
              <input
                id="rememberMe"
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="w-5 h-5 rounded-lg border-2 border-slate-700 bg-slate-900 text-emerald-600 focus:ring-emerald-500 accent-emerald-500 cursor-pointer"
              />
              <div>
                <span className="text-xs font-bold text-white block">Recordar sesión en esta moto / móvil</span>
                <span className="text-[10px] text-slate-400 block">No pedirá clave al abrir la app en la ruta</span>
              </div>
            </label>
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
          </div>

          {/* BOTÓN PRIMARIO DE ACCESO */}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full mt-2 bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 active:scale-[0.98] text-white font-black py-3.5 px-4 rounded-2xl shadow-xl shadow-emerald-950/60 flex items-center justify-center gap-2 text-sm transition-all"
          >
            {isLoading ? (
              <span className="flex items-center gap-2">
                <span className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                Abriendo ruta de calle...
              </span>
            ) : (
              <>
                <Bike className="w-5 h-5" />
                Iniciar Turno & Ver Ruta Diaria
                <ArrowRight className="w-5 h-5 ml-1" />
              </>
            )}
          </button>
        </form>

        {/* Separador de accesos rápidos para test */}
        <div className="relative my-5">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-slate-800" />
          </div>
          <div className="relative flex justify-center text-[10px] uppercase font-bold text-slate-400">
            <span className="bg-slate-900 px-2">Cobradores de Prueba (1-Toque)</span>
          </div>
        </div>

        {/* PRESETS DE COBRADORES PARA AUDITORÍA RLS */}
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => handleSelectPreset('cobrador@rutacapital.co', 'cobrador123@Medellin')}
            className={`w-full text-left p-3 rounded-2xl border-2 transition-all flex items-center justify-between ${
              email === 'cobrador@rutacapital.co'
                ? 'bg-emerald-950/50 border-emerald-500 text-emerald-200'
                : 'bg-slate-950/60 border-slate-800 text-slate-300 hover:border-slate-700'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-black text-xs shrink-0">
                C13
              </div>
              <div>
                <p className="text-xs font-bold text-white">Jhon Alexander Zapata</p>
                <p className="text-[10px] text-slate-400 font-mono">
                  Ruta 1 · Comuna 13 San Javier (42 créditos)
                </p>
              </div>
            </div>
            <span className="px-2 py-1 rounded-lg text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              Ruta 1
            </span>
          </button>

          <button
            type="button"
            onClick={() => handleSelectPreset('cobrador2@rutacapital.co', 'cobrador123@Medellin')}
            className={`w-full text-left p-3 rounded-2xl border-2 transition-all flex items-center justify-between ${
              email === 'cobrador2@rutacapital.co'
                ? 'bg-emerald-950/50 border-emerald-500 text-emerald-200'
                : 'bg-slate-950/60 border-slate-800 text-slate-300 hover:border-slate-700'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-teal-500/20 text-teal-400 flex items-center justify-center font-black text-xs shrink-0">
                MN
              </div>
              <div>
                <p className="text-xs font-bold text-white">Carlos Mario Henao</p>
                <p className="text-[10px] text-slate-400 font-mono">
                  Ruta 2 · Manrique & Aranjuez (38 créditos)
                </p>
              </div>
            </div>
            <span className="px-2 py-1 rounded-lg text-[10px] font-bold bg-teal-500/10 text-teal-400 border border-teal-500/20">
              Ruta 2
            </span>
          </button>
        </div>

        {/* REGLA RLS GARANTIZADA */}
        <div className="mt-4 pt-3 border-t border-slate-800/80 text-[11px] text-slate-400 flex items-center justify-between">
          <span className="flex items-center gap-1 text-emerald-400">
            <Lock className="w-3 h-3" />
            RLS Enforced: Solo clientes de ruta asignada
          </span>
          <span className="text-[10px] font-mono text-slate-400">PostgreSQL</span>
        </div>
      </div>
    </div>
  );
};
