import React, { useState } from 'react';
import { 
  ShieldCheck, 
  Lock, 
  Mail, 
  Eye, 
  EyeOff, 
  Building, 
  AlertTriangle, 
  KeyRound, 
  CheckCircle2, 
  ArrowRight,
  TrendingUp,
  Database
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { DEMO_USERS } from '../services/supabaseAuth';

interface AdminLoginViewProps {
  onSuccess?: () => void;
  message?: string;
}

export const AdminLoginView: React.FC<AdminLoginViewProps> = ({ onSuccess, message }) => {
  const { login } = useAuth();
  const [email, setEmail] = useState('admin@rutacapital.co');
  const [password, setPassword] = useState('admin123@Medellin');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setIsLoading(true);

    const result = await login(email, password);
    setIsLoading(false);

    if (result.success) {
      if (onSuccess) onSuccess();
    } else {
      setErrorMessage(result.error || 'Credenciales no autorizadas');
    }
  };

  const handleSelectPreset = (userEmail: string, userPass: string) => {
    setEmail(userEmail);
    setPassword(userPass);
    setErrorMessage(null);
  };

  return (
    <div className="w-full max-w-md mx-auto py-6 px-4 sm:px-6">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl relative overflow-hidden backdrop-blur-xl">
        {/* Glow de seguridad de fondo */}
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* Encabezado de la vista */}
        <div className="text-center space-y-3 mb-6 relative">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-teal-500/10 border border-emerald-500/30 mx-auto flex items-center justify-center text-emerald-400 shadow-inner">
            <ShieldCheck className="w-7 h-7" />
          </div>
          <div>
            <div className="flex items-center justify-center gap-1.5 text-[11px] font-bold text-emerald-400 uppercase tracking-wider mb-1">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              Control de Acceso RBAC · Supabase Auth
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
              Portal de Administración & Socios
            </h2>
            <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto">
              Acceso restringido para consulta de liquidez neta, auditoría contable y fondo de inversión.
            </p>
          </div>
        </div>

        {/* Mensaje de guardia o advertencia */}
        {message && (
          <div className="mb-5 p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-2.5 text-amber-300 text-xs leading-relaxed">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
            <span>{message}</span>
          </div>
        )}

        {/* Mensaje de error si falla el login */}
        {errorMessage && (
          <div className="mb-5 p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-start gap-2.5 text-rose-300 text-xs leading-relaxed">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Formulario de Login */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center justify-between">
              <span>Correo Corporativo / Usuario</span>
              <span className="text-[10px] text-slate-400 font-mono">auth.users</span>
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                <Mail className="w-4 h-4" />
              </div>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="ejemplo@rutacapital.co"
                className="w-full bg-slate-950/80 border border-slate-800 rounded-xl pl-10 pr-3.5 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center justify-between">
              <span>Contraseña Segura</span>
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="text-[10px] text-emerald-400 hover:text-emerald-300 flex items-center gap-1 font-sans"
              >
                {showPassword ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                {showPassword ? 'Ocultar' : 'Ver'}
              </button>
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                <Lock className="w-4 h-4" />
              </div>
              <input
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full bg-slate-950/80 border border-slate-800 rounded-xl pl-10 pr-10 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all font-mono"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full mt-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold py-3 px-4 rounded-xl shadow-lg shadow-emerald-950/50 flex items-center justify-center gap-2 text-sm transition-all active:scale-[0.99] disabled:opacity-50"
          >
            {isLoading ? (
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                Validando perfil con Supabase...
              </span>
            ) : (
              <>
                <KeyRound className="w-4 h-4" />
                Ingresar al Panel Ejecutivo
                <ArrowRight className="w-4 h-4 ml-1" />
              </>
            )}
          </button>
        </form>

        {/* Separador */}
        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-slate-800" />
          </div>
          <div className="relative flex justify-center text-[10px] uppercase font-bold text-slate-400">
            <span className="bg-slate-900 px-2">Cuentas Pre-configuradas para Test</span>
          </div>
        </div>

        {/* Presets Rápidos para Probar RBAC y Rechazo de Cobrador */}
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => handleSelectPreset('admin@rutacapital.co', 'admin123@Medellin')}
            className={`w-full text-left p-2.5 rounded-xl border transition-all text-xs flex items-center justify-between ${
              email === 'admin@rutacapital.co'
                ? 'bg-emerald-950/40 border-emerald-500/50 text-emerald-200'
                : 'bg-slate-950/50 border-slate-800/80 text-slate-300 hover:border-slate-700'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-xs">
                CF
              </div>
              <div>
                <p className="font-semibold text-white">Esteban Ochoa (CFO / Admin)</p>
                <p className="text-[10px] text-slate-400 font-mono">admin@rutacapital.co · Rol: admin</p>
              </div>
            </div>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              Total Acceso
            </span>
          </button>

          <button
            type="button"
            onClick={() => handleSelectPreset('socio1@rutacapital.co', 'socio123@Medellin')}
            className={`w-full text-left p-2.5 rounded-xl border transition-all text-xs flex items-center justify-between ${
              email === 'socio1@rutacapital.co'
                ? 'bg-blue-950/40 border-blue-500/50 text-blue-200'
                : 'bg-slate-950/50 border-slate-800/80 text-slate-300 hover:border-slate-700'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-blue-500/20 text-blue-400 flex items-center justify-center font-bold text-xs">
                35%
              </div>
              <div>
                <p className="font-semibold text-white">Dr. Alejandro Restrepo (Socio)</p>
                <p className="text-[10px] text-slate-400 font-mono">socio1@rutacapital.co · Rol: socio</p>
              </div>
            </div>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20">
              Inversionista
            </span>
          </button>

          <button
            type="button"
            onClick={() => handleSelectPreset('cobrador@rutacapital.co', 'cobrador123@Medellin')}
            className={`w-full text-left p-2.5 rounded-xl border transition-all text-xs flex items-center justify-between ${
              email === 'cobrador@rutacapital.co'
                ? 'bg-amber-950/40 border-amber-500/50 text-amber-200'
                : 'bg-slate-950/50 border-slate-800/80 text-slate-300 hover:border-slate-700'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold text-xs">
                CB
              </div>
              <div>
                <p className="font-semibold text-white">Jhon Zapata (Cobrador)</p>
                <p className="text-[10px] text-slate-400 font-mono">cobrador@rutacapital.co · Rol: cobrador</p>
              </div>
            </div>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20">
              Probar Rechazo RLS
            </span>
          </button>
        </div>

        {/* Resumen de seguridad RLS */}
        <div className="mt-5 pt-4 border-t border-slate-800/80 text-[11px] text-slate-400 flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <Lock className="w-3 h-3 text-emerald-400" />
            Supabase RLS Enforced
          </span>
          <span className="font-mono text-[10px] text-slate-400">PostgreSQL 15</span>
        </div>
      </div>
    </div>
  );
};
