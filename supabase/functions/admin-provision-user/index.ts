import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      return new Response(
        JSON.stringify({
          error: 'Configuración incompleta: Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en la Edge Function.',
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Cliente privilegiado (service_role) que NO altera la sesión del cliente invocador
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const body = await req.json();
    const {
      email,
      password,
      fullName,
      role,
      organizationId,
      tenantId,
      organizationName,
      createdBy,
      assignedRouteId,
      routeZone,
      phone,
      documentId,
    } = body;

    if (!email || !password || !fullName || !role) {
      return new Response(
        JSON.stringify({ error: 'Campos obligatorios faltantes (email, password, fullName, role).' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const effectiveTenantId = tenantId || organizationId || createdBy;

    // 1. Crear el usuario en auth.users con confirmación inmediata (sin alterar la sesión del Admin/SuperAdmin)
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: normalizedEmail,
      password: String(password),
      email_confirm: true,
      user_metadata: {
        full_name: String(fullName).trim(),
        role,
        organization_id: effectiveTenantId,
        tenant_id: effectiveTenantId,
        organization_name: organizationName || 'Fondo EnRuta',
        created_by: createdBy || null,
        assigned_route_id: assignedRouteId || null,
        route_zone: routeZone || null,
        phone: phone || null,
        document_id: documentId || null,
      },
    });

    if (authError || !authData.user) {
      return new Response(
        JSON.stringify({
          error: authError?.message || 'Error al crear usuario en Supabase Auth Admin.',
          code: (authError as any)?.code || 'AUTH_ADMIN_ERROR',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const newUserId = authData.user.id;
    // Si es un nuevo Admin, su propio UID puede actuar como su tenant_id o usar el organizationId generado
    const finalTenantId = role === 'admin' ? (organizationId || newUserId) : effectiveTenantId;

    // 2. Insertar el perfil en public.profiles garantizando persistencia inmediata
    const { data: profileRow, error: profileError } = await supabaseAdmin
      .from('profiles')
      .upsert(
        [
          {
            id: newUserId,
            email: normalizedEmail,
            full_name: String(fullName).trim(),
            role,
            organization_id: finalTenantId,
            tenant_id: finalTenantId,
            organization_name: organizationName || 'Fondo EnRuta',
            created_by: createdBy || newUserId,
            assigned_route_id: assignedRouteId || null,
            route_zone: routeZone || null,
            phone: phone || null,
            document_id: documentId || null,
            is_active: true,
          },
        ],
        { onConflict: 'id' }
      )
      .select()
      .single();

    if (profileError) {
      return new Response(
        JSON.stringify({
          error: `Error al insertar en public.profiles: ${profileError.message}`,
          code: profileError.code,
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 3. Si es cobrador y tiene ruta asignada, asegurar/actualizar la ruta en public.routes
    if (role === 'collector' && assignedRouteId) {
      await supabaseAdmin
        .from('routes')
        .upsert(
          [
            {
              id: assignedRouteId,
              name: `Ruta ${assignedRouteId.replace(/^route-?/i, '').toUpperCase()}`,
              zone: routeZone || 'Medellín Metropolitana',
              collector_id: newUserId,
              collector_name: String(fullName).trim(),
              organization_id: finalTenantId,
              tenant_id: finalTenantId,
              created_by: createdBy || null,
              status: 'active',
            },
          ],
          { onConflict: 'id' }
        );
    }

    return new Response(
      JSON.stringify({
        status: 201,
        user: authData.user,
        profile: profileRow,
      }),
      { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err?.message || 'Error interno en admin-provision-user' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
