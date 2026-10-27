import React, { useState } from 'react';
import {
  X,
  UserPlus,
  Phone,
  MapPin,
  Store,
  DollarSign,
  Calendar,
  Percent,
  Clock,
  CheckCircle2,
  AlertCircle,
  Bike,
  FileText,
  Users,
} from 'lucide-react';
import { RouteData, ClientProfile, LoanDetail } from '../data/mockData';
import { formatCOP } from '../utils/financialCalculations';
import { useAuth } from '../context/AuthContext';
import {
  insertClientAndLoanToDB,
  createCustomLoanInDB,
  LoanModality,
} from '../services/clientSyncService';
import {
  calculateLoanSchedule,
  convertInstallmentsOnModalityChange,
  MODALITY_METADATA,
} from '../utils/loanFrequencyCalculator';

interface QuickClientRouteRegistrationModalProps {
  currentRoute: RouteData;
  routeClients?: ClientProfile[];
  onClose: () => void;
  onClientRegistered: (client: ClientProfile, loan: LoanDetail) => void;
  onLoanCreatedForExistingClient?: (loan: LoanDetail) => void;
}

export const QuickClientRouteRegistrationModal: React.FC<QuickClientRouteRegistrationModalProps> = ({
  currentRoute,
  routeClients = [],
  onClose,
  onClientRegistered,
  onLoanCreatedForExistingClient,
}) => {
  const { profile } = useAuth();
  // Modo en calle: crear préstamo a un cliente ya existente en la ruta o registrar cliente nuevo + préstamo
  const [mode, setMode] = useState<'new_client' | 'existing_client'>('new_client');
  const [selectedClientId, setSelectedClientId] = useState<string>(routeClients[0]?.id || '');

  // Datos del Cliente en Calle
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [tradeName, setTradeName] = useState('');
  const [document, setDocument] = useState('');

  // =========================================================================
  // 1. PARÁMETROS LIBRES DEL CRÉDITO Y FRECUENCIA DE PAGO
  // =========================================================================
  const [principalInput, setPrincipalInput] = useState<string>('500000');
  const [interestRateInput, setInterestRateInput] = useState<string>('20');
  const [termInstallmentsInput, setTermInstallmentsInput] = useState<string>('24');
  const [modality, setModality] = useState<LoanModality>('diaria');

  // Estados de carga y error detallado de Base de Datos / RLS
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorDetails, setErrorDetails] = useState<{ code?: string; hint?: string } | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // =========================================================================
  // 2. CÁLCULO AUTOMÁTICO EN TIEMPO REAL SEGÚN MONTO, TASA, PLAZO Y FRECUENCIA
  // =========================================================================
  const schedule = calculateLoanSchedule(
    principalInput,
    interestRateInput,
    termInstallmentsInput,
    modality
  );

  const numericPrincipal = schedule.principal;
  const numericInterestRate = schedule.interestRate;
  const numericTermInstallments = schedule.numberOfInstallments;
  const totalInterest = schedule.totalInterest;
  const totalDebt = schedule.totalToPay;
  const installmentAmount = schedule.installmentValue;
  const currentModalityMeta = MODALITY_METADATA[modality];

  const handleModalityChange = (nextModality: LoanModality) => {
    const convertedInstallments = convertInstallmentsOnModalityChange(
      modality,
      nextModality,
      Number(termInstallmentsInput) || MODALITY_METADATA[modality].defaultInstallments
    );
    setModality(nextModality);
    setTermInstallmentsInput(String(convertedInstallments));
  };

  const selectedExistingClient = routeClients.find((c) => c.id === selectedClientId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setErrorDetails(null);

    if (numericPrincipal <= 0) {
      setErrorMessage('Ingresa un Monto del Préstamo válido mayor a $0 COP.');
      return;
    }

    if (numericTermInstallments <= 0) {
      setErrorMessage('El Plazo / Número de Cuotas debe ser mayor o igual a 1.');
      return;
    }

    setIsSubmitting(true);

    // CASO A: Crear préstamo en `loans` para un cliente ya registrado en la ruta
    if (mode === 'existing_client') {
      if (!selectedExistingClient) {
        setIsSubmitting(false);
        setErrorMessage('Selecciona un cliente válido de tu ruta.');
        return;
      }

      const userOrgId = profile?.organizationId || 'org-medellin-01';
      const userCreatorId = profile?.id || 'usr-admin-001';

      const { data: createdLoan, error } = await createCustomLoanInDB({
        clientId: selectedExistingClient.id,
        clientName: selectedExistingClient.name,
        tradeName: selectedExistingClient.tradeName,
        routeId: currentRoute.id,
        organizationId: userOrgId,
        tenantId: userOrgId,
        createdBy: userCreatorId,
        principal: numericPrincipal,
        interestRate: numericInterestRate,
        termInstallments: numericTermInstallments,
        modality,
      });

      setIsSubmitting(false);

      if (error || !createdLoan) {
        console.error('❌ [Error al insertar préstamo en tabla loans]:', error);
        setErrorMessage(
          error?.message ||
            'Error al guardar en base de datos: La base de datos rechazó el préstamo. Verifica las políticas RLS en la tabla loans.'
        );
        setErrorDetails({ code: error?.code, hint: error?.hint });
        return;
      }

      if (onLoanCreatedForExistingClient) {
        onLoanCreatedForExistingClient(createdLoan);
      }

      setSuccessMessage(
        `¡Préstamo ${createdLoan.code} creado para ${selectedExistingClient.name} en ${currentRoute.name}!`
      );
      setTimeout(() => {
        onClose();
      }, 650);
      return;
    }

    // CASO B: Registrar nuevo cliente en ruta + insertar su préstamo personalizado en `loans`
    if (!name.trim() || !phone.trim() || !address.trim()) {
      setIsSubmitting(false);
      setErrorMessage('Por favor ingresa Nombre Completo, Teléfono/WhatsApp y Dirección.');
      return;
    }

    const safeRouteId = currentRoute?.id || 'route-1';
    const safeZone = currentRoute?.zone || 'Medellín Metropolitana';

    const userOrgId = profile?.organizationId || 'org-medellin-01';
    const userCreatorId = profile?.id || 'usr-admin-001';

    const { data, error } = await insertClientAndLoanToDB({
      name: name.trim(),
      tradeName: tradeName.trim() || name.trim(),
      document: document.trim(),
      phone: phone.trim(),
      category: 'Micronegocio Local',
      address: address.trim(),
      neighborhood: safeZone,
      routeId: safeRouteId,
      organizationId: userOrgId,
      tenantId: userOrgId,
      createdBy: userCreatorId,
      principal: numericPrincipal,
      interestRate: numericInterestRate,
      termDays: numericTermInstallments,
      modality,
    });

    setIsSubmitting(false);

    if (error || !data) {
      console.error('❌ [Error al insertar cliente/préstamo]:', error);
      const isDuplicate =
        error?.code === '23505' ||
        error?.message?.includes('23505') ||
        error?.message?.toLowerCase().includes('ya existe');

      setErrorMessage(
        isDuplicate
          ? 'Error: Ya existe un usuario o cliente registrado con este documento o correo.'
          : error?.message ||
            'La base de datos rechazó el registro. Verifica las políticas RLS (INSERT) en clients y loans.'
      );
      setErrorDetails({
        code: error?.code,
        hint: error?.hint,
      });
      return;
    }

    onClientRegistered(data.client, data.loan);
    setSuccessMessage(
      `¡Préstamo ${data.loan.code} y cliente ${data.client.name} guardados en ${currentRoute.name}!`
    );

    setTimeout(() => {
      onClose();
    }, 650);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden my-auto">
        {/* ENCABEZADO MÓVIL */}
        <div className="bg-slate-950 p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
              <UserPlus className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">
                Crear Préstamo & Vincular Deudor en Ruta
              </h2>
              <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-medium">
                <Bike className="w-3.5 h-3.5" />
                <span className="truncate max-w-[220px]">{currentRoute.name}</span>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* MENSAJES DE ESTADO Y DIAGNÓSTICO RLS / SUPABASE */}
        {errorMessage && (
          <div className="mx-4 mt-3 p-3.5 rounded-xl bg-rose-950/70 border border-rose-500/50 text-rose-200 text-xs space-y-1">
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
              <div className="text-[11px] text-rose-200/80 pl-6">Sugerencia: {errorDetails.hint}</div>
            )}
          </div>
        )}

        {successMessage && (
          <div className="mx-4 mt-3 p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{successMessage}</span>
          </div>
        )}

        {/* FORMULARIO ÁGIL DE CALLE */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-5 space-y-4 text-xs">
          {/* SELECTOR DE CLIENTE: NUEVO DEUDOR vs CLIENTE EXISTENTE EN RUTA */}
          {routeClients.length > 0 && (
            <div className="grid grid-cols-2 gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800">
              <button
                type="button"
                onClick={() => setMode('new_client')}
                className={`py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  mode === 'new_client'
                    ? 'bg-emerald-500 text-slate-950'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                + Nuevo Cliente en Ruta
              </button>
              <button
                type="button"
                onClick={() => setMode('existing_client')}
                className={`py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  mode === 'existing_client'
                    ? 'bg-emerald-500 text-slate-950'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Cliente Existente ({routeClients.length})
              </button>
            </div>
          )}

          {mode === 'existing_client' && routeClients.length > 0 ? (
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 space-y-2">
              <label className="text-slate-300 font-semibold block flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-emerald-400" />
                Seleccionar Cliente de la Ruta (<code className="font-mono text-emerald-400">client_id</code>)
              </label>
              <select
                value={selectedClientId}
                onChange={(e) => setSelectedClientId(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5 text-white font-medium focus:outline-none focus:border-emerald-500"
              >
                {routeClients.map((cl) => (
                  <option key={cl.id} value={cl.id}>
                    {cl.name} — {cl.tradeName} ({cl.address})
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <label className="text-slate-300 font-semibold block mb-1">
                  Nombre Completo del Deudor *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej. Andrés Felipe Restrepo"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-lg px-3.5 py-2.5 text-white focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-300 font-semibold block mb-1">
                    Teléfono / WhatsApp *
                  </label>
                  <div className="relative">
                    <Phone className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-3" />
                    <input
                      type="tel"
                      required
                      placeholder="Ej. 312 849 2011"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-lg pl-9 pr-3 py-2.5 text-white focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-slate-300 font-semibold block mb-1">
                    Dirección Negocio / Casa *
                  </label>
                  <div className="relative">
                    <MapPin className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-3" />
                    <input
                      type="text"
                      required
                      placeholder="Ej. Cra 110 # 42-10"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-lg pl-9 pr-3 py-2.5 text-white focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-400 text-[11px] block mb-1">
                    Nombre Negocio (Opcional)
                  </label>
                  <div className="relative">
                    <Store className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      placeholder="Ej. Tienda La 13"
                      value={tradeName}
                      onChange={(e) => setTradeName(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-8 pr-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-slate-400 text-[11px] block mb-1">Cédula (Opcional)</label>
                  <div className="relative">
                    <FileText className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      placeholder="Ej. 1017384920"
                      value={document}
                      onChange={(e) => setDocument(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-8 pr-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* =====================================================================
              CONDICIONES DEL PRÉSTAMO CON CAMPOS NUMÉRICOS 100% LIBRES
             ===================================================================== */}
          <div className="pt-3 border-t border-slate-800 space-y-3">
            <span className="text-[11px] font-mono uppercase tracking-wider text-emerald-400 font-semibold block">
              Condiciones Personalizadas del Préstamo (Monto y Tasa Libres)
            </span>

            <div className="grid grid-cols-2 gap-3">
              {/* MONTO LIBRE */}
              <div>
                <label className="text-slate-300 font-medium block mb-1">
                  Monto del Préstamo (COP) *
                </label>
                <div className="relative">
                  <DollarSign className="w-3.5 h-3.5 text-emerald-400 absolute left-3 top-2.5" />
                  <input
                    type="number"
                    required
                    min={1000}
                    step="any"
                    placeholder="Ej. 500000"
                    value={principalInput}
                    onChange={(e) => setPrincipalInput(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 focus:border-emerald-500 rounded-lg pl-8 pr-3 py-2 text-white font-mono tabular-nums font-bold text-sm focus:outline-none"
                  />
                </div>
              </div>

              {/* TASA DE INTERÉS LIBRE */}
              <div>
                <label className="text-slate-300 font-medium block mb-1">
                  Porcentaje Interés (%) *
                </label>
                <div className="relative">
                  <Percent className="w-3.5 h-3.5 text-amber-400 absolute left-3 top-2.5" />
                  <input
                    type="number"
                    required
                    min={0}
                    step="0.1"
                    placeholder="Ej. 20"
                    value={interestRateInput}
                    onChange={(e) => setInterestRateInput(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 focus:border-emerald-500 rounded-lg pl-8 pr-3 py-2 text-white font-mono tabular-nums font-bold text-sm focus:outline-none"
                  />
                </div>
              </div>

              {/* FRECUENCIA DE PAGO */}
              <div>
                <label className="text-slate-300 font-medium block mb-1">
                  Frecuencia de Pago *
                </label>
                <div className="relative">
                  <Clock className="w-3.5 h-3.5 text-indigo-400 absolute left-3 top-2.5" />
                  <select
                    value={modality}
                    onChange={(e) => handleModalityChange(e.target.value as LoanModality)}
                    className="w-full bg-slate-950 border border-slate-700 focus:border-emerald-500 rounded-lg pl-8 pr-3 py-2 text-white font-semibold focus:outline-none"
                  >
                    <option value="diaria">Diaria (días)</option>
                    <option value="semanal">Semanal (semanas)</option>
                    <option value="quincenal">Quincenal (quincenas)</option>
                    <option value="mensual">Mensual (meses)</option>
                  </select>
                </div>
              </div>

              {/* PLAZO / NÚMERO DE CUOTAS SEGÚN FRECUENCIA */}
              <div>
                <label className="text-slate-300 font-medium block mb-1">
                  Plazo (N° de {currentModalityMeta.unitPlural}) *
                </label>
                <div className="relative">
                  <Calendar className="w-3.5 h-3.5 text-sky-400 absolute left-3 top-2.5" />
                  <input
                    type="number"
                    required
                    min={1}
                    step={1}
                    placeholder={currentModalityMeta.placeholder}
                    value={termInstallmentsInput}
                    onChange={(e) => setTermInstallmentsInput(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 focus:border-emerald-500 rounded-lg pl-8 pr-3 py-2 text-white font-mono tabular-nums font-bold text-sm focus:outline-none"
                  />
                </div>
              </div>
            </div>

            {/* CÁLCULO AUTOMÁTICO DEL TOTAL Y LA CUOTA EN TIEMPO REAL */}
            <div className="bg-slate-950 border border-emerald-500/30 rounded-xl p-3.5 grid grid-cols-3 gap-2 text-center">
              <div>
                <span className="text-[10px] text-slate-400 block">Interés ({numericInterestRate}%)</span>
                <span className="text-xs sm:text-sm font-bold text-amber-400 font-mono tabular-nums">
                  +{formatCOP(totalInterest)}
                </span>
              </div>
              <div className="border-x border-slate-800 px-2">
                <span className="text-[10px] text-emerald-300 font-semibold block">
                  Total a Pagar
                </span>
                <span className="text-xs sm:text-sm font-bold text-emerald-400 font-mono tabular-nums">
                  {formatCOP(totalDebt)}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-sky-300 font-semibold block">
                  Cuota {currentModalityMeta.label} ({numericTermInstallments}{' '}
                  {numericTermInstallments === 1
                    ? currentModalityMeta.unitSingular
                    : currentModalityMeta.unitPlural}
                  )
                </span>
                <span className="text-xs sm:text-sm font-bold text-white font-mono tabular-nums">
                  {formatCOP(installmentAmount)}
                </span>
              </div>
            </div>
          </div>

          {/* BOTONES DE GUARDADO */}
          <div className="pt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="py-3 px-4 rounded-xl border border-slate-700 text-slate-300 font-semibold hover:bg-slate-800 transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 py-3 px-4 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs sm:text-sm rounded-xl shadow-lg flex items-center justify-center gap-2 transition-all disabled:opacity-50 cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                  <span>Guardando en tabla loans...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Crear Préstamo</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
