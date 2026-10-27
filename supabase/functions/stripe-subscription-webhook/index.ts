// supabase/functions/stripe-subscription-webhook/index.ts
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import Stripe from 'https://esm.sh/stripe@14.14.0?target=deno';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: '2023-10-16',
  httpClient: Stripe.createFetchHttpClient(),
});

const STRIPE_WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

serve(async (req: Request) => {
  // 1. Aceptar solo métodos POST para Webhooks
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Método no permitido' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const signature = req.headers.get('stripe-signature');
  if (!signature && !req.headers.get('x-signature')) {
    return new Response(JSON.stringify({ error: 'Firma de webhook ausente' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const rawBody = await req.text();
  let event: Stripe.Event;

  // 2. VERIFICACIÓN CRIPTOGRÁFICA INQUEBRANTABLE (Anti-Spoofing)
  try {
    event = await stripe.webhooks.constructEventAsync(
      rawBody,
      signature!,
      STRIPE_WEBHOOK_SECRET
    );
  } catch (err: any) {
    console.error('❌ [Violación de Seguridad] Firma de Webhook Inválida:', err.message);
    return new Response(JSON.stringify({ error: 'Firma criptográfica inválida' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // 3. Cliente Supabase con Service Role (Bypass RLS para actualizar estado contable)
  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    switch (event.type) {
      // EVENTO A: Pago recurrente confirmado exitosamente
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId = invoice.subscription as string;
        
        // Obtener la suscripción desde Stripe para extraer metadata del tenant
        const stripeSubscription = await stripe.subscriptions.retrieve(subscriptionId);
        const tenantId = stripeSubscription.metadata?.tenant_id || invoice.metadata?.tenant_id;

        if (!tenantId) {
          console.error('⚠️ Metadata tenant_id ausente en la suscripción de Stripe:', subscriptionId);
          break;
        }

        const periodEnd = new Date(stripeSubscription.current_period_end * 1000).toISOString();
        const periodStart = new Date(stripeSubscription.current_period_start * 1000).toISOString();
        const amountPaidCOP = (invoice.amount_paid || 180000);

        // Desbloquear al Administrador en la base de datos
        const { error: updateErr } = await supabaseAdmin
          .from('tenant_subscriptions')
          .upsert({
            tenant_id: tenantId,
            admin_id: stripeSubscription.metadata?.admin_id || 'usr-admin',
            admin_email: invoice.customer_email || 'admin@rutacapital.co',
            status: 'active',
            current_period_start: periodStart,
            current_period_end: periodEnd,
            payment_gateway_id: subscriptionId,
            payment_gateway_provider: 'stripe',
            last_payment_date: new Date().toISOString(),
            last_payment_amount_cop: amountPaidCOP,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'tenant_id' });

        if (updateErr) {
          console.error('❌ Error actualizando suscripción en Supabase:', updateErr);
          throw updateErr;
        }

        // Bitácora de Auditoría Forense
        await supabaseAdmin.from('audit_logs').insert({
          id: `aud-sub-${Date.now()}`,
          action: 'PAGO_SUSCRIPCION_SAAS_CONFIRMADO',
          actor_id: 'stripe-webhook',
          actor_name: 'Stripe Gateway (Server-to-Server)',
          actor_role: 'system',
          target_id: tenantId,
          timestamp: new Date().toISOString(),
          old_state: { status: 'past_due' },
          new_state: { status: 'active', current_period_end: periodEnd, invoice_id: invoice.id },
          hash: event.id,
          verified_integrity: true,
        });

        console.log(`✅ [Suscripción Activada]: Tenant ${tenantId} activo hasta ${periodEnd}`);
        break;
      }

      // EVENTO B: Pago fallido o tarjeta rechazada en el cobro recurrente
      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId = invoice.subscription as string;
        const stripeSubscription = await stripe.subscriptions.retrieve(subscriptionId);
        const tenantId = stripeSubscription.metadata?.tenant_id;

        if (tenantId) {
          // Bloquear inmediatamente al Administrador
          await supabaseAdmin
            .from('tenant_subscriptions')
            .update({
              status: 'past_due',
              updated_at: new Date().toISOString(),
            })
            .eq('tenant_id', tenantId);

          console.warn(`⚠️ [Suscripción Bloqueada por Pago Fallido]: Tenant ${tenantId}`);
        }
        break;
      }

      // EVENTO C: Suscripción cancelada definitivamente
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const tenantId = subscription.metadata?.tenant_id;

        if (tenantId) {
          await supabaseAdmin
            .from('tenant_subscriptions')
            .update({
              status: 'canceled',
              updated_at: new Date().toISOString(),
            })
            .eq('tenant_id', tenantId);

          console.warn(`🛑 [Suscripción Cancelada]: Tenant ${tenantId}`);
        }
        break;
      }

      default:
        console.log(`Evento de webhook no manejado: ${event.type}`);
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('❌ Error procesando webhook:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
