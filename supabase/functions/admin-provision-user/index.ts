import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Construye una contraseña temporal segura (mínimo 6 caracteres).
 * Si no se envía contraseña explícita, la vincula al documento de identidad (Cédula).
 */
function resolveTemporaryPassword(rawPassword?: string, documentId?: string): string {
  const cleanPass = String(rawPassword || '').trim();
  if (cleanPass.length >= 6) {
    return cleanPass;
  }
  const cleanDoc = String(documentId || '').replace(/[^0-9a-zA-Z]/g, '');
  if (cleanDoc.length >= 6) {
    return cleanDoc;
  }
  if (cleanDoc.length > 0) {
    return `${cleanDoc}2025*`;
  }
  return 'Ruta2025*';
}

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

    // Cliente privilegiado (service_role) que NO altera ni cierra la sesión del SuperAdmin/Admin actual
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

    if (!email || !fullName || !role) {
      return new Response(
        JSON.stringify({ error: 'Campos obligatorios faltantes (email, fullName, role).' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const effectivePassword = resolveTemporaryPassword(password, documentId);
    const effectiveTenantId = tenantId || organizationId || createdBy;

    // =========================================================================
    // REGLA 1 Y 2: Creación en `auth.users` con `supabase.auth.admin.createUser`
    // y Autoconfirmación (`email_confirm: true`) + Contraseña Temporal
    // =========================================================================
    let { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: normalizedEmail,
      password: effectivePassword,
      email_confirm: true, // Habilita login inmediato sin verificar correo
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

    // Si el correo ya existía en auth.users sin confirmar, lo actualizamos y autoconfirmamos
    if (
      authError &&
      (authError.message?.toLowerCase().includes('already') ||
        authError.message?.toLowerCase().includes('exists'))
    ) {
      const { data: usersList } = await supabaseAdmin.auth.admin.listUsers();
      const existingAuthUser = usersList?.users?.find(
        (u) => u.email?.toLowerCase() === normalizedEmail
      );
      if (existingAuthUser) {
        const updatedAuth = await supabaseAdmin.auth.admin.updateUserById(existingAuthUser.id, {
          password: effectivePassword,
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
        authData = updatedAuth.data;
        authError = updatedAuth.error;
      }
    }

    // BLOQUEO ESTRICTO: Si el Paso 1 falla o no devuelve `user.id`, el Paso 3 NO SE EJECUTA
    if (authError || !authData?.user?.id) {
      return new Response(
        JSON.stringify({
          error: authError?.message || 'Error al crear usuario en auth.users (Supabase Admin API).',
          code: (authError as any)?.code || 'AUTH_ADMIN_CREATE_FAILED',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // =========================================================================
    // REGLA 3: Sincronización estricta de UUID (`user.id` -> `public.profiles`)
    // =========================================================================
    const newUserId = authData.user.id;
    const finalTenantId = role === 'admin' ? (organizationId || newUserId) : effectiveTenantId;
    const safeProfileRole =
      role === 'collector' ? 'cobrador' : role === 'super_admin' ? 'admin' : role;

    const fullProfilePayload = {
      id: newUserId, // UUID exacto retornado por auth.users
      email: normalizedEmail,
      full_name: String(fullName).trim(),
      role: safeProfileRole,
      organization_id: finalTenantId,
      tenant_id: finalTenantId,
      organization_name: organizationName || 'Fondo EnRuta',
      created_by: createdBy || newUserId,
      assigned_route_id: assignedRouteId || null,
      route_zone: routeZone || null,
      phone: phone || null,
      document_id: documentId || null,
      is_active: true,
    };

    let { data: profileRow, error: profileError } = await supabaseAdmin
      .from('profiles')
      .upsert([fullProfilePayload], { onConflict: 'id' })
      .select()
      .single();

    // Fallback si la tabla profiles aún tiene esquema mínimo (id, full_name, role, created_at)
    if (profileError) {
      const minimalRes = await supabaseAdmin
        .from('profiles')
        .upsert(
          [
            {
              id: newUserId,
              full_name: String(fullName).trim(),
              role: safeProfileRole,
            },
          ],
          { onConflict: 'id' }
        )
        .select()
        .single();
      profileRow = minimalRes.data;
      profileError = minimalRes.error;
    }

    if (profileError) {
      return new Response(
        JSON.stringify({
          error: `Error al insertar en public.profiles: ${profileError.message}`,
          code: profileError.code,
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Si es cobrador y tiene ruta asignada, asegurar/actualizar la ruta en public.routes
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
        profile: profileRow || fullProfilePayload,
        effectivePassword,
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
