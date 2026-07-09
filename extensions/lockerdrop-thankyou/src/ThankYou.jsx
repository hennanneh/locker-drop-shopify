import '@shopify/ui-extensions/preact';
import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';

// Thank You page block — migrated to the 2025-10 Preact + Polaris web
// components API (the old imperative extension()/BlockStack API was removed in
// 2025-10). Reads the order from shopify.orderConfirmation, checks our backend
// to see if it's a LockerDrop order, and renders the pickup details.
export default function extension() {
  render(<ThankYouBlock />, document.body);
}

const API_BASE = 'https://app.lockerdrop.it';
const MAX_RETRIES = 6;
const RETRY_DELAY = 1500;

// orderConfirmation.order.id is a GID (gid://shopify/OrderIdentity/12345); the
// numeric tail matches shopify_order_id in our database.
function getOrderNumber() {
  const oc = shopify.orderConfirmation?.value;
  const gid = oc?.order?.id || oc?.id;
  return gid ? gid.toString().split('/').pop() : null;
}

function formatPickupDate(iso) {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return null;
    return d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  } catch (e) {
    return null;
  }
}

function ThankYouBlock() {
  // phase: 'loading' | 'done' | 'hidden'
  const [phase, setPhase] = useState('loading');
  const [data, setData] = useState(null);

  useEffect(() => {
    let cancelled = false;
    let attempts = 0;

    async function check() {
      if (cancelled) return;

      const orderNumber = getOrderNumber();
      if (!orderNumber) {
        if (attempts++ < MAX_RETRIES) { setTimeout(check, RETRY_DELAY); return; }
        if (!cancelled) setPhase('hidden');
        return;
      }

      try {
        const token = await shopify.sessionToken.get();
        const res = await fetch(`${API_BASE}/api/customer/order-status/${orderNumber}`, {
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
        });

        if (!res.ok) throw new Error(`status ${res.status}`);

        const body = await res.json();
        if (body && body.isLockerDropOrder) {
          if (!cancelled) { setData(body); setPhase('done'); }
          return;
        }

        // Not (yet) recognized — the orders/create webhook may still be
        // processing. Retry a few times before giving up.
        if (attempts++ < MAX_RETRIES) { setTimeout(check, RETRY_DELAY); return; }
        if (!cancelled) setPhase('hidden');
      } catch (e) {
        if (attempts++ < MAX_RETRIES) { setTimeout(check, RETRY_DELAY); return; }
        if (!cancelled) setPhase('hidden');
      }
    }

    check();
    return () => { cancelled = true; };
  }, []);

  if (phase === 'hidden') return null;

  if (phase === 'loading') {
    return (
      <s-stack direction="inline" gap="base" alignItems="center">
        <s-spinner size="base"></s-spinner>
        <s-text>Confirming your locker reservation…</s-text>
      </s-stack>
    );
  }

  const pickupDate = formatPickupDate(data?.expectedPickupDate);

  return (
    <s-section heading="LockerDrop Pickup">
      <s-stack gap="base">
        <s-banner tone="success" heading="Locker pickup confirmed!">
          Your order will be delivered to a secure locker for convenient pickup.
        </s-banner>

        <s-stack gap="small-200">
          <s-text type="strong">Pickup location</s-text>
          <s-text>{data?.lockerName || 'Your selected locker'}</s-text>
          {data?.lockerAddress ? <s-text tone="neutral">{data.lockerAddress}</s-text> : null}
        </s-stack>

        {pickupDate ? (
          <s-stack gap="small-200">
            <s-text type="strong">Expected pickup date</s-text>
            <s-text>{pickupDate}</s-text>
          </s-stack>
        ) : null}

        <s-divider></s-divider>

        <s-stack gap="small-200">
          <s-text type="strong">What happens next</s-text>
          <s-text>1. The seller prepares your order for locker delivery.</s-text>
          <s-text>2. You get a text and email with your pickup link when it is in the locker.</s-text>
          <s-text>3. Tap the link at the locker and the door opens automatically. Grab your package!</s-text>
        </s-stack>

        <s-text tone="neutral">Lockers are available 24/7 and your package stays secured until you pick it up.</s-text>
      </s-stack>
    </s-section>
  );
}
