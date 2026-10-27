import React, { useState, useEffect, useMemo } from 'react';
import {
  MessageSquare,
  Send,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ShieldAlert,
  Copy,
  ExternalLink,
  Phone,
  RefreshCw,
  Search,
  Filter,
  Check,
  Building2,
  Users,
  Lock,
  Calendar,
  DollarSign,
  FileText,
  Sparkles,
  ArrowRight,
  Flame,
  X,
  Smartphone,
  Eye,
  History
} from 'lucide-react';
import { formatCOP } from '../utils/financialCalculations';
import {
  AdminSubscriptionAlertData,
  WhatsAppTemplateTone,
  buildOverdueBlockedMessage,
  buildExpiringSoonMessage,
  createWhatsAppWebUrl,
  normalizeColombiaWhatsAppPhone,
} from '../utils/adminWhatsAppAlerts';

interface DispatchLog {
  tenantId: string;
  adminName: string;
  phone: string;
  type: 'overdue_blocked' | 'expiring_soon';
  timestamp: string;
  note?: string;
}

export const SuperAdminWhatsAppCollectionCenter: React.FC<{ onNavigateToSubscriptions?: () => void }> = ({
  onNavigateToSubscriptions,
}) => {
  const [adminsList, setAdminsList] = useState<AdminSubscriptionAlertData[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'overdue' | 'expiring'>('all');

  // Modal / Drawer de personalización y vista previa de WhatsApp
  const [selectedAdminForPreview, setSelectedAdminForPreview] = useState<AdminSubscriptionAlertData | null>(null);
  const [previewTone, setPreviewTone] = useState<WhatsAppTemplateTone>('blocked_mora_strict');
  const [customNote, setCustomNote] = useState<string>('');
  const [customPhone, setCustomPhone] = useState<string>('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [previewCopied, setPreviewCopied] = useState<boolean>(false);

  // Registro de despachos realizados (Persistente en localStorage)
  const [dispatchLogs, setDispatchLogs] = useState<Record<string, string>>({});

  // Cargar registro de envíos previos
  useEffect(() => {
    try {
      const savedLogs = localStorage.getItem('enruta_wa_dispatches');
      if (savedLogs) {
        setDispatchLogs(JSON.parse(savedLogs));
      }
    } catch {
      // Ignorar si no existe
    }
  }, []);

  const saveDispatchRecord = (tenantId: string) => {
    const nowIso = new Date().toISOString();
    const updated = { ...dispatchLogs, [tenantId]: nowIso };
    setDispatchLogs(updated);
    try {
      localStorage.setItem('enruta_wa_dispatches', JSON.stringify(updated));
    } catch {
      // Ignorar
    }
  };

  // Cargar administradores y sincronizar su estado con las suscripciones
  const loadAdminsAndSubscriptions = async () => {
    setIsLoading(true);
    try {
      let rawAdmins: any[] = [];
      try {
        const res = await fetch('/api/admins');
        if (res.ok) {
          rawAdmins = await res.json();
        }
      } catch {
        // Fallback a administradores locales
      }

      if (!Array.isArray(rawAdmins) || rawAdmins.length === 0) {
        rawAdmins = [
          {
            uid: 'usr-admin-001',
            name: 'Carlos Andrés Vélez',
            email: 'admin@rutacapital.co',
            phone: '312 456 7890',
            organizationId: 'org-medellin-01',
            organizationName: 'Fondo RutaCapital Medellín Central',
          },
          {
            uid: 'usr-admin-002',
            name: 'Jorge Iván Montoya',
            email: 'admin2@rutacapital.co',
            phone: '300 123 4567',
            organizationId: 'org-norte-02',
            organizationName: 'Fondo Microcrédito Bello & Norte',
          },
          {
            uid: 'usr-admin-003',
            name: 'Felipe Álvarez',
            email: 'felipe.alvarez@rutacauca.co',
            phone: '314 987 6543',
            organizationId: 'org-occidente-03',
            organizationName: 'Inversiones & Rutas del Cauca',
          },
          {
            uid: 'usr-admin-004',
            name: 'Carlos Mario Ramírez',
            email: 'lolita1312@hotmail.com',
            phone: '310 555 1234',
            organizationId: 'org-armando-prestamo-2979',
            organizationName: 'Armando Préstamos Itagüí',
          },
        ];
      }

      const now = new Date();

      const mapped: AdminSubscriptionAlertData[] = rawAdmins.map((adm, idx) => {
        const tenantId = adm.organizationId || adm.organization_id || `org-${adm.id || idx}`;
        const orgName = adm.organizationName || adm.organization_name || `Fondo ${adm.name}`;

        const cachedSub = localStorage.getItem(`enruta_sub_${tenantId}`);
        let periodEnd = new Date(now.getTime() + (14 - idx * 7) * 86400000).toISOString();

        if (cachedSub) {
          try {
            const parsed = JSON.parse(cachedSub);
            periodEnd = parsed.currentPeriodEnd || periodEnd;
          } catch {
            // No action
          }
        } else {
          // Si no hay guardado, emular casos reales de cobranza
          if (idx === 1) {
            // Fondo 2: Próximo a vencer en 3 días
            periodEnd = new Date(now.getTime() + 3 * 86400000).toISOString();
          } else if (idx === 2) {
            // Fondo 3: En mora 6 días
            periodEnd = new Date(now.getTime() - 6 * 86400000).toISOString();
          } else if (idx === 3) {
            // Fondo 4: En mora crítica 12 días
            periodEnd = new Date(now.getTime() - 12 * 86400000).toISOString();
          }
        }

        const endDateObj = new Date(periodEnd);
        const diffMs = endDateObj.getTime() - now.getTime();
        const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

        return {
          tenantId,
          organizationName: orgName,
          adminName: adm.name || adm.fullName || 'Administrador',
          adminPhone: adm.phone || '310 000 0000',
          adminEmail: adm.email || 'admin@enruta.co',
          activeRoutes: 1 + (idx % 2),
          monthlyFeeCop: 180000 * (1 + (idx % 2)),
          currentPeriodEnd: periodEnd,
          daysOverdue: diffDays < 0 ? Math.abs(diffDays) : 0,
          daysRemaining: diffDays > 0 ? diffDays : 0,
        };
      });

      setAdminsList(mapped);
    } catch (err) {
      console.error('Error cargando lista de administradores para cobranza:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadAdminsAndSubscriptions();
  }, []);

  // Grupos filtrados
  const overdueAdmins = useMemo(() => {
    return adminsList.filter((a) => a.daysOverdue > 0);
  }, [adminsList]);

  const expiringAdmins = useMemo(() => {
    return adminsList.filter((a) => a.daysOverdue === 0 && a.daysRemaining <= 5);
  }, [adminsList]);

  // Lista visible según búsqueda y pestaña
  const displayedAdmins = useMemo(() => {
    return adminsList.filter((admin) => {
      // 1. Filtro de búsqueda
      const matchesSearch =
        admin.organizationName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        admin.adminName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        admin.adminPhone.includes(searchTerm) ||
        admin.tenantId.toLowerCase().includes(searchTerm.toLowerCase());

      if (!matchesSearch) return false;

      // 2. Filtro de categoría
      if (activeFilter === 'overdue') return admin.daysOverdue > 0;
      if (activeFilter === 'expiring') return admin.daysOverdue === 0 && admin.daysRemaining <= 5;

      // 'all' solo muestra los que requieren acción (mora o por vencer) o todos si coinciden
      return admin.daysOverdue > 0 || admin.daysRemaining <= 5;
    });
  }, [adminsList, searchTerm, activeFilter]);

  // Abrir modal de vista previa
  const handleOpenPreview = (admin: AdminSubscriptionAlertData) => {
    setSelectedAdminForPreview(admin);
    setCustomPhone(admin.adminPhone);
    setCustomNote('');
    setPreviewCopied(false);
    if (admin.daysOverdue > 0) {
      setPreviewTone('blocked_mora_strict');
    } else {
      setPreviewTone('expiring_preventive');
    }
  };

  // Generar texto en tiempo real para el modal
  const computedPreviewMessage = useMemo(() => {
    if (!selectedAdminForPreview) return '';
    if (selectedAdminForPreview.daysOverdue > 0) {
      return buildOverdueBlockedMessage(
        selectedAdminForPreview,
        previewTone as 'blocked_mora_strict' | 'blocked_mora_urgent',
        customNote
      );
    }
    return buildExpiringSoonMessage(
      selectedAdminForPreview,
      previewTone as 'expiring_preventive' | 'expiring_friendly',
      customNote
    );
  }, [selectedAdminForPreview, previewTone, customNote]);

  // Enviar WhatsApp individual rápido
  const handleQuickSend = (admin: AdminSubscriptionAlertData) => {
    const message =
      admin.daysOverdue > 0
        ? buildOverdueBlockedMessage(admin, 'blocked_mora_strict')
        : buildExpiringSoonMessage(admin, 'expiring_preventive');

    const url = createWhatsAppWebUrl(admin.adminPhone, message);
    saveDispatchRecord(admin.tenantId);
    window.open(url, '_blank');
  };

  // Enviar desde modal de vista previa
  const handleSendFromPreview = () => {
    if (!selectedAdminForPreview) return;
    const phoneToUse = customPhone || selectedAdminForPreview.adminPhone;
    const url = createWhatsAppWebUrl(phoneToUse, computedPreviewMessage);
    saveDispatchRecord(selectedAdminForPreview.tenantId);
    window.open(url, '_blank');
    setSelectedAdminForPreview(null);
  };

  // Copiar al portapapeles
  const handleCopyText = (admin: AdminSubscriptionAlertData, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(admin.tenantId);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="space-y-6">
      {/* =====================================================================
          1. HEADER DEL CENTRO DE COBRANZA Y NOTIFICACIONES WHATSAPP
         ===================================================================== */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/5 rounded-full blur-3xl -z-0 pointer-events-none" />

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-800 pb-5 relative z-10">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-mono flex items-center gap-1.5">
                <MessageSquare className="w-3.5 h-3.5 text-emerald-400" />
                Módulo Oficial de Cobranza WhatsApp
              </span>
              <span className="text-xs text-slate-400 font-mono">EnRuta SaaS · Anti-Mora Engine</span>
            </div>
            <h1 className="text-2xl font-black text-white tracking-tight mt-1 flex items-center gap-2">
              Despacho de Alertas & Notificaciones WhatsApp
            </h1>
            <p className="text-xs text-slate-400 max-w-2xl mt-0.5 leading-relaxed">
              Envíe recordatorios directos a los administradores: recuerde el bloqueo inmediato a las cuentas en mora (sin app, sin poder trabajar) y alerte preventivamente a quienes están por vencer sus facturas para ponerse al día.
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            {onNavigateToSubscriptions && (
              <button
                type="button"
                onClick={onNavigateToSubscriptions}
                className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors"
              >
                <Calendar className="w-4 h-4 text-amber-400" />
                <span>Ver Inventario General</span>
              </button>
            )}

            <button
              type="button"
              onClick={loadAdminsAndSubscriptions}
              disabled={isLoading}
              className="px-4 py-2.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 rounded-xl text-xs font-bold inline-flex items-center gap-2 transition-all cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-emerald-400' : ''}`} />
              <span>Actualizar Cuentas</span>
            </button>
          </div>
        </div>

        {/* =====================================================================
            2. TARJETAS DE IMPACTO OPERATIVO Y RESUMEN DE ALERTAS
           ===================================================================== */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-5 relative z-10">
          {/* Card 1: Administradores en Mora (Acceso Bloqueado) */}
          <div
            onClick={() => setActiveFilter('overdue')}
            className={`border rounded-2xl p-4.5 cursor-pointer transition-all ${
              activeFilter === 'overdue'
                ? 'bg-rose-950/40 border-rose-500 shadow-lg shadow-rose-950/30 ring-1 ring-rose-500'
                : 'bg-slate-950/80 border-rose-500/30 hover:border-rose-500/60'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-rose-400 uppercase tracking-wider flex items-center gap-1.5">
                <ShieldAlert className="w-4 h-4 text-rose-400 animate-pulse" />
                En Mora (Bloqueados)
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                Sin Servicio
              </span>
            </div>
            <div className="text-2xl font-black text-rose-400 font-mono mt-2">
              {overdueAdmins.length} Administrador(es)
            </div>
            <p className="text-[11px] text-slate-400 mt-1 leading-normal">
              Sin uso de la aplicación, cobradores bloqueados en calle y rutas paralizadas.
            </p>
            <div className="text-[10px] text-rose-300 font-mono font-semibold mt-2 pt-2 border-t border-rose-500/20">
              Total adeudado: {formatCOP(overdueAdmins.reduce((acc, c) => acc + c.monthlyFeeCop, 0))} COP
            </div>
          </div>

          {/* Card 2: Por Vencer (Facturación Inminente) */}
          <div
            onClick={() => setActiveFilter('expiring')}
            className={`border rounded-2xl p-4.5 cursor-pointer transition-all ${
              activeFilter === 'expiring'
                ? 'bg-amber-950/40 border-amber-500 shadow-lg shadow-amber-950/30 ring-1 ring-amber-500'
                : 'bg-slate-950/80 border-amber-500/30 hover:border-amber-500/60'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-amber-400" />
                Por Vencer (&lt; 5 días)
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                Ponerse al Día
              </span>
            </div>
            <div className="text-2xl font-black text-amber-300 font-mono mt-2">
              {expiringAdmins.length} Administrador(es)
            </div>
            <p className="text-[11px] text-slate-400 mt-1 leading-normal">
              Factura por vencer. Alerta preventiva para evitar corte de cobradores y del sistema.
            </p>
            <div className="text-[10px] text-amber-300 font-mono font-semibold mt-2 pt-2 border-t border-amber-500/20">
              Por recaudar: {formatCOP(expiringAdmins.reduce((acc, c) => acc + c.monthlyFeeCop, 0))} COP
            </div>
          </div>

          {/* Card 3: Eficiencia de Cobranza y Despacho */}
          <div
            onClick={() => setActiveFilter('all')}
            className={`border rounded-2xl p-4.5 cursor-pointer transition-all ${
              activeFilter === 'all'
                ? 'bg-indigo-950/40 border-indigo-500 shadow-lg shadow-indigo-950/30 ring-1 ring-indigo-500'
                : 'bg-slate-950/80 border-indigo-500/30 hover:border-indigo-500/60'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-indigo-300 uppercase tracking-wider flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-indigo-400" />
                Total a Notificar
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                Ver Todos
              </span>
            </div>
            <div className="text-2xl font-black text-white font-mono mt-2">
              {overdueAdmins.length + expiringAdmins.length} Notificaciones
            </div>
            <p className="text-[11px] text-slate-400 mt-1 leading-normal">
              Gestión directa hacia el WhatsApp oficial registrado con un solo clic.
            </p>
            <div className="text-[10px] text-emerald-400 font-mono font-semibold mt-2 pt-2 border-t border-indigo-500/20">
              {Object.keys(dispatchLogs).length} avisos despachados recientemente
            </div>
          </div>
        </div>
      </div>

      {/* =====================================================================
          3. BARRA DE FILTROS Y BÚSQUEDA RÁPIDA
         ===================================================================== */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col md:flex-row items-center justify-between gap-4">
        {/* Buscador */}
        <div className="relative w-full md:w-96">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por fondo, administrador, teléfono o ID..."
            className="w-full pl-9 pr-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
          />
        </div>

        {/* Filtros de Pestaña */}
        <div className="flex flex-wrap items-center gap-1.5 w-full md:w-auto">
          <button
            type="button"
            onClick={() => setActiveFilter('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeFilter === 'all'
                ? 'bg-slate-800 text-white border border-slate-700 shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/40'
            }`}
          >
            Todos ({overdueAdmins.length + expiringAdmins.length})
          </button>

          <button
            type="button"
            onClick={() => setActiveFilter('overdue')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeFilter === 'overdue'
                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/50 shadow-sm'
                : 'text-slate-400 hover:text-rose-300 hover:bg-rose-950/30'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-rose-400 animate-pulse" />
            En Mora / Bloqueados ({overdueAdmins.length})
          </button>

          <button
            type="button"
            onClick={() => setActiveFilter('expiring')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeFilter === 'expiring'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/50 shadow-sm'
                : 'text-slate-400 hover:text-amber-300 hover:bg-amber-950/30'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-amber-400" />
            Por Vencer / Facturación ({expiringAdmins.length})
          </button>
        </div>
      </div>

      {/* =====================================================================
          4. BANDEJA DE DESPACHO INTERACTIVA (TARJETAS DE COBRANZA WHATSAPP)
         ===================================================================== */}
      {isLoading ? (
        <div className="py-20 bg-slate-900 border border-slate-800 rounded-3xl flex flex-col items-center justify-center text-slate-400 gap-3">
          <RefreshCw className="w-8 h-8 animate-spin text-emerald-500" />
          <span className="text-xs font-semibold">Cargando cuentas administradoras para cobranza...</span>
        </div>
      ) : displayedAdmins.length === 0 ? (
        <div className="py-16 bg-slate-900 border border-slate-800 rounded-3xl text-center text-slate-400 space-y-2 p-6">
          <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto" />
          <h3 className="text-sm font-bold text-white">¡No hay cuentas que requieran recordatorio en este filtro!</h3>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            Todos los administradores están al día o no coinciden con el término de búsqueda ingresado.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {displayedAdmins.map((admin) => {
            const isOverdue = admin.daysOverdue > 0;
            const defaultMessage = isOverdue
              ? buildOverdueBlockedMessage(admin, 'blocked_mora_strict')
              : buildExpiringSoonMessage(admin, 'expiring_preventive');

            const lastSentIso = dispatchLogs[admin.tenantId];
            const isCopied = copiedId === admin.tenantId;

            return (
              <div
                key={admin.tenantId}
                className={`bg-slate-900 border rounded-3xl p-5 shadow-xl transition-all relative overflow-hidden flex flex-col justify-between ${
                  isOverdue
                    ? 'border-rose-500/40 hover:border-rose-500'
                    : 'border-amber-500/40 hover:border-amber-500'
                }`}
              >
                {/* Header de la tarjeta */}
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <div
                        className={`w-10 h-10 rounded-2xl flex items-center justify-center font-bold shrink-0 ${
                          isOverdue
                            ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                            : 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                        }`}
                      >
                        {isOverdue ? <Lock className="w-5 h-5" /> : <Clock className="w-5 h-5" />}
                      </div>
                      <div>
                        <h3 className="font-bold text-sm text-white flex items-center gap-1.5">
                          <span>{admin.organizationName}</span>
                        </h3>
                        <div className="text-[11px] text-slate-400">
                          Admin: <strong className="text-slate-200">{admin.adminName}</strong>
                        </div>
                      </div>
                    </div>

                    {/* Badge de Estado Concreto */}
                    {isOverdue ? (
                      <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-rose-500/20 text-rose-300 border border-rose-500/40 inline-flex items-center gap-1 shrink-0">
                        <Flame className="w-3 h-3 text-rose-400 animate-pulse" />
                        BLOQUEADO ({admin.daysOverdue}D MORA)
                      </span>
                    ) : (
                      <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/40 inline-flex items-center gap-1 shrink-0">
                        <Clock className="w-3 h-3 text-amber-400" />
                        VENCE EN {admin.daysRemaining} DÍAS
                      </span>
                    )}
                  </div>

                  {/* Resumen de Situación Operativa */}
                  <div
                    className={`mt-4 p-3 rounded-2xl text-xs space-y-1.5 border ${
                      isOverdue
                        ? 'bg-rose-950/30 border-rose-900/50 text-rose-200'
                        : 'bg-amber-950/30 border-amber-900/50 text-amber-200'
                    }`}
                  >
                    <div className="flex items-center justify-between font-mono">
                      <span className="text-slate-400">Tarifa Mensual ({admin.activeRoutes} ruta(s)):</span>
                      <span className="font-bold text-white">{formatCOP(admin.monthlyFeeCop)} COP</span>
                    </div>

                    <div className="flex items-center justify-between font-mono">
                      <span className="text-slate-400">Fecha de Corte:</span>
                      <span className="font-semibold text-slate-300">
                        {new Date(admin.currentPeriodEnd).toLocaleDateString('es-CO', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </span>
                    </div>

                    <div className="pt-1 border-t border-slate-800/60 text-[11px] font-medium leading-relaxed">
                      {isOverdue ? (
                        <span className="text-rose-300">
                          ⚠️ <strong>Sin acceso a la aplicación:</strong> El administrador no puede ingresar y sus cobradores están inhabilitados en calle para registrar pagos.
                        </span>
                      ) : (
                        <span className="text-amber-300">
                          💡 <strong>Aviso preventivo:</strong> Recordar pago de factura para que el fondo no sufra suspensión repentina de sus cobradores.
                        </span>
                      )}
                    </div>
                  </div>

                  {/* WhatsApp Info */}
                  <div className="mt-3 flex items-center justify-between text-xs text-slate-400 px-1">
                    <div className="flex items-center gap-1.5 font-mono text-[11px]">
                      <Phone className="w-3.5 h-3.5 text-emerald-400" />
                      <span>{admin.adminPhone}</span>
                    </div>

                    {lastSentIso ? (
                      <div className="text-[10px] text-emerald-400 font-mono flex items-center gap-1">
                        <Check className="w-3 h-3" />
                        <span>Avisado {new Date(lastSentIso).toLocaleDateString('es-CO', { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                    ) : (
                      <span className="text-[10px] text-slate-500 font-mono italic">Sin aviso enviado hoy</span>
                    )}
                  </div>
                </div>

                {/* Acciones de Cobro por WhatsApp */}
                <div className="mt-5 pt-3 border-t border-slate-800 flex items-center gap-2">
                  {/* Botón Principal: Despachar a WhatsApp */}
                  <button
                    type="button"
                    onClick={() => handleQuickSend(admin)}
                    className={`flex-1 py-2.5 px-3 rounded-xl font-bold text-xs inline-flex items-center justify-center gap-2 shadow-lg cursor-pointer transition-all ${
                      isOverdue
                        ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-950/40'
                        : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-950/40'
                    }`}
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>{isOverdue ? 'Enviar Aviso Bloqueo' : 'Enviar Recordatorio'}</span>
                  </button>

                  {/* Botón: Personalizar & Vista Previa */}
                  <button
                    type="button"
                    onClick={() => handleOpenPreview(admin)}
                    className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors cursor-pointer"
                    title="Ver y editar mensaje antes de enviar"
                  >
                    <Eye className="w-4 h-4 text-amber-400" />
                  </button>

                  {/* Botón: Copiar Mensaje */}
                  <button
                    type="button"
                    onClick={() => handleCopyText(admin, defaultMessage)}
                    className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors cursor-pointer"
                    title="Copiar texto al portapapeles"
                  >
                    {isCopied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* =====================================================================
          5. MODAL INTERACTIVO: COMPOSITOR Y VISTA PREVIA ESTILO WHATSAPP
         ===================================================================== */}
      {selectedAdminForPreview && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="p-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold">
                  <MessageSquare className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-white">Compositor de Mensaje WhatsApp</h3>
                  <p className="text-[11px] text-slate-400">
                    Destinatario: {selectedAdminForPreview.adminName} ({selectedAdminForPreview.organizationName})
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedAdminForPreview(null)}
                className="text-slate-400 hover:text-white p-1 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 overflow-y-auto space-y-4 text-xs">
              {/* Opciones de Plantilla y Teléfono */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Plantilla / Tono de Cobro:
                  </label>
                  {selectedAdminForPreview.daysOverdue > 0 ? (
                    <select
                      value={previewTone}
                      onChange={(e) => setPreviewTone(e.target.value as any)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                    >
                      <option value="blocked_mora_strict">
                        🚨 Bloqueo Total (App & Cobradores Sin Acceso)
                      </option>
                      <option value="blocked_mora_urgent">
                        ⚠️ Alerta Urgente (Protección de Cartera)
                      </option>
                    </select>
                  ) : (
                    <select
                      value={previewTone}
                      onChange={(e) => setPreviewTone(e.target.value as any)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                    >
                      <option value="expiring_preventive">
                        🔔 Preventivo Formal (Evitar suspensión de cobradores)
                      </option>
                      <option value="expiring_friendly">
                        👋 Preventivo Amistoso (Recordatorio de fin de ciclo)
                      </option>
                    </select>
                  )}
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Número Celular de WhatsApp:
                  </label>
                  <input
                    type="text"
                    value={customPhone}
                    onChange={(e) => setCustomPhone(e.target.value)}
                    placeholder="Ej: 3124567890"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              {/* Nota Personalizada Opcional */}
              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Nota Adicional de la SuperAdministración (Opcional):
                </label>
                <input
                  type="text"
                  value={customNote}
                  onChange={(e) => setCustomNote(e.target.value)}
                  placeholder="Ej: Favor transferir a la cuenta Bancolombia Ahorros #031-8849-21 y enviar soporte a este chat."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                />
              </div>

              {/* Vista Previa Estilo Burbuja de WhatsApp */}
              <div>
                <label className="block text-slate-400 font-semibold mb-1 flex items-center justify-between">
                  <span>Vista Previa en Tiempo Real:</span>
                  <span className="text-[10px] text-emerald-400 font-mono">Formato Oficial WhatsApp</span>
                </label>
                <div className="bg-[#0b141a] border border-[#202c33] rounded-2xl p-4 shadow-inner relative font-sans text-xs">
                  <div className="bg-[#005c4b] text-[#e9edef] rounded-2xl p-3.5 max-w-xl shadow-md space-y-2 whitespace-pre-wrap leading-relaxed select-text">
                    {computedPreviewMessage}
                    <div className="text-right text-[10px] text-emerald-200/80 font-mono flex items-center justify-end gap-1 mt-2">
                      <span>Ahora</span>
                      <Check className="w-3 h-3" />
                      <Check className="w-3 h-3 -ml-2" />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-950 border-t border-slate-800 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(computedPreviewMessage);
                  setPreviewCopied(true);
                  setTimeout(() => setPreviewCopied(false), 2000);
                }}
                className="px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs inline-flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                {previewCopied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                <span>{previewCopied ? '¡Texto Copiado!' : 'Copiar Texto'}</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedAdminForPreview(null)}
                  className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold rounded-xl text-xs cursor-pointer"
                >
                  Cancelar
                </button>

                <button
                  type="button"
                  onClick={handleSendFromPreview}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs inline-flex items-center gap-2 shadow-lg shadow-emerald-950/40 cursor-pointer"
                >
                  <Send className="w-4 h-4" />
                  <span>Abrir Chat y Enviar WhatsApp</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
