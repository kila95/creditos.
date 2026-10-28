// Supabase Edge Function: generate-wompi-signature
// Backend Blindado: Precio estático quemado en código (14000000 centavos = $140.000 COP)
// Calcula en el backend la firma criptográfica SHA-256 requerida por el Widget de Wompi:
// SHA256(referencia + 14000000 + COP + WOMPI_INTEGRITY_SECRET)

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Precio mensual fijo quemado en el servidor: $140.000 COP en centavos
const FIXED_MONTHLY_AMOUNT_IN_CENTS = 14000000;
const FIXED_CURRENCY = 'COP';

interface SignatureRequestBody {
  tenantId?: string;
  reference?: string;
  expirationTime?: string;
}

/**
 * Genera el hash SHA-256 en formato hexadecimal usando Web Crypto API nativa de Deno.
 */
async function computeSha256Hex(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req: Request) => {
  // Manejo de preflight CORS para llamadas desde supabase.functions.invoke()
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
    const integritySecret = Deno.env.get('WOMPI_INTEGRITY_SECRET');

    if (!integritySecret) {
      console.error('[generate-wompi-signature] Falta WOMPI_INTEGRITY_SECRET en las variables de entorno.');
      return new Response(
        JSON.stringify({ error: 'Server configuration error: missing integrity secret' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body: SignatureRequestBody = await req.json();
    const tenantId = body?.tenantId?.trim();
    const rawReference = body?.reference?.trim();
    const expirationTime = body?.expirationTime;

    // Garantizar que la referencia contenga el tenant_id del administrador: `${tenant_id}-${timestamp}`
    const reference =
      rawReference && (!tenantId || rawReference.startsWith(`${tenantId}-`))
        ? rawReference
        : tenantId
          ? `${tenantId}-${Date.now()}`
          : '';

    if (!reference || !reference.includes('-')) {
      return new Response(
        JSON.stringify({
          error: 'Parámetros inválidos: se requiere `tenantId` o una `reference` trazable (`${tenant_id}-${timestamp}`).',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Regla oficial de Wompi con monto estático blindado en servidor (14000000 centavos = $140.000 COP):
    // <Referencia><MontoEnCentavos><Moneda>[<FechaExpiracion>]<SecretoIntegridad>
    const rawStringToSign = expirationTime
      ? `${reference}${FIXED_MONTHLY_AMOUNT_IN_CENTS}${FIXED_CURRENCY}${expirationTime}${integritySecret}`
      : `${reference}${FIXED_MONTHLY_AMOUNT_IN_CENTS}${FIXED_CURRENCY}${integritySecret}`;

    const signature = await computeSha256Hex(rawStringToSign);

    return new Response(
      JSON.stringify({
        signature,
        reference,
        amountInCents: FIXED_MONTHLY_AMOUNT_IN_CENTS,
        currency: FIXED_CURRENCY,
        ...(expirationTime ? { expirationTime } : {}),
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    console.error('[generate-wompi-signature] Error interno:', err);
    return new Response(
      JSON.stringify({ error: 'Internal Server Error', message: err?.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
