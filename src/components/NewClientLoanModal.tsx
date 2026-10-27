import { useAuth } from '../context/AuthContext';
import React, { useState, useEffect } from 'react';
import {
  X,
  UserPlus,
  DollarSign,
  Calendar,
  Percent,
  CheckCircle2,
  AlertCircle,
  FileText,
  Users,
  Calculator,
  Clock,
} from 'lucide-react';
import { RouteData, ClientProfile, LoanDetail } from '../data/mockData';
import { formatCOP } from '../utils/financialCalculations';
import {
  insertClientAndLoanToDB,
  createCustomLoanInDB,
  computeDefaultPaymentDays,
  LoanModality,
} from '../services/clientSyncService';
import {
  calculateLoanSchedule,
  convertInstallmentsOnModalityChange,
  MODALITY_METADATA,
} from '../utils/loanFrequencyCalculator';

interface NewClientLoanModalProps {
  routes: RouteData[];
  clients?: ClientProfile[];
  defaultSelectedClientId?: string;
  suggestedAmount?: number;
  onClose: () => void;
  onClientCreated: (newClient: ClientProfile, newLoan: LoanDetail) => void;
  onLoanCreatedForExistingClient?: (newLoan: LoanDetail) => void;
}

export const NewClientLoanModal: React.FC<NewClientLoanModalProps> = ({
  routes,
  clients = [],
  defaultSelectedClientId,
  suggestedAmount,
  onClose,
  onClientCreated,
  onLoanCreatedForExistingClient,
}) => {
  const { profile } = useAuth();

  // Modo de operación: 'existing_client' (vincular a client_id existente) o 'new_client' (registrar cliente y crear préstamo)
  const [mode, setMode] = useState<'existing_client' | 'new_client'>(
    defaultSelectedClientId || clients.length > 0 ? 'existing_client' : 'new_client'
  );
  const [selectedClientId, setSelectedClientId] = useState<string>(
    defaultSelectedClientId || clients[0]?.id || ''
  );

  // Datos de Nuevo Cliente (cuando mode === 'new_client')
  const [name, setName] = useState('');
  const [tradeName, setTradeName] = useState('');
  const [document, setDocument] = useState('');
  const [phone, setPhone] = useState('');
  const [category, setCategory] = useState('Comercio / Abarrotes');
  const [address, setAddress] = useState('');
  const [neighborhood, setNeighborhood] = useState('Comuna 13 - San Javier');
  const [routeId, setRouteId] = useState(routes[0]?.id || 'route-1');
  const [isCustomRoute, setIsCustomRoute] = useState(false);
  const [customRouteName, setCustomRouteName] = useState('');
  const [guarantorName, setGuarantorName] = useState('');
  const [guarantorPhone, setGuarantorPhone] = useState('');

  // =========================================================================
  // 1. CAMPOS NUMÉRICOS LIBRES DEL PRÉSTAMO Y FRECUENCIA DE PAGO
  // Regla 1: Usar suggestedAmount (monto original + 20%) como valor inicial
  // =========================================================================
  const [principalInput, setPrincipalInput] = useState<string>(
    suggestedAmount && suggestedAmount > 0 ? String(suggestedAmount) : '500000'
  ); // Monto en COP

  // Sincronizar monto inicial si suggestedAmount cambia dinámicamente
  useEffect(() => {
    if (suggestedAmount && suggestedAmount > 0) {
      setPrincipalInput(String(suggestedAmount));
    }
  }, [suggestedAmount]);
  const [interestRateInput, setInterestRateInput] = useState<string>('20'); // Porcentaje de interés libre (%)
  const [termInstallmentsInput, setTermInstallmentsInput] = useState<string>('24'); // Número de cuotas según frecuencia
  const [modality, setModality] = useState<LoanModality>('diaria'); // Frecuencia: diaria, semanal, quincenal, mensual
  const [paymentDays, setPaymentDays] = useState<number[]>([1, 2, 3, 4, 5, 6]); // 0=Dom, 1=Lun, 2=Mar, 3=Mié, 4=Jue, 5=Vie, 6=Sáb

  // Estados de envío y errores de Supabase / RLS
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [errorDetails, setErrorDetails] = useState<{ code?: string; hint?: string } | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

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
  const isOverSuggestedLimit = Boolean(
    suggestedAmount && suggestedAmount > 0 && numericPrincipal > suggestedAmount
  );
  const numericInterestRate = schedule.interestRate;
  const numericTermInstallments = schedule.numberOfInstallments;
  const calculatedInterestCOP = schedule.totalInterest;
  const calculatedTotalToPay = schedule.totalToPay;
  const calculatedInstallmentValue = schedule.installmentValue;
  const currentModalityMeta = MODALITY_METADATA[modality];

  // Al cambiar la frecuencia de pago, ajusta automáticamente el número de cuotas equivalente
  // (ej: 24 días -> 4 semanas -> 2 quincenas -> 1 mes) y recalcula el Valor de la Cuota al instante
  const handleModalityChange = (nextModality: LoanModality) => {
    const convertedInstallments = convertInstallmentsOnModalityChange(
      modality,
      nextModality,
      Number(termInstallmentsInput) || MODALITY_METADATA[modality].defaultInstallments
    );
    setModality(nextModality);
    setTermInstallmentsInput(String(convertedInstallments));
    setPaymentDays(computeDefaultPaymentDays(nextModality));
  };

  const togglePaymentDay = (dayId: number) => {
    if (paymentDays.includes(dayId)) {
      if (paymentDays.length === 1) return; // Mantener al menos un día seleccionado
      setPaymentDays(paymentDays.filter((d) => d !== dayId).sort((a, b) => a - b));
    } else {
      setPaymentDays([...paymentDays, dayId].sort((a, b) => a - b));
    }
  };

  const quickTermSuggestions: Record<LoanModality, number[]> = {
    diaria: [24, 30, 45],
    semanal: [4, 8, 12],
    quincenal: [2, 4, 6],
    mensual: [1, 3, 6],
  };

  const selectedExistingClient = clients.find((c) => c.id === selectedClientId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setErrorDetails(null);

    if (numericPrincipal <= 0) {
      setErrorMsg('Por favor ingresa un Monto del Préstamo válido mayor a $0 COP.');
      return;
    }

    // Regla 2: Validación de Seguridad contra el tope máximo aprobado (suggestedAmount)
    if (suggestedAmount && suggestedAmount > 0 && numericPrincipal > suggestedAmount) {
      setErrorMsg(
        `El monto ingresado (${formatCOP(numericPrincipal)}) supera el monto máximo aprobado de ${formatCOP(suggestedAmount)}. Ajuste el valor a un monto igual o menor al tope permitido.`
      );
      return;
    }

    if (numericTermInstallments <= 0) {
      setErrorMsg('El Plazo / Número de Cuotas debe ser al menos 1.');
      return;
    }

    setIsSubmitting(true);

    // CASO A: Crear Préstamo para un Cliente Existente en `loans` (vinculando `client_id`)
    if (mode === 'existing_client') {
      if (!selectedExistingClient) {
        setIsSubmitting(false);
        setErrorMsg('Selecciona un cliente válido o cambia a la pestaña "Nuevo Cliente".');
        return;
      }

      const userOrgId = profile?.organizationId || 'org-medellin-01';
      const userCreatorId = profile?.id || 'usr-admin-001';

      const { data: createdLoan, error } = await createCustomLoanInDB({
        clientId: selectedExistingClient.id,
        clientName: selectedExistingClient.name,
        tradeName: selectedExistingClient.tradeName,
        routeId: selectedExistingClient.routeId || routeId,
        organizationId: userOrgId,
        tenantId: userOrgId,
        createdBy: userCreatorId,
        principal: numericPrincipal,
        interestRate: numericInterestRate,
        termInstallments: numericTermInstallments,
        modality,
        paymentDays,
      });

      setIsSubmitting(false);

      if (error || !createdLoan) {
        console.error('❌ [Error al insertar préstamo en tabla loans]:', error);
        const isDuplicate =
          error?.code === '23505' ||
          error?.message?.includes('23505') ||
          error?.message?.toLowerCase().includes('ya existe');

        setErrorMsg(
          isDuplicate
            ? 'Error: Ya existe un usuario o cliente registrado con este documento o correo.'
            : error?.message ||
              'La base de datos rechazó el préstamo. Verifica las políticas RLS en la tabla loans.'
        );
        setErrorDetails({ code: error?.code, hint: error?.hint });
        return;
      }

      if (onLoanCreatedForExistingClient) {
        onLoanCreatedForExistingClient(createdLoan);
      }

      setSuccessMsg(
        `¡Préstamo ${createdLoan.code} creado para ${selectedExistingClient.name}! Total: ${formatCOP(
          createdLoan.totalDebt
        )} (${numericTermInstallments} cuotas de ${formatCOP(createdLoan.installmentAmount)}).`
      );
      setTimeout(() => {
        onClose();
      }, 750);
      return;
    }

    // CASO B: Registrar Nuevo Cliente + Insertar su Préstamo en `loans`
    // El campo de Cédula NO es obligatorio para no bloquear la inserción de clientes en calle
    if (!name.trim() || !phone.trim() || !address.trim()) {
      setIsSubmitting(false);
      setErrorMsg(
        'Por favor completa los datos obligatorios del cliente (Nombre, Teléfono / WhatsApp y Dirección).'
      );
      return;
    }

    const targetRouteId = isCustomRoute && customRouteName.trim()
      ? `route-${customRouteName.toLowerCase().trim().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').slice(0, 20)}`
      : (routeId || 'route-1');

    const userOrgId = profile?.organizationId || 'org-medellin-01';
    const userCreatorId = profile?.id || 'usr-admin-001';

    const { data, error } = await insertClientAndLoanToDB({
      name: name.trim(),
      tradeName: tradeName.trim() || name.trim(),
      document: document.trim(),
      phone: phone.trim(),
      category,
      address: address.trim(),
      neighborhood: neighborhood.trim(),
      routeId: targetRouteId,
      organizationId: userOrgId,
      tenantId: userOrgId,
      createdBy: userCreatorId,
      guarantorName: guarantorName.trim(),
      guarantorPhone: guarantorPhone.trim(),
      principal: numericPrincipal,
      interestRate: numericInterestRate,
      termDays: numericTermInstallments,
      modality,
      paymentDays,
    });

    setIsSubmitting(false);

    if (error || !data) {
      console.error('❌ [Error al insertar cliente/préstamo]:', error);
      const isDuplicate =
        error?.code === '23505' ||
        error?.message?.includes('23505') ||
        error?.message?.toLowerCase().includes('ya existe');

      setErrorMsg(
        isDuplicate
          ? 'Error: Ya existe un usuario o cliente registrado con este documento o correo.'
          : error?.message ||
            'La base de datos rechazó el registro. Verifica las políticas RLS en clients y loans.'
      );
      setErrorDetails({
        code: error?.code,
        hint: error?.hint,
      });
      return;
    }

    onClientCreated(data.client, data.loan);
    setSuccessMsg(
      `¡Préstamo ${data.loan.code} y cliente ${data.client.name} guardados exitosamente en Supabase!`
    );
    setTimeout(() => {
      onClose();
    }, 750);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden my-auto">
        {/* ENCABEZADO */}
        <div className="bg-slate-950 p-5 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <Calculator className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white">
                Crear Préstamo con Monto y Condiciones Libres
              </h2>
              <p className="text-xs text-slate-400">
                Cálculo automático en tiempo real de Total a Pagar y Cuota con guardado en tabla{' '}
                <code className="text-emerald-400 font-mono">loans</code>
              </p>
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

        {/* ALERTAS DE ERROR O ÉXITO */}
        {errorMsg && (
          <div className="mx-5 mt-4 p-3.5 rounded-xl bg-rose-950/70 border border-rose-500/50 text-rose-200 text-xs space-y-1">
            <div className="flex items-start gap-2 font-bold text-rose-300">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
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

        {successMsg && (
          <div className="mx-5 mt-4 p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-5 text-xs">
          {/* SELECTOR DE VINCULACIÓN DE CLIENTE: CLIENTE EXISTENTE vs NUEVO CLIENTE */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-mono uppercase tracking-wider text-emerald-400 font-semibold flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5" />
                1. Titular del Préstamo (client_id)
              </span>
              {clients.length > 0 && (
                <div className="inline-flex rounded-lg bg-slate-950 p-1 border border-slate-800">
                  <button
                    type="button"
                    onClick={() => setMode('existing_client')}
                    className={`px-3 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                      mode === 'existing_client'
                        ? 'bg-emerald-500 text-slate-950'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Cliente Existente ({clients.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode('new_client')}
                    className={`px-3 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                      mode === 'new_client'
                        ? 'bg-emerald-500 text-slate-950'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    + Nuevo Cliente
                  </button>
                </div>
              )}
            </div>

            {mode === 'existing_client' && clients.length > 0 ? (
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">
                    Seleccionar Cliente Registrado (<code className="font-mono text-emerald-400">client_id</code>) *
                  </label>
                  <select
                    value={selectedClientId}
                    onChange={(e) => setSelectedClientId(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:border-emerald-500 font-medium"
                  >
                    {clients.map((cl) => (
                      <option key={cl.id} value={cl.id}>
                        {cl.name} — {cl.tradeName} (CC: {cl.document} · Ruta: {cl.routeId})
                      </option>
                    ))}
                  </select>
                </div>

                {selectedExistingClient && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-2 border-t border-slate-800/80 text-[11px] text-slate-400">
                    <div>
                      <span className="block text-slate-500">ID Cliente:</span>
                      <span className="font-mono text-slate-200">{selectedExistingClient.id}</span>
                    </div>
                    <div>
                      <span className="block text-slate-500">Teléfono / WhatsApp:</span>
                      <span className="font-mono text-slate-200">{selectedExistingClient.phone}</span>
                    </div>
                    <div>
                      <span className="block text-slate-500">Dirección:</span>
                      <span className="text-slate-200 truncate block">{selectedExistingClient.address}</span>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 space-y-3.5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="text-slate-300 font-medium block mb-1">Nombre Completo *</label>
                    <input
                      type="text"
                      required
                      placeholder="Ej. Rosa Inés Cardona"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="text-slate-300 font-medium block mb-1">
                      Cédula de Ciudadanía <span className="text-xs text-slate-400 font-normal">(Opcional en calle)</span>
                    </label>
                    <input
                      type="text"
                      placeholder="Ej. 1017384920 (o en blanco)"
                      value={document}
                      onChange={(e) => setDocument(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="text-slate-300 font-medium block mb-1">WhatsApp / Celular *</label>
                    <input
                      type="tel"
                      required
                      placeholder="Ej. 312 458 9021"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-slate-300 font-medium block">
                        Ruta de Cobro Asignada *
                      </label>
                      <button
                        type="button"
                        onClick={() => setIsCustomRoute(!isCustomRoute)}
                        className="text-[11px] text-emerald-400 hover:text-emerald-300 underline cursor-pointer"
                      >
                        {isCustomRoute ? '← Seleccionar ruta existente' : '+ Nueva Ruta'}
                      </button>
                    </div>

                    {isCustomRoute ? (
                      <input
                        type="text"
                        required
                        placeholder="Nombre de la nueva ruta (ej: Ruta Poblado Sur)"
                        value={customRouteName}
                        onChange={(e) => setCustomRouteName(e.target.value)}
                        className="w-full bg-slate-900 border border-emerald-500/80 rounded-lg px-3 py-2 text-white focus:outline-none"
                      />
                    ) : (
                      <select
                        value={routeId}
                        onChange={(e) => setRouteId(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                      >
                        {routes.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name} ({r.collectorName || 'Cobrador'})
                          </option>
                        ))}
                      </select>
                    )}
                  </div>

                  <div>
                    <label className="text-slate-300 font-medium block mb-1">
                      Dirección del Negocio o Casa *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Ej. Calle 44 # 108-25"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="text-slate-300 font-medium block mb-1">
                      Nombre del Negocio / Local
                    </label>
                    <input
                      type="text"
                      placeholder="Ej. Tienda La Floresta"
                      value={tradeName}
                      onChange={(e) => setTradeName(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* =====================================================================
              SECCIÓN 2: CONDICIONES DEL PRÉSTAMO CON MONTO Y PARÁMETROS 100% LIBRES
             ===================================================================== */}
          <div className="pt-2 border-t border-slate-800">
            <h3 className="text-emerald-400 font-mono uppercase tracking-wider text-[11px] font-semibold mb-3 flex items-center gap-1.5">
              <DollarSign className="w-3.5 h-3.5" />
              2. Condiciones Personalizadas del Préstamo (Monto, Tasa, Plazo y Modalidad Libres)
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
              {/* CAMPO 1: MONTO DEL PRÉSTAMO LIBRE CON TOPE MÁXIMO DINÁMICO */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-slate-300 font-medium block">
                    Monto a prestar (COP) *
                  </label>
                  {suggestedAmount && suggestedAmount > 0 && (
                    <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/70 border border-emerald-500/30 px-1.5 py-0.5 rounded">
                      Tope +20%
                    </span>
                  )}
                </div>
                <div className="relative">
                  <DollarSign
                    className={`w-3.5 h-3.5 absolute left-3 top-2.5 transition-colors ${
                      isOverSuggestedLimit ? 'text-red-400' : 'text-emerald-400'
                    }`}
                  />
                  <input
                    type="number"
                    required
                    min={1000}
                    max={suggestedAmount && suggestedAmount > 0 ? suggestedAmount : undefined}
                    step="any"
                    placeholder="Ej. 500000"
                    value={principalInput}
                    onChange={(e) => setPrincipalInput(e.target.value)}
                    className={`w-full bg-slate-950 border ${
                      isOverSuggestedLimit
                        ? 'border-red-500 focus:border-red-500 text-red-100 ring-1 ring-red-500'
                        : 'border-slate-700 focus:border-emerald-500 text-white'
                    } rounded-lg pl-8 pr-3 py-2 font-mono tabular-nums font-bold text-sm focus:outline-none transition-colors`}
                  />
                </div>

                {/* Helper text de monto máximo aprobado y alerta visual si excede el tope */}
                <div className="mt-1.5 space-y-1">
                  {suggestedAmount && suggestedAmount > 0 && (
                    <p className="text-[11px] text-emerald-400 font-medium">
                      Monto máximo aprobado: {formatCOP(suggestedAmount)}
                    </p>
                  )}
                  {isOverSuggestedLimit ? (
                    <p className="text-[11px] text-red-400 font-semibold flex items-center gap-1.5 bg-red-950/50 border border-red-500/40 p-1.5 rounded-md animate-pulse">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0 text-red-400" />
                      <span>El monto supera el tope máximo aprobado ({formatCOP(suggestedAmount!)}). Debe reducir el valor.</span>
                    </p>
                  ) : (
                    <span className="text-[10px] text-slate-400 font-mono block">
                      Desembolso: {formatCOP(numericPrincipal)}
                    </span>
                  )}
                </div>
              </div>

              {/* CAMPO 2: PORCENTAJE DE INTERÉS O TASA LIBRE */}
              <div>
                <label className="text-slate-300 font-medium block mb-1">
                  Tasa de Interés (%) *
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
                <span className="text-[10px] text-amber-400/90 font-mono mt-1 block">
                  Interés: +{formatCOP(calculatedInterestCOP)}
                </span>
              </div>

              {/* CAMPO 3: FRECUENCIA DE PAGO (DIARIA, SEMANAL, QUINCENAL, MENSUAL) */}
              <div>
                <label className="text-slate-300 font-medium block mb-1">
                  Frecuencia de Pago *
                </label>
                <div className="relative">
                  <Clock className="w-3.5 h-3.5 text-indigo-400 absolute left-3 top-2.5" />
                  <select
                    value={modality}
                    onChange={(e) => handleModalityChange(e.target.value as LoanModality)}
                    className="w-full bg-slate-950 border border-slate-700 focus:border-emerald-500 rounded-lg pl-8 pr-3 py-2 text-white font-semibold text-xs focus:outline-none"
                  >
                    <option value="diaria">Diaria (por días)</option>
                    <option value="semanal">Semanal (por semanas)</option>
                    <option value="quincenal">Quincenal (por quincenas)</option>
                    <option value="mensual">Mensual (por meses)</option>
                  </select>
                </div>
                <span className="text-[10px] text-indigo-300 font-mono mt-1 block">
                  {currentModalityMeta.examples}
                </span>
              </div>

              {/* CAMPO 4: PLAZO / NÚMERO DE CUOTAS SEGÚN FRECUENCIA */}
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
                <div className="flex items-center justify-between gap-1 mt-1">
                  <span className="text-[10px] text-slate-400 font-mono">
                    {numericTermInstallments}{' '}
                    {numericTermInstallments === 1
                      ? currentModalityMeta.unitSingular
                      : currentModalityMeta.unitPlural}
                  </span>
                  <div className="flex items-center gap-1">
                    {quickTermSuggestions[modality].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setTermInstallmentsInput(String(preset))}
                        className={`px-1.5 py-0.5 rounded text-[10px] font-mono transition-colors cursor-pointer ${
                          numericTermInstallments === preset
                            ? 'bg-sky-500/25 text-sky-300 border border-sky-500/40 font-bold'
                            : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
                        }`}
                      >
                        {preset}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* SELECTOR VISUAL DE DÍAS DE COBRO (payment_days) */}
            <div className="mt-3.5 p-3.5 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="text-slate-200 font-semibold text-xs flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-emerald-400" />
                  Días de Cobro Programados (<code className="font-mono text-emerald-400">payment_days</code>)
                </label>
                <span className="text-[11px] font-mono text-slate-400">
                  {modality === 'diaria'
                    ? 'Asignación automática: Laborables (L-S)'
                    : `${paymentDays.length} día(s) seleccionado(s)`}
                </span>
              </div>

              <div className="flex items-center gap-1.5 pt-1">
                {[
                  { id: 1, label: 'L', name: 'Lunes' },
                  { id: 2, label: 'M', name: 'Martes' },
                  { id: 3, label: 'M', name: 'Miércoles' },
                  { id: 4, label: 'J', name: 'Jueves' },
                  { id: 5, label: 'V', name: 'Viernes' },
                  { id: 6, label: 'S', name: 'Sábado' },
                  { id: 0, label: 'D', name: 'Domingo' },
                ].map((d) => {
                  const isSelected = paymentDays.includes(d.id);
                  return (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => togglePaymentDay(d.id)}
                      title={`${d.name} (${isSelected ? 'Seleccionado' : 'No seleccionado'})`}
                      className={`flex-1 min-h-[38px] rounded-lg border font-mono font-bold text-xs sm:text-sm flex flex-col items-center justify-center transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-emerald-500 text-slate-950 border-emerald-400 shadow-md scale-105'
                          : 'bg-slate-900 text-slate-500 border-slate-800 hover:text-slate-200 hover:border-slate-700'
                      }`}
                    >
                      <span>{d.label}</span>
                      <span className="text-[9px] uppercase tracking-tighter opacity-80">{d.name.slice(0, 3)}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* ===================================================================
                3. VISTA PREVIA DE CÁLCULO AUTOMÁTICO EN TIEMPO REAL ANTES DE GUARDAR
               =================================================================== */}
            <div className="mt-4 bg-slate-950 border border-emerald-500/30 rounded-xl p-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2.5 mb-3">
                <span className="text-[11px] font-mono uppercase tracking-wider text-emerald-400 font-semibold">
                  Cálculo Automático en Tiempo Real ({currentModalityMeta.label})
                </span>
                <span className="text-[11px] font-mono text-slate-400">
                  Fórmula:{' '}
                  <strong className="text-slate-200">
                    {formatCOP(calculatedTotalToPay)} ÷ {numericTermInstallments}{' '}
                    {numericTermInstallments === 1
                      ? currentModalityMeta.unitSingular
                      : currentModalityMeta.unitPlural}
                  </strong>
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-800">
                  <span className="text-[10px] text-slate-400 block">Capital Prestado</span>
                  <span className="text-sm sm:text-base font-bold text-white font-mono tabular-nums">
                    {formatCOP(numericPrincipal)}
                  </span>
                </div>

                <div className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-800">
                  <span className="text-[10px] text-slate-400 block">
                    Interés ({numericInterestRate}%)
                  </span>
                  <span className="text-sm sm:text-base font-bold text-amber-400 font-mono tabular-nums">
                    +{formatCOP(calculatedInterestCOP)}
                  </span>
                </div>

                <div className="p-2.5 rounded-lg bg-emerald-950/30 border border-emerald-500/30">
                  <span className="text-[10px] text-emerald-300 block font-semibold">
                    Total a Pagar (Monto + Interés)
                  </span>
                  <span className="text-sm sm:text-base font-bold text-emerald-400 font-mono tabular-nums">
                    {formatCOP(calculatedTotalToPay)}
                  </span>
                </div>

                <div className="p-2.5 rounded-lg bg-sky-950/30 border border-sky-500/30">
                  <span className="text-[10px] text-sky-300 block font-semibold">
                    Valor Cuota {currentModalityMeta.label} (x{numericTermInstallments})
                  </span>
                  <span className="text-sm sm:text-base font-bold text-white font-mono tabular-nums">
                    {formatCOP(calculatedInstallmentValue)}
                  </span>
                  <span className="text-[10px] text-sky-300/80 font-mono block">
                    cada {currentModalityMeta.unitSingular}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* BOTONES DE ACCIÓN */}
          <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2.5 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 font-semibold transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold shadow-lg transition-all disabled:opacity-50 cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
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
