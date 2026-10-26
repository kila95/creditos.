import React, { useState } from 'react';
import { 
  X, 
  UserPlus, 
  Phone, 
  MapPin, 
  Store, 
  DollarSign, 
  Calendar, 
  CheckCircle2, 
  AlertCircle,
  Bike,
  FileText
} from 'lucide-react';
import { RouteData, ClientProfile, LoanDetail } from '../data/mockData';
import { formatCOP } from '../utils/financialCalculations';
import { insertClientAndLoanToDB } from '../services/clientSyncService';

interface QuickClientRouteRegistrationModalProps {
  currentRoute: RouteData;
  onClose: () => void;
  onClientRegistered: (client: ClientProfile, loan: LoanDetail) => void;
}

export const QuickClientRouteRegistrationModal: React.FC<QuickClientRouteRegistrationModalProps> = ({
  currentRoute,
  onClose,
  onClientRegistered
}) => {
  // Datos del Cliente en Calle
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [tradeName, setTradeName] = useState('');
  const [document, setDocument] = useState('');

  // Parámetros Rápidos del Crédito
  const [principal, setPrincipal] = useState<number>(500000);
  const [interestRate, setInterestRate] = useState<number>(20); // 20% flat estándar en Medellín
  const [termDays, setTermDays] = useState<number>(24); // 24 días hábiles

  // Estados de carga y error detallado de Base de Datos / RLS
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorDetails, setErrorDetails] = useState<{ code?: string; hint?: string } | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Cálculos financieros automáticos
  const totalDebt = Math.round(principal * (1 + interestRate / 100));
  const dailyInstallment = Math.round(totalDebt / termDays);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setErrorDetails(null);

    if (!name.trim() || !phone.trim() || !address.trim()) {
      setErrorMessage('Por favor ingresa Nombre Completo, Teléfono/WhatsApp y Dirección.');
      return;
    }

    setIsSubmitting(true);

    const { data, error } = await insertClientAndLoanToDB({
      name: name.trim(),
      tradeName: tradeName.trim() || name.trim(),
      document: document.trim(),
      phone: phone.trim(),
      category: 'Micronegocio Local',
      address: address.trim(),
      neighborhood: currentRoute.zone,
      routeId: currentRoute.id,
      principal,
      interestRate,
      termDays,
    });

    setIsSubmitting(false);

    // Captura estricta de errores de Supabase / RLS / Base de Datos
    if (error || !data) {
      console.error('❌ [Error al insertar cliente en tabla clients]:', error);
      setErrorMessage(
        error?.message ||
          'La base de datos rechazó el registro. Verifica las políticas RLS (INSERT) en la tabla clients.'
      );
      setErrorDetails({
        code: error?.code,
        hint: error?.hint,
      });
      return;
    }

    // Inserción confirmada en Base de Datos -> Actualizar listado en tiempo real sin recargar la página
    onClientRegistered(data.client, data.loan);
    setSuccessMessage(`¡${data.client.name} guardado en la base de datos e integrado a ${currentRoute.name}!`);

    setTimeout(() => {
      onClose();
    }, 650);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-slate-900 border-2 border-emerald-500/40 rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden my-auto animate-in zoom-in-95 duration-200">
        
        {/* ENCABEZADO MÓVIL */}
        <div className="bg-gradient-to-r from-emerald-950 to-slate-900 p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shrink-0">
              <UserPlus className="w-6 h-6 stroke-[2.5]" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-white">
                Registrar Nuevo Deudor
              </h2>
              <div className="flex items-center gap-1.5 text-xs text-emerald-300 font-bold">
                <Bike className="w-3.5 h-3.5" />
                <span className="truncate max-w-[220px]">{currentRoute.name}</span>
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* MENSAJES DE ESTADO Y DIAGNÓSTICO RLS / SUPABASE */}
        {errorMessage && (
          <div className="mx-4 mt-3 p-3.5 rounded-2xl bg-rose-950/70 border border-rose-500/50 text-rose-200 text-xs space-y-1.5">
            <div className="flex items-start gap-2 font-bold text-rose-300">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
            {errorDetails?.code && (
              <div className="text-[11px] font-mono text-rose-300/90 pl-6">
                Código SQL/Supabase: {errorDetails.code}
              </div>
            )}
            {errorDetails?.hint && (
              <div className="text-[11px] text-rose-200/80 pl-6">
                Sugerencia: {errorDetails.hint}
              </div>
            )}
          </div>
        )}

        {successMessage && (
          <div className="mx-4 mt-3 p-3 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{successMessage}</span>
          </div>
        )}

        {/* FORMULARIO ÁGIL DE CALLE */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-5 space-y-3.5 text-xs">
          {/* CAMPO 1: NOMBRE */}
          <div>
            <label className="text-slate-300 font-bold block mb-1">
              Nombre Completo del Deudor *
            </label>
            <input
              type="text"
              required
              autoFocus
              placeholder="Ej. Andrés Felipe Restrepo"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-slate-950 border-2 border-slate-800 focus:border-emerald-500 rounded-xl px-3.5 py-3 text-white text-xs placeholder-slate-600 font-medium focus:outline-none transition-colors"
            />
          </div>

          {/* CAMPO 2: TELÉFONO / WHATSAPP */}
          <div>
            <label className="text-slate-300 font-bold block mb-1">
              Teléfono / WhatsApp *
            </label>
            <div className="relative">
              <Phone className="w-4 h-4 text-slate-500 absolute left-3.5 top-3.5" />
              <input
                type="tel"
                required
                placeholder="Ej. 312 849 2011"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full bg-slate-950 border-2 border-slate-800 focus:border-emerald-500 rounded-xl pl-10 pr-3.5 py-3 text-white text-xs placeholder-slate-600 font-medium focus:outline-none transition-colors"
              />
            </div>
          </div>

          {/* CAMPO 3: DIRECCIÓN */}
          <div>
            <label className="text-slate-300 font-bold block mb-1">
              Dirección del Negocio o Domicilio *
            </label>
            <div className="relative">
              <MapPin className="w-4 h-4 text-slate-500 absolute left-3.5 top-3.5" />
              <input
                type="text"
                required
                placeholder="Ej. Cra 110 # 42-10 (Local / Casa)"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="w-full bg-slate-950 border-2 border-slate-800 focus:border-emerald-500 rounded-xl pl-10 pr-3.5 py-3 text-white text-xs placeholder-slate-600 font-medium focus:outline-none transition-colors"
              />
            </div>
          </div>

          {/* CAMPOS COMPLEMENTARIOS (OPCIONALES RÁPIDOS) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-slate-400 text-[11px] block mb-1">
                Nombre del Negocio (Opcional)
              </label>
              <div className="relative">
                <Store className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-3" />
                <input
                  type="text"
                  placeholder="Ej. Tienda La 13"
                  value={tradeName}
                  onChange={(e) => setTradeName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-8 pr-3 py-2 text-white text-xs focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            <div>
              <label className="text-slate-400 text-[11px] block mb-1">
                Cédula (Opcional)
              </label>
              <div className="relative">
                <FileText className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-3" />
                <input
                  type="text"
                  placeholder="Ej. 1017384920"
                  value={document}
                  onChange={(e) => setDocument(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-8 pr-3 py-2 text-white text-xs focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>
          </div>

          {/* MONTO DEL CRÉDITO INICIAL DESEMBOLSADO EN CALLE */}
          <div className="pt-2 border-t border-slate-800">
            <label className="text-slate-300 font-bold block mb-1.5 flex items-center justify-between">
              <span>Monto Desembolsado en Calle:</span>
              <span className="font-mono text-emerald-400 font-black text-sm">{formatCOP(principal)}</span>
            </label>

            {/* BOTONES TÁCTILES RÁPIDOS DE MONTO */}
            <div className="grid grid-cols-4 gap-1.5 mb-2.5">
              {[300000, 500000, 800000, 1000000].map((monto) => (
                <button
                  key={monto}
                  type="button"
                  onClick={() => setPrincipal(monto)}
                  className={`py-2 px-1 rounded-xl text-[11px] font-bold border transition-all ${
                    principal === monto
                      ? 'bg-emerald-600 text-white border-emerald-500 shadow-md shadow-emerald-950'
                      : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  ${(monto / 1000)}k
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-slate-400 text-[10px] block mb-1">Plazo de Cobro</label>
                <select
                  value={termDays}
                  onChange={(e) => setTermDays(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2 text-white text-xs focus:outline-none focus:border-emerald-500 font-bold"
                >
                  <option value={20}>20 Días hábiles</option>
                  <option value={24}>24 Días hábiles (Estándar)</option>
                  <option value={30}>30 Días corridos</option>
                </select>
              </div>

              <div>
                <label className="text-slate-400 text-[10px] block mb-1">Tasa Mensual Flat</label>
                <select
                  value={interestRate}
                  onChange={(e) => setInterestRate(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2 text-white text-xs focus:outline-none focus:border-emerald-500 font-bold text-emerald-300"
                >
                  <option value={20}>20% Flat (Estándar)</option>
                  <option value={15}>15% Flat</option>
                  <option value={25}>25% Flat</option>
                </select>
              </div>
            </div>

            {/* RESUMEN TÁCTIL DE COBRO DIARIO */}
            <div className="mt-3 bg-slate-950 border border-emerald-500/30 rounded-2xl p-3 flex items-center justify-between text-center">
              <div>
                <span className="text-[10px] text-slate-400 block font-medium">Cuota Diaria a Cobrar</span>
                <span className="text-base font-black text-white font-mono">{formatCOP(dailyInstallment)}</span>
              </div>
              <div className="border-l border-slate-800 pl-3">
                <span className="text-[10px] text-slate-400 block font-medium">Total Cartera</span>
                <span className="text-sm font-black text-emerald-400 font-mono">{formatCOP(totalDebt)}</span>
              </div>
              <div className="border-l border-slate-800 pl-3">
                <span className="text-[10px] text-slate-400 block font-medium">Ruta Asignada</span>
                <span className="text-[11px] font-bold text-emerald-300 truncate max-w-[90px] block">{currentRoute.code}</span>
              </div>
            </div>
          </div>

          {/* BOTÓN PRIMARIO DE GUARDAR */}
          <div className="pt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="py-3.5 px-4 rounded-xl border border-slate-800 text-slate-300 font-bold hover:bg-slate-800 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 py-3.5 px-4 bg-emerald-600 hover:bg-emerald-500 active:scale-[0.98] text-white font-black text-xs sm:text-sm rounded-xl shadow-lg shadow-emerald-950/60 flex items-center justify-center gap-2 transition-all disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Guardando en Ruta...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Guardar y Agregar a la Ruta de Hoy</span>
                </>
              )}
            </button>
          </div>
        </form>

      </div>
    </div>
  );
};
