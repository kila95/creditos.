// Supabase Edge Function: wompi-webhook
// Recibe eventos `transaction.updated` desde Wompi, verifica la firma SHA-256
// con `WOMPI_EVENTS_SECRET` y activa la suscripción del tenant en `tenant_subscriptions`.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-event-checksum',
};

interface WompiWebhookPayload {
  event: string;
  data: {
    transaction: {
      id: string;
      amount_in_cents: number;
      reference: string;
      customer_email: string;
      currency: string;
      payment_method_type: string;
      status: 'APPROVED' | 'DECLINED' | 'VOIDED' | 'ERROR' | 'PENDING';
      status_message?: string;
    };
  };
  environment: 'prod' | 'test';
  signature: {
    properties: string[];
    checksum: string;
  };
  timestamp: number;
  sent_at: string;
}

/**
 * Resuelve dinámicamente una propiedad anidada dentro de `data`
 * según la lista `signature.properties` enviada por Wompi
 * (ej. "transaction.id", "transaction.status", "transaction.amount_in_cents").
 */
function getNestedProperty(obj: Record<string, any>, path: string): string {
  const value = path.split('.').reduce((acc, part) => (acc && acc[part] !== undefined ? acc[part] : ''), obj);
  return String(value ?? '');
}

/**
 * Calcula el hash SHA-256 en formato hexadecimal usando Web Crypto API nativa de Deno.
 */
async function computeSha256Hex(rawString: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(rawString);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Comparación en tiempo constante para mitigar ataques de timing sobre el checksum.
 */
function timingSafeEqualHex(a: string, b: string): boolean {
  const cleanA = a.trim().toLowerCase();
  const cleanB = b.trim().toLowerCase();
  if (cleanA.length !== cleanB.length) return false;
  let mismatch = 0;
  for (let i = 0; i < cleanA.length; i++) {
    mismatch |= cleanA.charCodeAt(i) ^ cleanB.charCodeAt(i);
  }
  return mismatch === 0;
}

/**
 * Extrae el `tenant_id` desde la referencia de pago.
 * Formato esperado: `SUB_<tenant_id>_<timestamp>`
 */
function extractTenantIdFromReference(reference: string): string | null {
  if (!reference) return null;
  const parts = reference.split('_');
  // Si cumple el formato SUB_<uuid>_<timestamp>
  if (parts.length >= 3 && parts[0] === 'SUB') {
    return parts[1];
  }
  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const eventsSecret = Deno.env.get('WOMPI_EVENTS_SECRET');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!eventsSecret || !supabaseUrl || !supabaseServiceRoleKey) {
      console.error('[wompi-webhook] Faltan variables de entorno requeridas.');
      return new Response(
        JSON.stringify({ error: 'Server misconfiguration: missing secrets' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const payload: WompiWebhookPayload = await req.json();

    // 1. Validación estructural mínima del evento
    if (
      !payload ||
      !payload.signature ||
      !Array.isArray(payload.signature.properties) ||
      !payload.signature.checksum ||
      !payload.data?.transaction
    ) {
      return new Response(JSON.stringify({ error: 'Invalid webhook payload structure' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 2. Validación Criptográfica de Integridad del Evento (Wompi Checksum)
    // Concatenación oficial de Wompi:
    // valores de `signature.properties` (en orden) + `timestamp` + `events_secret`
    const concatenatedProperties = payload.signature.properties
      .map((propPath) => getNestedProperty(payload.data, propPath))
      .join('');

    const stringToHash = `${concatenatedProperties}${payload.timestamp}${eventsSecret}`;
    const calculatedChecksum = await computeSha256Hex(stringToHash);

    const headerChecksum = req.headers.get('x-event-checksum') || payload.signature.checksum;

    const isSignatureValid =
      timingSafeEqualHex(calculatedChecksum, payload.signature.checksum) &&
      timingSafeEqualHex(calculatedChecksum, headerChecksum);

    if (!isSignatureValid) {
      console.warn('[wompi-webhook] Firma criptográfica inválida rechazada.', {
        reference: payload.data.transaction.reference,
      });
      return new Response(JSON.stringify({ error: 'Invalid cryptographic signature' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 3. Procesar únicamente el evento `transaction.updated`
    if (payload.event !== 'transaction.updated') {
      return new Response(
        JSON.stringify({ received: true, ignoredEvent: payload.event }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const transaction = payload.data.transaction;

    // 4. Si la transacción fue APROBADA, activar la suscripción del tenant
    if (transaction.status === 'APPROVED') {
      const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });

      const tenantId = extractTenantIdFromReference(transaction.reference);

      const updatePayload = {
        status: 'active',
        wompi_transaction_id: transaction.id,
        last_payment_reference: transaction.reference,
        last_payment_amount_cents: transaction.amount_in_cents,
        payment_method_type: transaction.payment_method_type,
        updated_at: new Date().toISOString(),
      };

      // Actualiza por `tenant_id` (extraído de SUB_<tenant_id>_<timestamp>) o por `payment_reference`
      let query = supabaseAdmin.from('tenant_subscriptions').update(updatePayload);

      if (tenantId) {
        query = query.eq('tenant_id', tenantId);
      } else {
        query = query.eq('last_payment_reference', transaction.reference);
      }

      const { data: updatedRows, error: dbError } = await query.select();

      if (dbError) {
        console.error('[wompi-webhook] Error actualizando tenant_subscriptions:', dbError);
        return new Response(
          JSON.stringify({ error: 'Database update failed', details: dbError.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          status: 'active',
          tenantId,
          transactionId: transaction.id,
          updatedCount: updatedRows?.length ?? 0,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Transacciones en otro estado (DECLINED, VOIDED, ERROR) se acusan como recibidas (HTTP 200)
    return new Response(
      JSON.stringify({
        success: true,
        transactionId: transaction.id,
        transactionStatus: transaction.status,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    console.error('[wompi-webhook] Excepción no controlada:', err);
    return new Response(
      JSON.stringify({ error: 'Internal Server Error', message: err?.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
