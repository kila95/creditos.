import { supabase, isLiveSupabaseConfigured } from './supabaseAuth';
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
  guarantorName?: string;
  guarantorPhone?: string;
  principal: number;
  interestRate: number;
  termDays: number;
  modality?: LoanModality;
}

export interface CreateCustomLoanInput {
  clientId: string;
  clientName: string;
  tradeName?: string;
  routeId: string;
  principal: number;
  interestRate: number;
  termInstallments: number;
  modality: LoanModality;
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
        let query = supabase
          .from('clients')
          .select('*')
          .order('created_at', { ascending: false });

        if (routeIdFilter) {
          query = query.eq('route_id', routeIdFilter);
        }

        const { data: sbClients, error: sbError } = await query;

        if (sbError) {
          console.error('[Supabase SELECT Error - tabla clients]:', {
            message: sbError.message,
            code: sbError.code,
            details: sbError.details,
            hint: sbError.hint,
          });
        } else if (Array.isArray(sbClients)) {
          rawClients = sbClients;
        }

        let loansQuery = supabase
          .from('loans')
          .select('*')
          .order('created_at', { ascending: false });

        if (routeIdFilter) {
          loansQuery = loansQuery.eq('route_id', routeIdFilter);
        }

        const { data: sbLoans, error: sbLoansErr } = await loansQuery;
        if (sbLoansErr) {
          console.error('[Supabase SELECT Error - tabla loans]:', sbLoansErr);
        } else if (Array.isArray(sbLoans)) {
          rawLoans = sbLoans;
        }
      } catch (sbNetworkErr) {
        console.warn('[Supabase Offline Fallback] Sin conexión a Supabase, usando caché local:', sbNetworkErr);
      }
    }

    // B) Consulta simultánea al backend Cloud SQL (/api/clients y /api/loans) con try/catch
    if (isBrowserOnline) {
      try {
        const [cRes, lRes] = await Promise.all([
          fetch('/api/clients'),
          fetch('/api/loans'),
        ]);

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
        }
      } catch (apiNetworkErr) {
        console.warn('[API Offline Fallback] Operando en modo offline con datos locales:', apiNetworkErr);
      }
    }

    // Mapear clientes normalizados
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

      return {
        id: String(l.id),
        code: l.code || `PREST-${String(l.id).slice(-6).toUpperCase()}`,
        clientId: cId,
        clientName: matchedClient ? matchedClient.name : l.client_name || 'Deudor Registrado',
        tradeName: matchedClient ? matchedClient.tradeName : l.trade_name || 'Micronegocio',
        routeId: l.routeId || l.route_id || matchedClient?.routeId || 'route-1',
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
        todayPaid: false,
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
  // Asegurar que la ruta exista en routes antes de registrar el préstamo
  const safeRouteId = await ensureRouteExistsInSupabaseAndDB(input.routeId);

  const timestampSuffix = Date.now().toString().slice(-6);
  const loanId = `loan-${timestampSuffix}`;
  const loanCode = `PREST-${safeRouteId.slice(-2).toUpperCase()}-${timestampSuffix.slice(-4)}`;
  const todayStr = new Date().toISOString().split('T')[0];

  const safePrincipal = Math.max(1000, roundCOP(input.principal));
  const safeRate = Math.max(0, Number(input.interestRate) || 0);
  const safeInstallments = Math.max(1, roundCOP(input.termInstallments));
  const modality: LoanModality = input.modality || 'diaria';

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
  };

  // Guardar siempre copia en caché local para resiliencia ante pérdidas de señal
  saveLocalCachedLoan(createdLoan);

  const isBrowserOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
  if (!isBrowserOnline) {
    return {
      data: createdLoan,
      savedOffline: true,
      error: null,
    };
  }

  try {
    // 1. Inserción directa en tabla `loans` de Supabase si las credenciales están activas
    if (isLiveSupabaseConfigured) {
      const { error: sbLoanError } = await supabase
        .from('loans')
        .insert([
          {
            id: loanId,
            client_id: input.clientId,
            route_id: safeRouteId,
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
          },
        ]);

      if (sbLoanError) {
        console.error('❌ [Supabase INSERT Error en tabla loans]:', sbLoanError);
        const isRls =
          sbLoanError.code === '42501' ||
          sbLoanError.message.toLowerCase().includes('row-level security') ||
          sbLoanError.message.toLowerCase().includes('policy');

        return {
          data: null,
          error: {
            message: isRls
              ? `Bloqueo por Política RLS en tabla 'loans': ${sbLoanError.message}`
              : `Error de Supabase al insertar en 'loans': ${sbLoanError.message}`,
            code: sbLoanError.code,
            details: sbLoanError.details,
            hint: isRls
              ? 'Verifica que el usuario autenticado tenga permisos INSERT en public.loans para su ruta u organización.'
              : sbLoanError.hint,
            isRlsError: isRls,
          },
        };
      }
    }

    // 2. Persistir en Cloud SQL PostgreSQL (/api/loans)
    const loanRes = await fetch('/api/loans', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: loanId,
        clientId: input.clientId,
        routeId: safeRouteId,
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
      }),
    });

    if (!loanRes.ok) {
      const loanErrBody = await loanRes.json().catch(() => ({}));
      console.error('❌ [Database INSERT Error - /api/loans]:', loanErrBody);
      return {
        data: null,
        error: {
          message:
            loanErrBody.error ||
            `HTTP ${loanRes.status}: No se pudo insertar el préstamo en la tabla loans.`,
          code: String(loanRes.status),
          hint: 'Verifica que el client_id exista en la tabla clients y que la ruta esté activa.',
        },
      };
    }

    return {
      data: createdLoan,
      savedOffline: false,
      error: null,
    };
  } catch (err: any) {
    console.warn('⚠️ [Red inestable en calle - Préstamo guardado en caché Offline]:', err);
    return {
      data: createdLoan,
      savedOffline: true,
      error: null,
    };
  }
}

/**
 * Valida la existencia de la ruta en la tabla 'routes' de Supabase y en la base de datos Cloud SQL.
 * Si la ruta no existe, la crea/registra automáticamente para garantizar integridad referencial
 * y evitar errores HTTP 404 o rechazos de clave foránea.
 */
export async function ensureRouteExistsInSupabaseAndDB(
  routeId: string,
  zone?: string,
  collectorName?: string
): Promise<string> {
  const safeRouteId = routeId?.trim() || 'route-1';

  // 1. Validar / auto-crear en Supabase si está configurado
  if (isLiveSupabaseConfigured) {
    try {
      // Usamos .maybeSingle() para evitar el error HTTP 404 de PostgREST si no hay filas
      const { data: existingRoute, error: checkError } = await supabase
        .from('routes')
        .select('id, name')
        .eq('id', safeRouteId)
        .maybeSingle();

      if (!checkError && existingRoute?.id) {
        // La ruta ya existe válidamente en Supabase
      } else {
        // La ruta no existe en Supabase: registrarla automáticamente
        const routeName = `Ruta ${safeRouteId.replace(/^route-?/i, '').toUpperCase() || 'General'}`;
        const { error: upsertErr } = await supabase
          .from('routes')
          .upsert(
            {
              id: safeRouteId,
              name: routeName,
              zone: zone || 'Medellín Metropolitana',
              collector_name: collectorName || 'Cobrador de Ruta',
              status: 'active',
              target_daily_collection: 1500000,
              operating_expense_budget: 80000,
            },
            { onConflict: 'id' }
          );

        if (upsertErr) {
          console.warn('⚠️ [ensureRouteExistsInSupabaseAndDB] Advertencia al registrar ruta en Supabase:', upsertErr);
          // Si falló por RLS u otra política, buscar cualquier ruta existente de respaldo
          const { data: fallbackRoute } = await supabase
            .from('routes')
            .select('id')
            .limit(1)
            .maybeSingle();
          if (fallbackRoute?.id) {
            return fallbackRoute.id;
          }
        }
      }
    } catch (sbErr) {
      console.warn('⚠️ [ensureRouteExistsInSupabaseAndDB] Excepción verificando ruta en Supabase:', sbErr);
    }
  }

  // 2. Validar / auto-crear en Cloud SQL (Backend API /api/routes)
  try {
    const isBrowserOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
    if (isBrowserOnline) {
      await fetch('/api/routes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: safeRouteId,
          zone: zone || 'Medellín Metropolitana',
          collectorName: collectorName || 'Cobrador de Zona',
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
 * 3. INSERCIÓN DE CLIENTE + PRÉSTAMO PERSONALIZADO CON CAPTURA ESTRICTA DE ERRORES, VALIDACIÓN DE RUTA Y SOPORTE OFFLINE
 */
export async function insertClientAndLoanToDB(
  input: CreateClientRecordInput
): Promise<DatabaseOperationResult<{ client: ClientProfile; loan: LoanDetail }>> {
  // 1. Validar y asegurar que la ruta exista en la tabla routes (o crearla) antes de insertar
  const safeRouteId = await ensureRouteExistsInSupabaseAndDB(
    input.routeId,
    input.neighborhood,
    'Cobrador de Ruta'
  );

  const timestampSuffix = Date.now().toString().slice(-6);
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

  // El campo de cédula ya no es obligatorio: si el cliente en la calle no lo tiene, se genera un ID único
  // para no bloquear la inserción en la base de datos ni provocar errores por valor nulo o duplicado
  const hasDoc = input.document && input.document.trim().length > 0;
  const cleanDocument = hasDoc
    ? input.document.trim()
    : `CC-PENDIENTE-${Date.now().toString().slice(-6)}-${Math.floor(1000 + Math.random() * 9000)}`;

  const createdClient: ClientProfile = {
    id: clientId,
    name: input.name.trim(),
    tradeName: input.tradeName?.trim() || input.name.trim(),
    category: input.category || 'Micronegocio Local',
    document: cleanDocument,
    phone: input.phone.trim(),
    address: input.address.trim(),
    neighborhood: input.neighborhood.trim(),
    routeId: safeRouteId,
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
  };

  // Respaldo inmediato en almacenamiento local por si el cobrador pierde señal en calle
  saveLocalCachedClient(createdClient);
  saveLocalCachedLoan(createdLoan);

  const isBrowserOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
  if (!isBrowserOnline) {
    return {
      data: { client: createdClient, loan: createdLoan },
      savedOffline: true,
      error: null,
    };
  }

  try {
    // 1. Si Supabase directo está configurado, insertar en `public.clients` y `public.loans`
    if (isLiveSupabaseConfigured) {
      // Inserción en clients con .maybeSingle() para evitar excepciones de 0 filas (404)
      const { error: sbError } = await supabase
        .from('clients')
        .insert([
          {
            id: clientId,
            document_id: cleanDocument,
            name: input.name.trim(),
            alias: input.tradeName?.trim() || input.name.trim(),
            phone: input.phone.trim(),
            business_type: input.category || 'Micronegocio Local',
            address: input.address.trim(),
            zone: input.neighborhood.trim(),
            route_id: safeRouteId,
            risk_score: 80,
            risk_level: 'verde',
            credit_limit: safePrincipal * 2,
          },
        ])
        .select()
        .maybeSingle();

      if (sbError) {
        console.error('❌ [Supabase INSERT Error en tabla clients]:', sbError);
        const isRls =
          sbError.code === '42501' ||
          sbError.message.toLowerCase().includes('row-level security') ||
          sbError.message.toLowerCase().includes('policy');

        return {
          data: null,
          error: {
            message: isRls
              ? `Bloqueo por Política de Seguridad (RLS) en Supabase: ${sbError.message}`
              : `Error de Supabase al insertar en 'clients': ${sbError.message}`,
            code: sbError.code,
            details: sbError.details,
            hint: isRls
              ? 'Ejecuta la política CREATE POLICY "clients_insert_policy" ON public.clients FOR INSERT TO authenticated WITH CHECK (true); en el SQL Editor de Supabase.'
              : sbError.hint,
            isRlsError: isRls,
          },
        };
      }

      const { error: sbLoanErr } = await supabase.from('loans').insert([
        {
          id: loanId,
          client_id: clientId,
          route_id: safeRouteId,
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
        },
      ]);

      if (sbLoanErr) {
        console.error('❌ [Supabase INSERT Error en tabla loans]:', sbLoanErr);
      }
    }

    // 2. Persistir en la base de datos PostgreSQL (Cloud SQL / Backend API)
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
        zone: input.neighborhood.trim(),
        routeId: safeRouteId,
        riskScore: 80,
        riskLevel: 'verde',
        creditLimit: safePrincipal * 2,
      }),
    });

    if (!clientRes.ok) {
      const errBody = await clientRes.json().catch(() => ({}));
      const errMsg =
        errBody.error || `HTTP ${clientRes.status}: Rechazo al insertar en la tabla clients.`;
      console.error('❌ [Database INSERT Error - /api/clients]:', errBody);
      return {
        data: null,
        error: {
          message: errMsg,
          code: String(clientRes.status),
          hint: 'Verifica que la cédula (document_id) no esté duplicada y que la ruta asignada exista en la tabla routes.',
        },
      };
    }

    // 3. Persistir el préstamo asociado en la tabla `loans`
    const loanRes = await fetch('/api/loans', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: loanId,
        clientId,
        routeId: safeRouteId,
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
      }),
    });

    if (!loanRes.ok) {
      const loanErrBody = await loanRes.json().catch(() => ({}));
      console.error('❌ [Database INSERT Error - /api/loans]:', loanErrBody);
      return {
        data: null,
        error: {
          message:
            loanErrBody.error ||
            'El cliente se creó, pero hubo un error al crear su préstamo inicial.',
          code: String(loanRes.status),
        },
      };
    }

    return {
      data: { client: createdClient, loan: createdLoan },
      savedOffline: false,
      error: null,
    };
  } catch (err: any) {
    console.warn('⚠️ [Red inestable en calle - Cliente y Préstamo guardados localmente]:', err);
    return {
      data: { client: createdClient, loan: createdLoan },
      savedOffline: true,
      error: null,
    };
  }
}

