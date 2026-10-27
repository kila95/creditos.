// supabase/functions/wompi-subscription-webhook/index.ts
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import { crypto } from 'https://deno.land/std@0.177.0/crypto/mod.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
// Llave secreta de eventos configurada en el Dashboard de Wompi
const WOMPI_EVENTS_SECRET = Deno.env.get('WOMPI_EVENTS_SECRET') ?? 'test_events_secret_9988AABBCCDDEEFF';

interface WompiWebhookPayload {
  event: string;
  data: {
    transaction: {
      id: string;
      status: 'APPROVED' | 'DECLINED' | 'VOIDED' | 'ERROR' | 'PENDING';
      reference: string;
      amount_in_cents: number;
      currency: string;
      customer_email?: string;
      payment_method_type?: string;
      created_at: string;
      finalized_at?: string;
    };
  };
  environment: string;
  signature: {
    properties: string[];
    checksum: string;
  };
  timestamp: number;
  sent_at: string;
}

/**
 * Resuelve propiedades anidadas tipo 'transaction.status' sobre el objeto data
 */
function resolveNestedProperty(obj: any, path: string): string {
  const parts = path.split('.');
  let current = obj;
  for (const part of parts) {
    if (current === undefined || current === null) return '';
    current = current[part];
  }
  return String(current);
}

/**
 * Valida la firma del evento de Wompi usando SHA-256 y la Llave de Eventos
 * Regla Wompi: Concatenar valores de signature.properties + timestamp + eventsSecret
 */
async function verifyWompiChecksum(
  data: any,
  properties: string[],
  timestamp: number,
  eventsSecret: string,
  providedChecksum: string
): Promise<boolean> {
  let concatenatedValues = '';
  for (const prop of properties) {
    concatenatedValues += resolveNestedProperty(data, prop);
  }

  const rawString = `${concatenatedValues}${timestamp}${eventsSecret}`;
  const encoder = new TextEncoder();
  const rawBytes = encoder.encode(rawString);
  const hashBuffer = await crypto.subtle.digest('SHA-256', rawBytes);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const calculatedChecksum = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');

  return calculatedChecksum.toLowerCase() === providedChecksum.toLowerCase();
}

serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Método no permitido. Solo POST.' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const payload: WompiWebhookPayload = await req.json();

    // 1. Filtrar únicamente eventos de actualización de transacción
    if (payload.event !== 'transaction.updated') {
      return new Response(JSON.stringify({ message: `Evento ignorado: ${payload.event}` }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const { transaction } = payload.data;
    const { signature, timestamp } = payload;

    if (!signature || !signature.properties || !signature.checksum) {
      return new Response(JSON.stringify({ error: 'Firma de evento Wompi ausente o malformada' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 2. VALIDACIÓN CRIPTOGRÁFICA SERVER-TO-SERVER (Anti-Spoofing con Llave de Eventos)
    const isChecksumValid = await verifyWompiChecksum(
      payload.data,
      signature.properties,
      timestamp,
      WOMPI_EVENTS_SECRET,
      signature.checksum
    );

    if (!isChecksumValid) {
      console.error('❌ [Alerta de Fraude Wompi] Checksum no coincide con la Llave de Eventos');
      return new Response(JSON.stringify({ error: 'Firma criptográfica inválida. Petición rechazada.' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 3. Cliente Supabase Administrativo con Service Role
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // 4. Extracción del tenant_id a partir de la referencia (ej: 'SUB-org-medellin-01-83920192')
    const referenceParts = transaction.reference.split('-');
    let tenantId = 'org-medellin-01';

    if (transaction.reference.startsWith('SUB-') && referenceParts.length >= 3) {
      // Reconstruir tenant_id si contiene guiones (ej. 'org-medellin-01')
      tenantId = referenceParts.slice(1, -1).join('-');
    }

    console.log(`[Wompi Webhook] Transacción ${transaction.id} para Tenant ${tenantId} con estado: ${transaction.status}`);

    // 5. EVALUACIÓN ESTRICTA: Solo si el estado es 'APPROVED' se activa la cuenta
    if (transaction.status === 'APPROVED') {
      const now = new Date();
      // Otorgar 30 días de cobertura a partir de la confirmación del pago
      const currentPeriodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
      const amountPaidCop = transaction.amount_in_cents / 100;

      const { data: updatedSub, error: updateErr } = await supabaseAdmin
        .from('tenant_subscriptions')
        .upsert(
          {
            tenant_id: tenantId,
            admin_id: 'usr-admin-wompi',
            admin_email: transaction.customer_email || 'admin@rutacapital.co',
            status: 'active',
            current_period_start: now.toISOString(),
            current_period_end: currentPeriodEnd,
            payment_gateway_id: transaction.id,
            payment_gateway_provider: 'wompi',
            last_payment_date: now.toISOString(),
            last_payment_amount_cop: amountPaidCop,
            updated_at: now.toISOString(),
          },
          { onConflict: 'tenant_id' }
        )
        .select()
        .single();

      if (updateErr) {
        console.error('❌ Error actualizando suscripción en Supabase:', updateErr);
        throw updateErr;
      }

      // Registro de Auditoría Forense Criptográfica Inmutable
      await supabaseAdmin.from('audit_logs').insert({
        id: `aud-wompi-${Date.now()}`,
        action: 'PAGO_SUSCRIPCION_WOMPI_APROBADO',
        actor_id: 'wompi-webhook',
        actor_name: 'Wompi Bancolombia Gateway',
        actor_role: 'system',
        target_id: tenantId,
        timestamp: now.toISOString(),
        old_state: { status: 'past_due' },
        new_state: {
          status: 'active',
          current_period_end: currentPeriodEnd,
          transaction_id: transaction.id,
          amount_cop: amountPaidCop,
          payment_method: transaction.payment_method_type,
        },
        hash: signature.checksum,
        verified_integrity: true,
      });

      console.log(`✅ [Suscripción Wompi Activada con Éxito]: Tenant ${tenantId} activo hasta ${currentPeriodEnd}`);

      return new Response(
        JSON.stringify({
          success: true,
          message: 'Suscripción activada con éxito.',
          tenant_id: tenantId,
          transaction_id: transaction.id,
          current_period_end: currentPeriodEnd,
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    } else {
      // Transacción no aprobada (DECLINED / ERROR / VOIDED)
      console.warn(`⚠️ [Wompi Pago Rechazado]: Transacción ${transaction.id} estado ${transaction.status}`);
      return new Response(
        JSON.stringify({
          success: false,
          status: transaction.status,
          message: 'Transacción no aprobada. La suscripción permanece inalterada.',
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }
  } catch (error: any) {
    console.error('❌ Error interno en webhook de Wompi:', error);
    return new Response(JSON.stringify({ error: error.message || 'Error interno del servidor' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
