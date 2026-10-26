import React, { useState } from 'react';
import { 
  ShieldCheck, 
  Lock, 
  Mail, 
  Eye, 
  EyeOff, 
  Bike, 
  Building, 
  Users, 
  ArrowRight, 
  AlertCircle,
  KeyRound,
  CheckCircle2,
  Smartphone
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { DEMO_USERS } from '../services/supabaseAuth';

interface UnifiedLoginViewProps {
  onLoginSuccess: (role: string) => void;
  onOpenClientPortal?: () => void;
}

export const UnifiedLoginView: React.FC<UnifiedLoginViewProps> = ({ 
  onLoginSuccess,
  onOpenClientPortal
}) => {
  const { login } = useAuth();

  const [activeTab, setActiveTab] = useState<'cobrador' | 'admin'>('cobrador');
  const [email, setEmail] = useState('cobrador@rutacapital.co');
  const [password, setPassword] = useState('cobrador123@Medellin');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleTabChange = (tab: 'cobrador' | 'admin') => {
    setActiveTab(tab);
    setErrorMessage(null);
    if (tab === 'cobrador') {
      setEmail('cobrador@rutacapital.co');
      setPassword('cobrador123@Medellin');
    } else {
      setEmail('admin@rutacapital.co');
      setPassword('admin123@Medellin');
    }
  };

  const handleSelectPreset = (userEmail: string, userPass: string, tab: 'cobrador' | 'admin') => {
    setActiveTab(tab);
    setEmail(userEmail);
    setPassword(userPass);
    setErrorMessage(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setIsLoading(true);

    try {
      const result = await login(email, password, false);
      setIsLoading(false);

      if (result.success) {
        // Detectar rol del usuario autenticado
        const matchedDemo = DEMO_USERS[email.trim().toLowerCase()];
        const userRole = matchedDemo?.profile?.role || (activeTab === 'cobrador' ? 'cobrador' : 'admin');
        onLoginSuccess(userRole);
      } else {
        setErrorMessage(result.error || 'Credenciales no autorizadas. Verifique su correo y contraseña.');
      }
    } catch (err: any) {
      setIsLoading(false);
      setErrorMessage(err.message || 'Error de conexión con el servidor de autenticación.');
    }
  };

  return (
    <div className="min-h-[85vh] flex items-center justify-center py-6 px-3 sm:px-6">
      <div className="w-full max-w-md bg-slate-900 border-2 border-slate-800 rounded-3xl p-5 sm:p-8 shadow-2xl relative overflow-hidden backdrop-blur-xl">
        {/* Glow de seguridad de fondo */}
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* LOGO Y ENCABEZADO DE BLINDAJE */}
        <div className="text-center space-y-2 mb-6 relative">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-400 mx-auto flex items-center justify-center text-white shadow-lg shadow-emerald-950/50">
            <ShieldCheck className="w-8 h-8 stroke-[2.2]" />
          </div>
          
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-[10px] font-black text-emerald-400 uppercase tracking-widest mb-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
              Acceso Obligatorio · Protocolo Cero-Confianza
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
              RutaCapital OS
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Identifícate con tus credenciales para acceder a la ruta o panel financiero
            </p>
          </div>
        </div>

        {/* SELECTOR DE PERFIL / ROL (TABS GRANDES PARA DEDO) */}
        <div className="grid grid-cols-2 gap-1.5 bg-slate-950 p-1.5 rounded-2xl border border-slate-800 mb-5">
          <button
            type="button"
            onClick={() => handleTabChange('cobrador')}
            className={`flex items-center justify-center gap-2 py-3 px-2 rounded-xl text-xs font-black transition-all ${
              activeTab === 'cobrador'
                ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-950/60'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Bike className="w-4 h-4" />
            <span>Cobrador (Calle)</span>
          </button>

          <button
            type="button"
            onClick={() => handleTabChange('admin')}
            className={`flex items-center justify-center gap-2 py-3 px-2 rounded-xl text-xs font-black transition-all ${
              activeTab === 'admin'
                ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-950/60'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Building className="w-4 h-4" />
            <span>Admin / Socio</span>
          </button>
        </div>

        {/* MENSAJE DE ERROR */}
        {errorMessage && (
          <div className="mb-4 p-3 rounded-2xl bg-rose-500/15 border border-rose-500/40 text-rose-300 text-xs flex items-center gap-2 animate-in fade-in duration-200">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* FORMULARIO DE ACCESO */}
        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div>
            <label className="text-slate-300 font-bold block mb-1.5">
              Correo Electrónico
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-3.5" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="usuario@rutacapital.co"
                className="w-full bg-slate-950 border-2 border-slate-800 rounded-2xl pl-10 pr-4 py-3 text-white text-xs placeholder-slate-600 focus:outline-none focus:border-emerald-500 font-medium transition-colors"
              />
            </div>
          </div>

          <div>
            <label className="text-slate-300 font-bold block mb-1.5">
              Contraseña
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-3.5" />
              <input
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full bg-slate-950 border-2 border-slate-800 rounded-2xl pl-10 pr-10 py-3 text-white text-xs placeholder-slate-600 focus:outline-none focus:border-emerald-500 font-medium transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3.5 top-3.5 text-slate-400 hover:text-white"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* BOTÓN PRIMARIO DE LOGIN */}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3.5 px-4 bg-emerald-600 hover:bg-emerald-500 active:scale-[0.98] text-white font-black text-sm rounded-2xl shadow-xl shadow-emerald-950/60 flex items-center justify-center gap-2 transition-all disabled:opacity-50 mt-2"
          >
            {isLoading ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Verificando Identidad...</span>
              </>
            ) : (
              <>
                <span>{activeTab === 'cobrador' ? 'Ingresar a Mi Ruta de Cobro' : 'Ingresar al Cockpit Financiero'}</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        {/* ACCESOS RÁPIDOS AUTORIZADOS (PRESETS PARA PRUEBAS SIN DIGITAR) */}
        <div className="mt-6 pt-5 border-t border-slate-800/80">
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block text-center mb-2.5">
            Cuentas Autorizadas para Campo & Pruebas
          </span>

          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <button
              type="button"
              onClick={() => handleSelectPreset('cobrador@rutacapital.co', 'cobrador123@Medellin', 'cobrador')}
              className={`p-2.5 rounded-xl border text-left transition-all ${
                email === 'cobrador@rutacapital.co'
                  ? 'bg-emerald-950/50 border-emerald-500/60 text-emerald-300'
                  : 'bg-slate-950/70 border-slate-800 text-slate-300 hover:border-slate-700'
              }`}
            >
              <div className="font-bold flex items-center gap-1">
                <Bike className="w-3 h-3 text-emerald-400" />
                <span>Cobrador 1</span>
              </div>
              <div className="text-[10px] text-slate-400 truncate">Ruta 1 (San Javier)</div>
            </button>

            <button
              type="button"
              onClick={() => handleSelectPreset('cobrador2@rutacapital.co', 'cobrador123@Medellin', 'cobrador')}
              className={`p-2.5 rounded-xl border text-left transition-all ${
                email === 'cobrador2@rutacapital.co'
                  ? 'bg-emerald-950/50 border-emerald-500/60 text-emerald-300'
                  : 'bg-slate-950/70 border-slate-800 text-slate-300 hover:border-slate-700'
              }`}
            >
              <div className="font-bold flex items-center gap-1">
                <Bike className="w-3 h-3 text-emerald-400" />
                <span>Cobrador 2</span>
              </div>
              <div className="text-[10px] text-slate-400 truncate">Ruta 2 (Manrique)</div>
            </button>

            <button
              type="button"
              onClick={() => handleSelectPreset('admin@rutacapital.co', 'admin123@Medellin', 'admin')}
              className={`p-2.5 rounded-xl border text-left transition-all ${
                email === 'admin@rutacapital.co'
                  ? 'bg-emerald-950/50 border-emerald-500/60 text-emerald-300'
                  : 'bg-slate-950/70 border-slate-800 text-slate-300 hover:border-slate-700'
              }`}
            >
              <div className="font-bold flex items-center gap-1">
                <Building className="w-3 h-3 text-emerald-400" />
                <span>Admin CFO</span>
              </div>
              <div className="text-[10px] text-slate-400 truncate">Control Total & Arqueos</div>
            </button>

            <button
              type="button"
              onClick={() => handleSelectPreset('socio1@rutacapital.co', 'socio123@Medellin', 'admin')}
              className={`p-2.5 rounded-xl border text-left transition-all ${
                email === 'socio1@rutacapital.co'
                  ? 'bg-emerald-950/50 border-emerald-500/60 text-emerald-300'
                  : 'bg-slate-950/70 border-slate-800 text-slate-300 hover:border-slate-700'
              }`}
            >
              <div className="font-bold flex items-center gap-1">
                <Users className="w-3 h-3 text-blue-400" />
                <span>Socio Inversor</span>
              </div>
              <div className="text-[10px] text-slate-400 truncate">Fondo & Dividendos</div>
            </button>
          </div>
        </div>

        {/* ACCESO ALTERNO PARA CLIENTES / DEUDORES */}
        {onOpenClientPortal && (
          <div className="mt-5 text-center pt-4 border-t border-slate-800/80">
            <button
              type="button"
              onClick={onOpenClientPortal}
              className="text-xs text-slate-400 hover:text-emerald-400 font-semibold transition-colors inline-flex items-center gap-1"
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span>¿Eres cliente / deudor? Consulta tu cuota con tu cédula aquí</span>
            </button>
          </div>
        )}

      </div>
    </div>
  );
};
