import React, { useState } from 'react';
import { 
  X, 
  UserPlus, 
  DollarSign, 
  Calendar, 
  MapPin, 
  Phone, 
  Store, 
  ShieldCheck, 
  FileText,
  AlertCircle,
  CheckCircle2
} from 'lucide-react';
import { RouteData, ClientProfile, LoanDetail } from '../data/mockData';
import { formatCOP } from '../utils/financialCalculations';

interface NewClientLoanModalProps {
  routes: RouteData[];
  onClose: () => void;
  onClientCreated: (newClient: ClientProfile, newLoan: LoanDetail) => void;
}

export const NewClientLoanModal: React.FC<NewClientLoanModalProps> = ({
  routes,
  onClose,
  onClientCreated
}) => {
  // Datos del Cliente
  const [name, setName] = useState('');
  const [tradeName, setTradeName] = useState('');
  const [document, setDocument] = useState('');
  const [phone, setPhone] = useState('');
  const [category, setCategory] = useState('Comercio / Abarrotes');
  const [address, setAddress] = useState('');
  const [neighborhood, setNeighborhood] = useState('Comuna 13 - San Javier');
  const [routeId, setRouteId] = useState(routes[0]?.id || 'route-1');
  const [guarantorName, setGuarantorName] = useState('');
  const [guarantorPhone, setGuarantorPhone] = useState('');

  // Parámetros Financieros del Crédito
  const [principal, setPrincipal] = useState<number>(1000000);
  const [interestRate, setInterestRate] = useState<number>(20);
  const [termDays, setTermDays] = useState<number>(24);

  // Estados de interfaz
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Cálculos automáticos del crédito
  const totalInterest = Math.round(principal * (interestRate / 100));
  const totalDebt = principal + totalInterest;
  const dailyInstallment = Math.round(totalDebt / termDays);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!name.trim() || !document.trim() || !phone.trim() || !address.trim()) {
      setErrorMsg('Por favor completa todos los campos obligatorios del cliente (Nombre, Cédula, Teléfono y Dirección).');
      return;
    }

    if (principal < 100000) {
      setErrorMsg('El monto principal mínimo para otorgar es de $100.000 COP.');
      return;
    }

    setIsSubmitting(true);

    const clientId = `cli-${Date.now().toString().slice(-6)}`;
    const loanId = `loan-${Date.now().toString().slice(-6)}`;
    const loanCode = `PREST-MED-${Date.now().toString().slice(-4)}`;
    const todayStr = new Date().toISOString().split('T')[0];

    // Fecha esperada de fin sumando días
    const dueDateObj = new Date();
    dueDateObj.setDate(dueDateObj.getDate() + termDays);
    const dueDateStr = dueDateObj.toISOString().split('T')[0];

    const clientPayload: ClientProfile = {
      id: clientId,
      name: name.trim(),
      tradeName: tradeName.trim() || name.trim(),
      category,
      document: document.trim(),
      phone: phone.trim(),
      address: address.trim(),
      neighborhood: neighborhood.trim(),
      routeId,
      riskTier: 'A_excelente',
      daysOverdue: 0,
      hasPreventiveBlock: false,
      guarantorName: guarantorName.trim() || 'Sin fiador registrado',
      guarantorPhone: guarantorPhone.trim() || phone.trim(),
      lat: 6.2518,
      lng: -75.6142
    };

    const loanPayload: LoanDetail = {
      id: loanId,
      code: loanCode,
      clientId,
      clientName: name.trim(),
      tradeName: tradeName.trim() || name.trim(),
      routeId,
      principal,
      interestRate,
      totalDebt,
      installmentAmount: dailyInstallment,
      termDays,
      installmentsPaid: 0,
      totalCollected: 0,
      remainingBalance: totalDebt,
      disbursedDate: todayStr,
      dueDate: dueDateStr,
      daysOverdue: 0,
      status: 'activo',
      todayPaid: false
    };

    try {
      // 1. Guardar cliente en Cloud SQL
      const clientRes = await fetch('/api/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: clientId,
          documentId: document.trim(),
          name: name.trim(),
          alias: tradeName.trim() || null,
          phone: phone.trim(),
          businessType: category,
          address: address.trim(),
          zone: neighborhood.trim(),
          routeId,
          riskScore: 80,
          riskLevel: 'verde',
          creditLimit: principal * 2
        })
      });

      if (!clientRes.ok) {
        const errorData = await clientRes.json().catch(() => ({}));
        throw new Error(errorData.error || 'Error al persistir cliente en Cloud SQL');
      }

      // 2. Guardar crédito en Cloud SQL
      const loanRes = await fetch('/api/loans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: loanId,
          clientId,
          routeId,
          principalAmount: principal,
          interestRate,
          totalAmount: totalDebt,
          dailyQuota: dailyInstallment,
          remainingBalance: totalDebt,
          totalDays: termDays,
          paidDays: 0,
          status: 'active',
          startDate: todayStr,
          expectedEndDate: dueDateStr
        })
      });

      if (!loanRes.ok) {
        const errorData = await loanRes.json().catch(() => ({}));
        throw new Error(errorData.error || 'Error al persistir préstamo en Cloud SQL');
      }

      setSuccessMsg(`¡Cliente ${name} y Crédito ${loanCode} creados exitosamente en Cloud SQL!`);
      setTimeout(() => {
        onClientCreated(clientPayload, loanPayload);
        onClose();
      }, 900);

    } catch (err: any) {
      console.error('Error creando cliente/crédito:', err);
      // Fallback local optimista
      onClientCreated(clientPayload, loanPayload);
      setSuccessMsg(`Cliente creado localmente (${err.message})`);
      setTimeout(() => {
        onClose();
      }, 1000);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden my-auto animate-in zoom-in-95 duration-200">
        
        {/* ENCABEZADO */}
        <div className="bg-gradient-to-r from-emerald-950/70 to-slate-900 p-5 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
              <UserPlus className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-white">
                Vincular Nuevo Cliente & Microcrédito
              </h2>
              <p className="text-xs text-slate-400">
                Apertura formal de crédito con persistencia directa en Cloud SQL
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* MENSAJES DE ESTADO */}
        {errorMsg && (
          <div className="mx-5 mt-4 p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div className="mx-5 mt-4 p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* FORMULARIO */}
        <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-5 text-xs">
          {/* SECCIÓN 1: DATOS DEL DEUDOR */}
          <div>
            <h3 className="text-emerald-400 font-bold uppercase tracking-wider text-[11px] mb-3 flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5" />
              1. Ficha del Cliente / Deudor
            </h3>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="text-slate-300 font-medium block mb-1">
                  Nombre Completo *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej. Rosa Inés Cardona"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-emerald-500 transition-colors"
                />
              </div>

              <div>
                <label className="text-slate-300 font-medium block mb-1">
                  Cédula de Ciudadanía (C.C.) *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej. 1017384920"
                  value={document}
                  onChange={(e) => setDocument(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-emerald-500 transition-colors"
                />
              </div>

              <div>
                <label className="text-slate-300 font-medium block mb-1">
                  Nombre del Negocio / Establecimiento
                </label>
                <input
                  type="text"
                  placeholder="Ej. Tienda La Floresta / Barbería Don Alex"
                  value={tradeName}
                  onChange={(e) => setTradeName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-emerald-500 transition-colors"
                />
              </div>

              <div>
                <label className="text-slate-300 font-medium block mb-1">
                  Actividad Económica
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-emerald-500 transition-colors"
                >
                  <option value="Comercio / Abarrotes">Comercio / Abarrotes</option>
                  <option value="Puesto de Comidas / Frutas">Puesto de Comidas / Frutas</option>
                  <option value="Estética / Barbería">Estética / Peluquería / Barbería</option>
                  <option value="Taller Mecánico / Motos">Taller Mecánico / Motos</option>
                  <option value="Confección / Textiles">Confección / Textiles</option>
                  <option value="Servicios Varios">Servicios Varios</option>
                </select>
              </div>

              <div>
                <label className="text-slate-300 font-medium block mb-1">
                  WhatsApp / Celular *
                </label>
                <input
                  type="tel"
                  required
                  placeholder="Ej. 312 458 9021"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-emerald-500 transition-colors"
                />
              </div>

              <div>
                <label className="text-slate-300 font-medium block mb-1">
                  Ruta de Cobro Asignada *
                </label>
                <select
                  value={routeId}
                  onChange={(e) => setRouteId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-emerald-500 transition-colors font-medium"
                >
                  {routes.map(r => (
                    <option key={r.id} value={r.id}>
                      {r.name} ({r.collectorName})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-slate-300 font-medium block mb-1">
                  Dirección del Local / Domicilio *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej. Calle 44 # 108-25"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-emerald-500 transition-colors"
                />
              </div>

              <div>
                <label className="text-slate-300 font-medium block mb-1">
                  Barrio / Comuna (Medellín)
                </label>
                <input
                  type="text"
                  placeholder="Ej. Comuna 13 - San Javier"
                  value={neighborhood}
                  onChange={(e) => setNeighborhood(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-emerald-500 transition-colors"
                />
              </div>
            </div>

            {/* FIADOR */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 mt-3 pt-3 border-t border-slate-800/80">
              <div>
                <label className="text-slate-400 text-[11px] block mb-1">
                  Nombre del Fiador / Codeudor
                </label>
                <input
                  type="text"
                  placeholder="Ej. Juan Carlos Cardona (Hermano)"
                  value={guarantorName}
                  onChange={(e) => setGuarantorName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-emerald-500 transition-colors"
                />
              </div>

              <div>
                <label className="text-slate-400 text-[11px] block mb-1">
                  Teléfono del Fiador
                </label>
                <input
                  type="tel"
                  placeholder="Ej. 310 982 1478"
                  value={guarantorPhone}
                  onChange={(e) => setGuarantorPhone(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-emerald-500 transition-colors"
                />
              </div>
            </div>
          </div>

          {/* SECCIÓN 2: CONDICIONES FINANCIERAS DEL MICROCRÉDITO */}
          <div className="pt-2 border-t border-slate-800">
            <h3 className="text-emerald-400 font-bold uppercase tracking-wider text-[11px] mb-3 flex items-center gap-1.5">
              <DollarSign className="w-3.5 h-3.5" />
              2. Parámetros del Microcrédito Desembolsado
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
              <div>
                <label className="text-slate-300 font-medium block mb-1">
                  Monto Principal (COP)
                </label>
                <select
                  value={principal}
                  onChange={(e) => setPrincipal(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-emerald-500 font-mono font-bold"
                >
                  <option value={300000}>$300.000 COP</option>
                  <option value={500000}>$500.000 COP</option>
                  <option value={800000}>$800.000 COP</option>
                  <option value={1000000}>$1.000.000 COP</option>
                  <option value={1500000}>$1.500.000 COP</option>
                  <option value={2000000}>$2.000.000 COP</option>
                  <option value={3000000}>$3.000.000 COP</option>
                </select>
              </div>

              <div>
                <label className="text-slate-300 font-medium block mb-1">
                  Tasa de Interés Flat
                </label>
                <select
                  value={interestRate}
                  onChange={(e) => setInterestRate(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-emerald-500 font-mono font-bold"
                >
                  <option value={15}>15% Flat</option>
                  <option value={20}>20% Flat (Estándar)</option>
                  <option value={25}>25% Flat</option>
                </select>
              </div>

              <div>
                <label className="text-slate-300 font-medium block mb-1">
                  Plazo en Días de Cobro
                </label>
                <select
                  value={termDays}
                  onChange={(e) => setTermDays(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-emerald-500 font-mono font-bold"
                >
                  <option value={20}>20 Días hábiles</option>
                  <option value={24}>24 Días hábiles (Estándar)</option>
                  <option value={30}>30 Días corridos</option>
                </select>
              </div>
            </div>

            {/* RESUMEN FINANCIERO EN TIEMPO REAL */}
            <div className="mt-3.5 bg-slate-950/80 border border-emerald-500/30 rounded-2xl p-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
              <div>
                <span className="text-[10px] text-slate-400 block">Total a Recaudar</span>
                <span className="text-sm font-black text-emerald-400 font-mono">
                  {formatCOP(totalDebt)}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block">Cuota Diaria Fija</span>
                <span className="text-sm font-black text-white font-mono">
                  {formatCOP(dailyInstallment)}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block">Interés Ganado</span>
                <span className="text-sm font-black text-amber-400 font-mono">
                  {formatCOP(totalInterest)}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block">Número de Cuotas</span>
                <span className="text-sm font-black text-slate-200 font-mono">
                  {termDays} días
                </span>
              </div>
            </div>
          </div>

          {/* BOTONES ACCIÓN */}
          <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2.5 rounded-xl border border-slate-700 text-slate-300 hover:bg-slate-800 font-semibold transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold shadow-lg shadow-emerald-900/40 transition-all disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Guardando en Cloud SQL...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Vincular Cliente & Activar Préstamo</span>
                </>
              )}
            </button>
          </div>
        </form>

      </div>
    </div>
  );
};
