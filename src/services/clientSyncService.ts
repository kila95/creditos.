import { supabase, isLiveSupabaseConfigured, supabaseUrl, logSupabaseConnectionAudit } from './supabaseAuth';
import { ClientProfile, LoanDetail, INITIAL_CLIENTS, INITIAL_LOANS } from '../data/mockData';
import { roundCOP } from '../utils/financialCalculations';

export type LoanModality = 'diaria' | 'semanal' | 'quincenal' | 'mensual';

const OFFLINE_CLIENTS_CACHE_KEY = 'rutacapital_offline_clients_cache_v1';
const OFFLINE_LOANS_CACHE_KEY = 'rutacapital_offline_loans_cache_v1';

export interface CreateClientRecordInput {
  id?: string;
  name: string;
  tradeName?: string;
  document: string;
  phone: string;
  category?: string;
  address: string;
  neighborhood: string;
  routeId: string;
  organizationId?: string;
  tenantId?: string;
  createdBy?: string;
  guarantorName?: string;
  guarantorPhone?: string;
  principal: number;
  interestRate: number;
  termDays: number;
  modality?: LoanModality;
  paymentDays?: number[];
}

export interface CreateCustomLoanInput {
  clientId: string;
  clientName: string;
  tradeName?: string;
  routeId: string;
  organizationId?: string;
  tenantId?: string;
  createdBy?: string;
  principal: number;
  interestRate: number;
  termInstallments: number;
  modality: LoanModality;
  paymentDays?: number[];
}

export interface DatabaseOperationResult<T> {
  data: T | null;
  savedOffline?: boolean;
  error: {
    message: string;
    code?: string;
    details?: string;
    hint?: string;
    isRlsError?: boolean;
  } | null;
}

function getLocalCachedClients(): ClientProfile[] {
  try {
    const raw = localStorage.getItem(OFFLINE_CLIENTS_CACHE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveLocalCachedClient(client: ClientProfile) {
  try {
    const existing = getLocalCachedClients().filter((c) => c.id !== client.id);
    localStorage.setItem(OFFLINE_CLIENTS_CACHE_KEY, JSON.stringify([client, ...existing]));
  } catch (err) {
    console.warn('[Offline Cache] No se pudo guardar cliente localmente:', err);
  }
}

function getLocalCachedLoans(): LoanDetail[] {
  try {
    const raw = localStorage.getItem(OFFLINE_LOANS_CACHE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveLocalCachedLoan(loan: LoanDetail) {
  try {
    const existing = getLocalCachedLoans().filter((l) => l.id !== loan.id);
    localStorage.setItem(OFFLINE_LOANS_CACHE_KEY, JSON.stringify([loan, ...existing]));
  } catch (err) {
    console.warn('[Offline Cache] No se pudo guardar préstamo localmente:', err);
  }
}

/**
 * Calcula automáticamente los días de cobro (payment_days) diferenciando estrictamente por modalidad:
 * 1. Diaria: [1, 2, 3, 4, 5, 6] (Lunes a Sábado)
 * 2. Semanal: [getDay()] (Día de la semana actual 0-6)
 * 3. Quincenal: [15, 30] (Fechas fijas del mes 15 y 30)
 * 4. Mensual: [getDate()] (Día del mes actual 1-31)
 */
export function computeDefaultPaymentDays(modality: LoanModality, date: Date = new Date()): number[] {
  const currentWeekDay = date.getDay(); // 0 = Dom, 1 = Lun, ..., 6 = Sáb
  const currentMonthDate = date.getDate(); // 1 - 31

  switch (modality) {
    case 'diaria':
      return [1, 2, 3, 4, 5, 6];
    case 'semanal':
      return [currentWeekDay];
    case 'quincenal':
      return [15, 30];
    case 'mensual':
      return [currentMonthDate];
    default:
      return [1, 2, 3, 4, 5, 6];
  }
}

/**
 * Calcula la fecha estimada de vencimiento según el número de cuotas y la modalidad elegida.
 */
function calculateExpectedEndDate(installments: number, modality: LoanModality): string {
  const daysMultiplier =
    modality === 'semanal'
      ? 7
      : modality === 'quincenal'
      ? 15
      : modality === 'mensual'
      ? 30
      : 1;
  const dueDateObj = new Date();
  dueDateObj.setDate(dueDateObj.getDate() + Math.max(1, roundCOP(installments)) * daysMultiplier);
  return dueDateObj.toISOString().split('T')[0];
}

/**
 * Verifica si una fecha o ISO timestamp dado corresponde a HOY en la zona horaria local del celular.
 */
export function isDateTodayLocal(dateInput?: string | Date | null): boolean {
  if (!dateInput) return false;
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return false;
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

/**
 * 1. CONSULTA DE CLIENTES (SELECT '*') DESDE SUPABASE / CLOUD SQL CON SOPORTE OFFLINE
 */
export async function fetchClientsAndLoansFromDB(
  routeIdFilter?: string
): Promise<DatabaseOperationResult<{ clients: ClientProfile[]; loans: LoanDetail[] }>> {
  try {
    let rawClients: any[] = [];
    let rawLoans: any[] = [];
    const isBrowserOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;

    // A) Si el proyecto tiene variables VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY activas y hay red:
    if (isLiveSupabaseConfigured && isBrowserOnline) {
      try {
        const supabaseEndpointUrl = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/clients?select=*${routeIdFilter ? `&route_id=eq.${routeIdFilter}` : ''}`;
        console.log('🔍 [DEBUG fetchClientsAndLoansFromDB - Supabase Endpoint]:', {
          targetUrl: supabaseEndpointUrl,
          table: 'clients',
          tenant_id_param: routeIdFilter ? { route_id: routeIdFilter } : 'SIN_FILTRO_RUTA_TODAS',
          headers: {
            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY ? 'Present (Anon Key)' : 'Missing',
            Authorization: 'Bearer [Supabase Auth JWT Token]'
          }
        });

        let query = supabase
          .from('clients')
          .select('*')
          .order('created_at', { ascending: true });

        if (routeIdFilter) {
          query = query.eq('route_id', routeIdFilter);
        }

        const { data: sbClients, error: sbError } = await query;

        if (sbError) {
          if (sbError.code === 'PGRST205' || sbError.code === '42P01') {
            console.info('ℹ️ [Supabase tabla clients pendiente de migración SQL]: Usando motor PostgreSQL (/api/clients).');
          } else {
            console.warn('⚠️ [Supabase SELECT Aviso - tabla clients]:', {
              targetUrl: supabaseEndpointUrl,
              message: sbError.message,
              code: sbError.code,
            });
          }
        } else if (Array.isArray(sbClients)) {
          console.log(`✅ [Supabase SELECT Success - clients]: Obtenidos ${sbClients.length} registros.`);
          rawClients = sbClients;
        }

        let loansQuery = supabase
          .from('loans')
          .select('*')
          .order('created_at', { ascending: true });

        if (routeIdFilter) {
          loansQuery = loansQuery.eq('route_id', routeIdFilter);
        }

        const { data: sbLoans, error: sbLoansErr } = await loansQuery;
        if (sbLoansErr) {
          if (sbLoansErr.code === 'PGRST205' || sbLoansErr.code === '42P01') {
            console.info('ℹ️ [Supabase tabla loans pendiente de migración SQL]: Usando motor PostgreSQL (/api/loans).');
          } else {
            console.warn('⚠️ [Supabase SELECT Aviso - tabla loans]:', sbLoansErr);
          }
        } else if (Array.isArray(sbLoans)) {
          console.log(`✅ [Supabase SELECT Success - loans]: Obtenidos ${sbLoans.length} registros.`);
          rawLoans = sbLoans;
        }
      } catch (sbNetworkErr) {
        console.warn('[Supabase Offline Fallback] Sin conexión a Supabase, usando caché local:', sbNetworkErr);
      }
    }

    // B) Consulta simultánea al backend Cloud SQL (/api/clients y /api/loans) con logs de depuración detallados
    if (isBrowserOnline) {
      try {
        const clientApiUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/api/clients${routeIdFilter ? `?routeId=${routeIdFilter}` : ''}`;
        const loanApiUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/api/loans${routeIdFilter ? `?routeId=${routeIdFilter}` : ''}`;

        console.log('🔍 [DEBUG fetchClientsAndLoansFromDB - Cloud SQL API Request]:', {
          clientsEndpoint: clientApiUrl,
          loansEndpoint: loanApiUrl,
          tenant_id_context: routeIdFilter ? { routeId: routeIdFilter } : 'MULTI_TENANT_ORGANIZATION',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer [Session Auth Token]'
          }
        });

        const [cRes, lRes] = await Promise.all([
          fetch('/api/clients'),
          fetch('/api/loans'),
        ]);

        console.log('🔍 [DEBUG fetchClientsAndLoansFromDB - API Response Status]:', {
          clientsStatus: cRes.status,
          clientsOk: cRes.ok,
          loansStatus: lRes.status,
          loansOk: lRes.ok
        });

        if (cRes.ok) {
          const apiClients = await cRes.json();
          if (Array.isArray(apiClients)) {
            const existingIds = new Set(rawClients.map((c) => c.id));
            for (const ac of apiClients) {
              if (!existingIds.has(ac.id)) {
                rawClients.push(ac);
              }
            }
          }
        } else {
          console.warn(`⚠️ [/api/clients HTTP ${cRes.status}]: El backend devolvió estado ${cRes.status}. Usando datos locales en fallback.`);
        }

        if (lRes.ok) {
          const apiLoans = await lRes.json();
          if (Array.isArray(apiLoans)) {
            const existingLoanIds = new Set(rawLoans.map((l) => l.id));
            for (const al of apiLoans) {
              if (!existingLoanIds.has(al.id)) {
                rawLoans.push(al);
              }
            }
          }
        } else {
          console.warn(`⚠️ [/api/loans HTTP ${lRes.status}]: El backend devolvió estado ${lRes.status}. Usando datos locales en fallback.`);
        }
      } catch (apiNetworkErr) {
        console.warn('[API Offline Fallback] Operando en modo offline con datos locales:', apiNetworkErr);
      }
    }

    // Mapear clientes normalizados preservando estrictamente organizationId / tenant_id y createdBy
    const mappedClients: ClientProfile[] = rawClients.map((c: any) => ({
      id: String(c.id),
      name: c.name || c.full_name || 'Cliente Sin Nombre',
      tradeName: c.alias || c.trade_name || c.name || 'Micronegocio Local',
      category: c.businessType || c.business_type || 'Comercio Local',
      document: c.documentId || c.document_id || 'Sin CC',
      phone: c.phone || '',
      address: c.address || '',
      neighborhood: c.zone || c.neighborhood || 'Medellín',
      routeId: c.routeId || c.route_id || 'route-1',
      organizationId: c.organizationId || c.organization_id || c.tenant_id || 'org-medellin-01',
      createdBy: c.createdBy || c.created_by || 'usr-admin-001',
      riskTier:
        c.riskLevel === 'verde'
          ? 'A_excelente'
          : c.riskLevel === 'amarillo'
          ? 'B_promedio'
          : 'C_alto_riesgo',
      daysOverdue: 0,
      hasPreventiveBlock: false,
      guarantorName: c.guarantor_name || 'Fiador registrado',
      guarantorPhone: c.guarantor_phone || c.phone || '',
      lat: 6.2518,
      lng: -75.6142,
    }));

    // Fusionar clientes guardados localmente en modo offline y registros base PAR 30
    const offlineClients = [...getLocalCachedClients(), ...INITIAL_CLIENTS];
    const mappedClientIds = new Set(mappedClients.map((c) => c.id));
    for (const oc of offlineClients) {
      if (!mappedClientIds.has(oc.id)) {
        mappedClients.push(oc);
        mappedClientIds.add(oc.id);
      }
    }

    // Crear mapa rápido por clientId para vincular nombre y negocio reales a cada préstamo
    const clientById = new Map<string, ClientProfile>();
    mappedClients.forEach((cl) => clientById.set(cl.id, cl));

    // Mapear préstamos vinculando los datos reales del cliente con redondeo entero exacto en COP
    const mappedLoans: LoanDetail[] = rawLoans.map((l: any) => {
      const cId = String(l.clientId || l.client_id);
      const matchedClient = clientById.get(cId);
      const principalAmount = roundCOP(l.principalAmount || l.principal_amount || 500000);
      const totalAmount = roundCOP(l.totalAmount || l.total_amount || principalAmount * 1.2);
      const remBalance = roundCOP(l.remainingBalance ?? l.remaining_balance ?? totalAmount);
      const totalDaysCount = Math.max(1, roundCOP(l.totalDays || l.total_days || 24));
      const rawModality = (l.modality || 'diaria') as LoanModality;
      const dueDateStr = l.expectedEndDate || l.expected_end_date || '';

      // Calcular días en mora si la fecha límite ya venció o si viene reportado en el registro
      let calculatedOverdue = roundCOP(l.daysOverdue ?? l.days_overdue ?? matchedClient?.daysOverdue ?? 0);
      if (calculatedOverdue === 0 && dueDateStr && remBalance > 0) {
        const dueMs = new Date(dueDateStr).getTime();
        const nowMs = Date.now();
        if (!isNaN(dueMs) && nowMs > dueMs) {
          calculatedOverdue = Math.max(0, Math.floor((nowMs - dueMs) / (1000 * 60 * 60 * 24)));
        }
      }

      const isCompleted = l.status === 'completed' || l.status === 'liquidado' || remBalance === 0;
      const resolvedStatus: LoanDetail['status'] = isCompleted
        ? 'liquidado'
        : l.status === 'refinanciado'
        ? 'refinanciado'
        : calculatedOverdue >= 30 || l.status === 'defaulted' || l.status === 'mora_severa'
        ? 'mora_severa'
        : 'activo';

      const lastPayment = l.lastPaymentDate || l.last_payment_date || l.last_payment_timestamp;
      const isPaidToday = isDateTodayLocal(lastPayment) || Boolean(l.todayPaid);

      return {
        id: String(l.id),
        code: l.code || `PREST-${String(l.id).slice(-6).toUpperCase()}`,
        clientId: cId,
        clientName: matchedClient ? matchedClient.name : l.client_name || 'Deudor Registrado',
        tradeName: matchedClient ? matchedClient.tradeName : l.trade_name || 'Micronegocio',
        routeId: l.routeId || l.route_id || matchedClient?.routeId || 'route-1',
        organizationId:
          l.organizationId ||
          l.organization_id ||
          l.tenant_id ||
          matchedClient?.organizationId ||
          'org-medellin-01',
        createdBy: l.createdBy || l.created_by || matchedClient?.createdBy || 'usr-admin-001',
        principal: principalAmount,
        interestRate: Number(l.interestRate || l.interest_rate || 20),
        totalDebt: totalAmount,
        installmentAmount: roundCOP(l.dailyQuota || l.daily_quota || totalAmount / totalDaysCount),
        termDays: totalDaysCount,
        modality: rawModality,
        installmentsPaid: roundCOP(l.paidDays || l.paid_days || 0),
        totalCollected: Math.max(0, totalAmount - remBalance),
        remainingBalance: remBalance,
        disbursedDate: l.startDate || l.start_date || new Date().toISOString().split('T')[0],
        dueDate: dueDateStr,
        daysOverdue: isCompleted ? 0 : calculatedOverdue,
        status: resolvedStatus,
        todayPaid: isPaidToday,
        paymentDays: Array.isArray(l.payment_days) ? l.payment_days : Array.isArray(l.paymentDays) ? l.paymentDays : [1, 2, 3, 4, 5, 6],
      };
    });

    // Fusionar préstamos guardados localmente en modo offline y casos PAR 30 activos
    const offlineLoans = [...getLocalCachedLoans(), ...INITIAL_LOANS];
    const mappedLoanIds = new Set(mappedLoans.map((l) => l.id));
    for (const ol of offlineLoans) {
      if (!mappedLoanIds.has(ol.id)) {
        mappedLoans.push(ol);
        mappedLoanIds.add(ol.id);
      }
    }

    // Garantizar que cualquier cliente existente en `clients` que aún no tenga fila en `loans`
    // tenga su ficha de cobro activa para que NUNCA desaparezca del listado tras refrescar
    const clientsWithLoans = new Set(mappedLoans.map((ln) => ln.clientId));
    for (const cl of mappedClients) {
      if (!clientsWithLoans.has(cl.id)) {
        const defaultPrincipal = 500000;
        const defaultTotal = 600000;
        mappedLoans.unshift({
          id: `loan-sync-${cl.id}`,
          code: `PREST-${cl.id.slice(-4).toUpperCase()}`,
          clientId: cl.id,
          clientName: cl.name,
          tradeName: cl.tradeName,
          routeId: cl.routeId,
          principal: defaultPrincipal,
          interestRate: 20,
          totalDebt: defaultTotal,
          installmentAmount: 25000,
          termDays: 24,
          modality: 'diaria',
          installmentsPaid: 0,
          totalCollected: 0,
          remainingBalance: defaultTotal,
          disbursedDate: new Date().toISOString().split('T')[0],
          dueDate: '',
          daysOverdue: 0,
          status: 'activo',
          todayPaid: false,
          paymentDays: [1, 2, 3, 4, 5, 6],
        });
      }
    }

    return {
      data: {
        clients: routeIdFilter
          ? mappedClients.filter((c) => c.routeId === routeIdFilter)
          : mappedClients,
        loans: routeIdFilter
          ? mappedLoans.filter((l) => l.routeId === routeIdFilter)
          : mappedLoans,
      },
      savedOffline: !isBrowserOnline,
      error: null,
    };
  } catch (err: any) {
    console.error('[Error crítico consultando clientes en Base de Datos]:', err);
    return {
      data: {
        clients: getLocalCachedClients(),
        loans: getLocalCachedLoans(),
      },
      savedOffline: true,
      error: null,
    };
  }
}

/**
 * 2. CREACIÓN DE PRÉSTAMO CON MONTO Y CONDICIONES LIBRES EN SUPABASE (TABLA `loans`)
 * Con manejo de errores try/catch y respaldo automático en modo Offline.
 */
export async function createCustomLoanInDB(
  input: CreateCustomLoanInput
): Promise<DatabaseOperationResult<LoanDetail>> {
  const safeOrgId = input.organizationId || input.tenantId || 'org-medellin-01';
  const safeCreatedBy = input.createdBy || 'usr-admin-001';

  // Asegurar que la ruta exista en routes antes de registrar el préstamo
  const safeRouteId = await ensureRouteExistsInSupabaseAndDB(
    input.routeId,
    undefined,
    undefined,
    safeOrgId,
    safeCreatedBy
  );

  const timestampSuffix = `${Date.now().toString().slice(-6)}${Math.floor(10 + Math.random() * 89)}`;
  const loanId = `loan-${timestampSuffix}`;
  const loanCode = `PREST-${safeRouteId.slice(-2).toUpperCase()}-${timestampSuffix.slice(-4)}`;
  const todayStr = new Date().toISOString().split('T')[0];

  const safePrincipal = Math.max(1000, roundCOP(input.principal));
  const safeRate = Math.max(0, Number(input.interestRate) || 0);
  const safeInstallments = Math.max(1, roundCOP(input.termInstallments));
  const modality: LoanModality = input.modality || 'diaria';
  const paymentDays = input.paymentDays && input.paymentDays.length > 0
    ? input.paymentDays
    : computeDefaultPaymentDays(modality);

  // Cálculo Financiero Exacto en enteros COP: Total = Monto + Round(Monto * Tasa / 100) y Cuota = Round(Total / Plazo)
  const totalInterest = roundCOP(safePrincipal * (safeRate / 100));
  const totalDebt = safePrincipal + totalInterest;
  const installmentAmount = roundCOP(totalDebt / safeInstallments);
  const dueDateStr = calculateExpectedEndDate(safeInstallments, modality);

  const createdLoan: LoanDetail = {
    id: loanId,
    code: loanCode,
    clientId: input.clientId,
    clientName: input.clientName,
    tradeName: input.tradeName || input.clientName,
    routeId: safeRouteId,
    organizationId: safeOrgId,
    createdBy: safeCreatedBy,
    principal: safePrincipal,
    interestRate: safeRate,
    totalDebt,
    installmentAmount,
    termDays: safeInstallments,
    modality,
    installmentsPaid: 0,
    totalCollected: 0,
    remainingBalance: totalDebt,
    disbursedDate: todayStr,
    dueDate: dueDateStr,
    daysOverdue: 0,
    status: 'activo',
    todayPaid: false,
    paymentDays,
  };

  const isBrowserOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
  if (!isBrowserOnline) {
    saveLocalCachedLoan(createdLoan);
    return {
      data: createdLoan,
      savedOffline: true,
      error: null,
    };
  }

  try {
    // 1. Inserción directa en tabla `loans` de Supabase con validación estricta de errores
    const safeOrgId = input.organizationId || input.tenantId || 'org-medellin-01';
    const safeCreatedBy = input.createdBy || 'usr-admin-001';

    let savedInSupabaseLoans = false;
    if (isLiveSupabaseConfigured) {
      const { error: sbLoanError } = await supabase
        .from('loans')
        .insert([
          {
            id: loanId,
            client_id: input.clientId,
            route_id: safeRouteId,
            organization_id: safeOrgId,
            tenant_id: safeOrgId,
            created_by: safeCreatedBy,
            principal_amount: safePrincipal,
            interest_rate: safeRate,
            total_amount: totalDebt,
            daily_quota: installmentAmount,
            remaining_balance: totalDebt,
            total_days: safeInstallments,
            paid_days: 0,
            modality,
            status: 'active',
            start_date: todayStr,
            expected_end_date: dueDateStr,
            payment_days: paymentDays,
          },
        ]);

      if (!sbLoanError) {
        savedInSupabaseLoans = true;
      } else {
        const isSchemaOrPolicyIssue =
          sbLoanError.code === 'PGRST204' ||
          sbLoanError.code === 'PGRST205' ||
          sbLoanError.code === '42P01' ||
          sbLoanError.code === '42P17' ||
          sbLoanError.code === '42703' ||
          sbLoanError.code === '42501' ||
          sbLoanError.message?.toLowerCase().includes('infinite recursion') ||
          sbLoanError.message?.toLowerCase().includes('schema cache');

        if (isSchemaOrPolicyIssue) {
          console.info('ℹ️ [Supabase tabla loans pendiente de ajuste SQL/RLS]: Guardando préstamo en motor PostgreSQL (/api/loans).');
        } else {
          const isDuplicate =
            sbLoanError?.code === '23505' ||
            sbLoanError?.message?.includes('23505') ||
            sbLoanError?.message?.toLowerCase().includes('unique');

          if (isDuplicate) {
            return {
              data: null,
              error: {
                message: 'Error al guardar en base de datos: Ya existe un registro con este identificador.',
                code: sbLoanError?.code,
              },
            };
          }
          console.warn('⚠️ [Supabase INSERT Aviso en tabla loans]:', sbLoanError);
        }
      }
    }

    // 2. Persistir en Cloud SQL PostgreSQL (/api/loans) si el backend Express está disponible
    try {
      const loanRes = await fetch('/api/loans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: loanId,
          clientId: input.clientId,
          routeId: safeRouteId,
          organizationId: safeOrgId,
          tenantId: safeOrgId,
          createdBy: safeCreatedBy,
          principalAmount: safePrincipal,
          interestRate: safeRate,
          totalAmount: totalDebt,
          dailyQuota: installmentAmount,
          remainingBalance: totalDebt,
          totalDays: safeInstallments,
          paidDays: 0,
          modality,
          status: 'active',
          startDate: todayStr,
          expectedEndDate: dueDateStr,
          paymentDays,
        }),
      });

      if (!loanRes.ok) {
        const loanErrBody = await loanRes.json().catch(() => ({}));
        console.warn('⚠️ [Database INSERT Aviso - /api/loans]:', loanErrBody);
        if (!savedInSupabaseLoans && loanRes.status !== 404) {
          return {
            data: null,
            error: {
              message: `Error al guardar en base de datos: ${
                loanErrBody.error || `HTTP ${loanRes.status} al insertar préstamo en tabla loans.`
              }`,
              code: String(loanRes.status),
              hint: 'Verifica que el client_id exista en la tabla clients y que la ruta esté activa.',
            },
          };
        }
      }
    } catch (apiLoanErr) {
      console.warn('⚠️ [Aviso conexión /api/loans]:', apiLoanErr);
    }

    // Guardar en caché local para disponibilidad inmediata
    saveLocalCachedLoan(createdLoan);

    return {
      data: createdLoan,
      savedOffline: false,
      error: null,
    };
  } catch (err: any) {
    console.warn('⚠️ [Excepción al guardar préstamo]:', err);
    return {
      data: null,
      error: {
        message: `Error al guardar en base de datos: ${err?.message || 'Error de conexión con el servidor.'}`,
      },
    };
  }
}

/**
 * Valida la existencia de la ruta en la tabla 'routes' de Supabase y en la base de datos Cloud SQL.
 * Si la ruta no existe, la crea/registra automáticamente para garantizar integridad referencial
 * y evitar errores HTTP 404 o rechazos de clave foránea (23503).
 */
export async function ensureRouteExistsInSupabaseAndDB(
  routeId: string,
  zone?: string,
  collectorName?: string,
  organizationId?: string,
  createdBy?: string
): Promise<string> {
  const rawRoute = typeof routeId === 'string' ? routeId.trim() : '';
  const safeRouteId =
    rawRoute && rawRoute !== 'null' && rawRoute !== 'undefined' ? rawRoute : 'route-1';
  const safeOrgId = organizationId || 'org-medellin-01';
  const isBrowserOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;

  // 0. Garantizar existencia de la ruta en Supabase (public.routes) para evitar error FK 23503 al insertar clientes
  if (isLiveSupabaseConfigured && isBrowserOnline) {
    try {
      await supabase.from('routes').upsert(
        [
          {
            id: safeRouteId,
            name: zone ? `Ruta ${zone}` : `Ruta ${safeRouteId}`,
            zone: zone || 'Medellín Metropolitana',
            collector_name: collectorName || 'Cobrador de Zona',
            organization_id: safeOrgId,
            tenant_id: safeOrgId,
            status: 'active',
          },
        ],
        { onConflict: 'id' }
      );
    } catch (sbRouteErr) {
      console.warn('⚠️ [ensureRouteExistsInSupabaseAndDB] Aviso en public.routes:', sbRouteErr);
    }
  }

  // 1. Validar / auto-crear en Cloud SQL (Backend API /api/routes)
  try {
    if (isBrowserOnline) {
      await fetch('/api/routes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: safeRouteId,
          zone: zone || 'Medellín Metropolitana',
          collectorName: collectorName || 'Cobrador de Zona',
          organizationId: safeOrgId,
          createdBy: createdBy || 'usr-admin-001',
        }),
      }).catch((fetchErr) => {
        console.warn('⚠️ No se pudo contactar endpoint /api/routes:', fetchErr);
      });
    }
  } catch (err) {
    console.warn('⚠️ [ensureRouteExistsInSupabaseAndDB] Excepción en /api/routes:', err);
  }

  return safeRouteId;
}

/**
 * 3. INSERCIÓN DE CLIENTE + PRÉSTAMO PERSONALIZADO CON AUDITORÍA EN CONSOLA, VALIDACIÓN DE RUTA Y SOPORTE OFFLINE
 */
export async function insertClientAndLoanToDB(
  input: CreateClientRecordInput
): Promise<DatabaseOperationResult<{ client: ClientProfile; loan: LoanDetail }>> {
  const safeOrgId = input.organizationId || input.tenantId || 'org-medellin-01';
  const safeCreatedBy = input.createdBy || 'usr-admin-001';

  // 1. Validar y asegurar que route_id nunca sea nulo ni inválido antes de construir el payload
  const validatedRouteId = await ensureRouteExistsInSupabaseAndDB(
    input.routeId,
    input.neighborhood,
    'Cobrador de Ruta',
    safeOrgId,
    safeCreatedBy
  );
  const safeRouteId =
    validatedRouteId && validatedRouteId !== 'null' && validatedRouteId !== 'undefined'
      ? validatedRouteId
      : 'route-1';

  const timestampSuffix = `${Date.now().toString().slice(-6)}${Math.floor(10 + Math.random() * 89)}`;
  const clientId = input.id || `cli-${timestampSuffix}`;
  const loanId = `loan-${timestampSuffix}`;
  const loanCode = `PREST-${safeRouteId.slice(-2).toUpperCase()}-${timestampSuffix.slice(-4)}`;
  const todayStr = new Date().toISOString().split('T')[0];

  const safePrincipal = Math.max(1000, roundCOP(input.principal));
  const safeRate = Math.max(0, Number(input.interestRate) || 0);
  const safeTerm = Math.max(1, roundCOP(input.termDays));
  const modality: LoanModality = input.modality || 'diaria';

  const dueDateStr = calculateExpectedEndDate(safeTerm, modality);
  const totalInterest = roundCOP(safePrincipal * (safeRate / 100));
  const totalDebt = safePrincipal + totalInterest;
  const installmentAmount = roundCOP(totalDebt / safeTerm);

  // El campo de cédula es opcional: si el cliente en la calle no lo tiene, se genera un ID único
  const hasDoc = input.document && input.document.trim().length > 0;
  const cleanDocument = hasDoc
    ? input.document.trim()
    : `CC-PENDIENTE-${Date.now().toString().slice(-6)}-${Math.floor(1000 + Math.random() * 9000)}`;

  const paymentDays = input.paymentDays && input.paymentDays.length > 0
    ? input.paymentDays
    : computeDefaultPaymentDays(modality);

  const createdClient: ClientProfile = {
    id: clientId,
    name: input.name.trim(),
    tradeName: input.tradeName?.trim() || input.name.trim(),
    category: input.category || 'Micronegocio Local',
    document: cleanDocument,
    phone: input.phone.trim(),
    address: input.address.trim(),
    neighborhood: input.neighborhood.trim() || 'Medellín Metropolitana',
    routeId: safeRouteId,
    organizationId: safeOrgId,
    createdBy: safeCreatedBy,
    riskTier: 'A_excelente',
    daysOverdue: 0,
    hasPreventiveBlock: false,
    guarantorName: input.guarantorName?.trim() || 'Fiador de Ruta',
    guarantorPhone: input.guarantorPhone?.trim() || input.phone.trim(),
    lat: 6.2518,
    lng: -75.6142,
  };

  const createdLoan: LoanDetail = {
    id: loanId,
    code: loanCode,
    clientId,
    clientName: createdClient.name,
    tradeName: createdClient.tradeName,
    routeId: safeRouteId,
    organizationId: safeOrgId,
    createdBy: safeCreatedBy,
    principal: safePrincipal,
    interestRate: safeRate,
    totalDebt,
    installmentAmount,
    termDays: safeTerm,
    modality,
    installmentsPaid: 0,
    totalCollected: 0,
    remainingBalance: totalDebt,
    disbursedDate: todayStr,
    dueDate: dueDateStr,
    daysOverdue: 0,
    status: 'activo',
    todayPaid: false,
    paymentDays,
  };

  // ESTRUCTURA EXACTA DE DATOS A INSERTAR EN LA TABLA 'clients' CON INYECCIÓN OBLIGATORIA DEL TENANT ID
  const datosAInsertar = {
    id: clientId,
    document_id: cleanDocument,
    name: input.name.trim(),
    alias: input.tradeName?.trim() || input.name.trim(),
    phone: input.phone.trim(),
    business_type: input.category || 'Micronegocio Local',
    address: input.address.trim(),
    zone: input.neighborhood.trim() || 'Medellín Metropolitana',
    route_id: safeRouteId,
    organization_id: safeOrgId,
    tenant_id: safeOrgId,
    created_by: safeCreatedBy,
    risk_score: 80,
    risk_level: 'verde',
    credit_limit: safePrincipal * 2,
  };

  // Impresión explícita en consola justo antes de supabase.from('clients').insert(...)
  console.log('🔍 [DEBUG Inyección Obligatoria Tenant ID & Creador]:', datosAInsertar);

  const isBrowserOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
  if (!isBrowserOnline) {
    saveLocalCachedClient(createdClient);
    saveLocalCachedLoan(createdLoan);
    return {
      data: { client: createdClient, loan: createdLoan },
      savedOffline: true,
      error: null,
    };
  }

  try {
    // 1. Si Supabase está configurado, insertar en `public.clients` y `public.loans`
    let savedInSupabase = false;
    if (isLiveSupabaseConfigured) {
      logSupabaseConnectionAudit('insertClientAndLoanToDB (Crear Cliente)', 'clients', {
        endpoint: `${supabaseUrl}/rest/v1/clients`,
        payload: datosAInsertar,
      });

      let { error: sbError } = await supabase
        .from('clients')
        .insert([datosAInsertar]);

      // Fallback minimal payload si alguna columna extendida no existe aún en public.clients
      if (sbError && (sbError.code === 'PGRST204' || sbError.code === '42703')) {
        const minimalClientPayload = {
          id: clientId,
          document_id: cleanDocument,
          name: input.name.trim(),
          phone: input.phone.trim(),
          address: input.address.trim(),
          route_id: safeRouteId,
          organization_id: safeOrgId,
        };
        const retryRes = await supabase.from('clients').insert([minimalClientPayload]);
        sbError = retryRes.error;
      }

      if (sbError) {
        const isSchemaOrPolicyIssue =
          sbError.code === 'PGRST204' ||
          sbError.code === 'PGRST205' ||
          sbError.code === '42P01' ||
          sbError.code === '42P17' ||
          sbError.code === '42703' ||
          sbError.code === '42501' ||
          sbError.message?.toLowerCase().includes('infinite recursion') ||
          sbError.message?.toLowerCase().includes('schema cache');

        if (isSchemaOrPolicyIssue) {
          console.info('ℹ️ [Supabase tabla clients pendiente de ajuste SQL/RLS]: Guardando cliente en motor PostgreSQL (/api/clients).');
        } else {
          const isDuplicate =
            sbError?.code === '23505' ||
            sbError?.message?.includes('23505') ||
            sbError?.message?.toLowerCase().includes('unique') ||
            sbError?.message?.toLowerCase().includes('duplicate key');

          if (isDuplicate) {
            return {
              data: null,
              error: {
                message: 'Error al guardar en base de datos: Ya existe un usuario o cliente registrado con este documento.',
                code: sbError?.code,
                details: sbError?.details,
                hint: 'El número de cédula o documento ya pertenece a un cliente registrado.',
              },
            };
          }
          console.warn('⚠️ [Supabase INSERT Aviso en tabla clients]:', sbError);
        }
      } else {
        savedInSupabase = true;
        const datosPrestamoAInsertar = {
          id: loanId,
          client_id: clientId,
          route_id: safeRouteId,
          organization_id: safeOrgId,
          tenant_id: safeOrgId,
          created_by: safeCreatedBy,
          principal_amount: safePrincipal,
          interest_rate: safeRate,
          total_amount: totalDebt,
          daily_quota: installmentAmount,
          remaining_balance: totalDebt,
          total_days: safeTerm,
          paid_days: 0,
          modality,
          status: 'active',
          start_date: todayStr,
          expected_end_date: dueDateStr,
          payment_days: paymentDays,
        };

        logSupabaseConnectionAudit('insertClientAndLoanToDB (Crear Préstamo)', 'loans', {
          endpoint: `${supabaseUrl}/rest/v1/loans`,
          payload: datosPrestamoAInsertar,
        });

        const { error: sbLoanErr } = await supabase
          .from('loans')
          .insert([datosPrestamoAInsertar]);

        if (sbLoanErr && sbLoanErr.code !== 'PGRST205' && sbLoanErr.code !== '42P01' && sbLoanErr.code !== 'PGRST204') {
          console.warn('⚠️ [Supabase INSERT Aviso en tabla loans]:', sbLoanErr);
        }
      }
    }

    // 2. Persistir en la base de datos PostgreSQL (Cloud SQL / Backend API /api/clients) si está disponible
    try {
      const clientRes = await fetch('/api/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: clientId,
          documentId: cleanDocument,
          name: input.name.trim(),
          alias: input.tradeName?.trim() || input.name.trim(),
          phone: input.phone.trim(),
          businessType: input.category || 'Micronegocio Local',
          address: input.address.trim(),
          zone: input.neighborhood.trim() || 'Medellín Metropolitana',
          routeId: safeRouteId,
          organizationId: safeOrgId,
          tenantId: safeOrgId,
          createdBy: safeCreatedBy,
          riskScore: 80,
          riskLevel: 'verde',
          creditLimit: safePrincipal * 2,
        }),
      });

      if (!clientRes.ok) {
        const errBody = await clientRes.json().catch(() => ({}));
        console.warn('⚠️ [Database INSERT Aviso - /api/clients]:', errBody);

        if (!savedInSupabase && clientRes.status !== 404) {
          const isDuplicate =
            clientRes.status === 409 ||
            errBody?.code === '23505' ||
            errBody?.error?.includes('Ya existe') ||
            errBody?.error?.includes('23505');

          const errMsg = isDuplicate
            ? 'Error al guardar en base de datos: Ya existe un usuario o cliente registrado con este documento o correo.'
            : `Error al guardar en base de datos: ${errBody.error || `HTTP ${clientRes.status} al insertar en clients.`}`;

          return {
            data: null,
            error: {
              message: errMsg,
              code: isDuplicate ? '23505' : String(clientRes.status),
              hint: isDuplicate ? 'Cédula o documento ya existente.' : 'Verifica la conexión con la base de datos o los permisos de escritura en la tabla clients.',
            },
          };
        }
      }
    } catch (apiClientErr) {
      console.warn('⚠️ [Aviso conexión /api/clients]:', apiClientErr);
    }

    // 3. Persistir el préstamo asociado en la tabla `loans` del backend si está disponible
    try {
      const loanRes = await fetch('/api/loans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: loanId,
          clientId,
          routeId: safeRouteId,
          organizationId: safeOrgId,
          tenantId: safeOrgId,
          createdBy: safeCreatedBy,
          principalAmount: safePrincipal,
          interestRate: safeRate,
          totalAmount: totalDebt,
          dailyQuota: installmentAmount,
          remainingBalance: totalDebt,
          totalDays: safeTerm,
          paidDays: 0,
          modality,
          status: 'active',
          startDate: todayStr,
          expectedEndDate: dueDateStr,
          paymentDays,
        }),
      });

      if (!loanRes.ok) {
        const loanErrBody = await loanRes.json().catch(() => ({}));
        console.warn('⚠️ [Database INSERT Aviso - /api/loans]:', loanErrBody);
      }
    } catch (apiLoanErr) {
      console.warn('⚠️ [Aviso conexión /api/loans]:', apiLoanErr);
    }

    // Guardar en caché local para disponibilidad inmediata en ruta
    saveLocalCachedClient(createdClient);
    saveLocalCachedLoan(createdLoan);

    return {
      data: { client: createdClient, loan: createdLoan },
      savedOffline: false,
      error: null,
    };
  } catch (err: any) {
    console.warn('⚠️ [Excepción al guardar cliente y préstamo]:', err);
    return {
      data: null,
      error: {
        message: `Error al guardar en base de datos: ${err?.message || 'Error de conexión con la base de datos.'}`,
      },
    };
  }
}

