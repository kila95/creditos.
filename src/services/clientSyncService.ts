import { supabase, isLiveSupabaseConfigured } from './supabaseAuth';
import { ClientProfile, LoanDetail } from '../data/mockData';

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
}

export interface DatabaseOperationResult<T> {
  data: T | null;
  error: {
    message: string;
    code?: string;
    details?: string;
    hint?: string;
    isRlsError?: boolean;
  } | null;
}

/**
 * 1. CONSULTA DE CLIENTES (SELECT '*') DESDE SUPABASE / CLOUD SQL
 * Se ejecuta dentro de useEffect al abrir el panel o cambiar de ruta.
 */
export async function fetchClientsAndLoansFromDB(
  routeIdFilter?: string
): Promise<DatabaseOperationResult<{ clients: ClientProfile[]; loans: LoanDetail[] }>> {
  try {
    let rawClients: any[] = [];
    let rawLoans: any[] = [];

    // A) Si el proyecto tiene variables VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY activas:
    if (isLiveSupabaseConfigured) {
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
        return {
          data: null,
          error: {
            message: sbError.message,
            code: sbError.code,
            details: sbError.details,
            hint:
              sbError.hint ||
              'Verifica la política RLS SELECT en la tabla public.clients para el rol autenticado.',
            isRlsError: sbError.code === '42501' || sbError.message.toLowerCase().includes('row-level security'),
          },
        };
      }

      if (Array.isArray(sbClients)) {
        rawClients = sbClients;
      }
    }

    // B) Consulta simultánea al backend Cloud SQL (/api/clients y /api/loans)
    const [cRes, lRes] = await Promise.all([
      fetch('/api/clients'),
      fetch('/api/loans'),
    ]);

    if (cRes.ok) {
      const apiClients = await cRes.json();
      if (Array.isArray(apiClients)) {
        // Combinar sin duplicados priorizando los registros reales de base de datos
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
        rawLoans = apiLoans;
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

    // Crear mapa rápido por clientId para vincular nombre y negocio reales a cada préstamo
    const clientById = new Map<string, ClientProfile>();
    mappedClients.forEach((cl) => clientById.set(cl.id, cl));

    // Mapear préstamos vinculando los datos reales del cliente
    const mappedLoans: LoanDetail[] = rawLoans.map((l: any) => {
      const cId = String(l.clientId || l.client_id);
      const matchedClient = clientById.get(cId);
      const principalAmount = Number(l.principalAmount || l.principal_amount || 500000);
      const totalAmount = Number(l.totalAmount || l.total_amount || principalAmount * 1.2);
      const remBalance = Number(l.remainingBalance ?? l.remaining_balance ?? totalAmount);

      return {
        id: String(l.id),
        code: `PREST-${String(l.id).slice(-6).toUpperCase()}`,
        clientId: cId,
        clientName: matchedClient ? matchedClient.name : l.client_name || 'Deudor Registrado',
        tradeName: matchedClient ? matchedClient.tradeName : l.trade_name || 'Micronegocio',
        routeId: l.routeId || l.route_id || matchedClient?.routeId || 'route-1',
        principal: principalAmount,
        interestRate: Number(l.interestRate || l.interest_rate || 20),
        totalDebt: totalAmount,
        installmentAmount: Number(l.dailyQuota || l.daily_quota || Math.round(totalAmount / 24)),
        termDays: Number(l.totalDays || l.total_days || 24),
        installmentsPaid: Number(l.paidDays || l.paid_days || 0),
        totalCollected: Math.max(0, totalAmount - remBalance),
        remainingBalance: remBalance,
        disbursedDate: l.startDate || l.start_date || new Date().toISOString().split('T')[0],
        dueDate: l.expectedEndDate || l.expected_end_date || '',
        daysOverdue: 0,
        status: l.status === 'completed' ? 'liquidado' : 'activo',
        todayPaid: false,
      };
    });

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
      error: null,
    };
  } catch (err: any) {
    console.error('[Error crítico consultando clientes en Base de Datos]:', err);
    return {
      data: null,
      error: {
        message: err?.message || 'No se pudo conectar con la base de datos para cargar los clientes.',
      },
    };
  }
}

/**
 * 2. INSERCIÓN DE CLIENTE CON CAPTURA ESTRICTA DE ERRORES DE SUPABASE (RLS / CONSTRAINTS)
 */
export async function insertClientAndLoanToDB(
  input: CreateClientRecordInput
): Promise<DatabaseOperationResult<{ client: ClientProfile; loan: LoanDetail }>> {
  const timestampSuffix = Date.now().toString().slice(-6);
  const clientId = input.id || `cli-${timestampSuffix}`;
  const loanId = `loan-${timestampSuffix}`;
  const loanCode = `PREST-${input.routeId.slice(-2).toUpperCase()}-${timestampSuffix.slice(-4)}`;
  const todayStr = new Date().toISOString().split('T')[0];

  const dueDateObj = new Date();
  dueDateObj.setDate(dueDateObj.getDate() + input.termDays);
  const dueDateStr = dueDateObj.toISOString().split('T')[0];

  const totalDebt = Math.round(input.principal * (1 + input.interestRate / 100));
  const dailyInstallment = Math.round(totalDebt / input.termDays);
  const cleanDocument =
    input.document.trim() || `CC-${Math.floor(1000000000 + Math.random() * 900000000)}`;

  try {
    // 1. Si Supabase directo está configurado, insertar en `public.clients` y verificar `error`
    if (isLiveSupabaseConfigured) {
      const { data: sbInserted, error: sbError } = await supabase
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
            route_id: input.routeId,
            risk_score: 80,
            risk_level: 'verde',
            credit_limit: input.principal * 2,
          },
        ])
        .select()
        .single();

      if (sbError) {
        // LOG EXPLÍCITO EN CONSOLA PARA DIAGNÓSTICO DE RLS O RECHAZO DE ESQUEMA
        console.error('❌ [Supabase INSERT Error en tabla clients]:', {
          message: sbError.message,
          code: sbError.code,
          details: sbError.details,
          hint: sbError.hint,
        });

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

      console.log('✅ [Supabase INSERT Exitoso en tabla clients]:', sbInserted);
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
        routeId: input.routeId,
        riskScore: 80,
        riskLevel: 'verde',
        creditLimit: input.principal * 2,
      }),
    });

    if (!clientRes.ok) {
      const errBody = await clientRes.json().catch(() => ({}));
      const errMsg = errBody.error || `HTTP ${clientRes.status}: Rechazo al insertar en la tabla clients.`;
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
        routeId: input.routeId,
        principalAmount: input.principal,
        interestRate: input.interestRate,
        totalAmount: totalDebt,
        dailyQuota: dailyInstallment,
        remainingBalance: totalDebt,
        totalDays: input.termDays,
        paidDays: 0,
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
          message: loanErrBody.error || 'El cliente se creó, pero hubo un error al crear su préstamo inicial.',
          code: String(loanRes.status),
        },
      };
    }

    const createdClient: ClientProfile = {
      id: clientId,
      name: input.name.trim(),
      tradeName: input.tradeName?.trim() || input.name.trim(),
      category: input.category || 'Micronegocio Local',
      document: cleanDocument,
      phone: input.phone.trim(),
      address: input.address.trim(),
      neighborhood: input.neighborhood.trim(),
      routeId: input.routeId,
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
      routeId: input.routeId,
      principal: input.principal,
      interestRate: input.interestRate,
      totalDebt,
      installmentAmount: dailyInstallment,
      termDays: input.termDays,
      installmentsPaid: 0,
      totalCollected: 0,
      remainingBalance: totalDebt,
      disbursedDate: todayStr,
      dueDate: dueDateStr,
      daysOverdue: 0,
      status: 'activo',
      todayPaid: false,
    };

    return {
      data: { client: createdClient, loan: createdLoan },
      error: null,
    };
  } catch (err: any) {
    console.error('❌ [Excepción crítica al insertar cliente en Base de Datos]:', err);
    return {
      data: null,
      error: {
        message: err?.message || 'Error inesperado de red o permisos RLS al guardar el cliente.',
      },
    };
  }
}
