import '@shopify/ui-extensions/preact';
import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';

// Customer-account Order status block — migrated to the 2025-10 Preact + Polaris
// web components API. Reads the placed order from the shopify global, checks our
// backend, and shows live locker pickup status (incl. the Open Locker link when
// ready). Self-hiding: renders nothing if it's not a LockerDrop order.
export default function extension() {
  render(<OrderStatusBlock />, document.body);
}

const API_BASE = 'https://app.lockerdrop.it';

function getOrderNumber() {
  const o = shopify.order?.value;
  const gid = o?.id;
  if (gid) return gid.toString().split('/').pop();
  const name = o?.name;
  return name ? name.replace('#', '') : null;
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

const STATUS = {
  pending_dropoff: { tone: 'info', title: 'Order being prepared', message: "The seller is preparing your order for locker delivery. You'll be notified when it's ready for pickup." },
  ready_for_pickup: { tone: 'success', title: 'Ready for pickup!', message: 'Your order is in the locker and ready to collect. Use the button below at the locker to open the door.' },
  completed: { tone: 'success', title: 'Picked up', message: "You've picked up your order. Thanks for using LockerDrop!" },
  cancelled: { tone: 'warning', title: 'Cancelled', message: 'This locker pickup was cancelled. Please contact the store for more information.' },
  expired: { tone: 'warning', title: 'Pickup expired', message: 'The pickup window has expired. Please contact the store for assistance.' }
};

function stepIcon(step, current) {
  if (current === 'cancelled' || current === 'expired') return '⚪';
  const order = ['pending_dropoff', 'ready_for_pickup', 'completed'];
  const ci = order.indexOf(current);
  const si = order.indexOf(step);
  if (si < ci) return '✅';
  if (si === ci) return '🔵';
  return '⚪';
}

function OrderStatusBlock() {
  const [state, setState] = useState({ phase: 'loading', data: null });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const orderNumber = getOrderNumber();
      if (!orderNumber) { if (!cancelled) setState({ phase: 'hidden' }); return; }
      try {
        let token = null;
        try { token = await shopify.sessionToken.get(); } catch (e) { /* proceed unauthenticated */ }
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers.Authorization = `Bearer ${token}`;
        const res = await fetch(`${API_BASE}/api/customer/order-status/${orderNumber}`, { headers });
        if (!res.ok) throw new Error(`status ${res.status}`);
        const body = await res.json();
        if (body && body.isLockerDropOrder) {
          if (!cancelled) setState({ phase: 'done', data: body });
        } else if (!cancelled) {
          setState({ phase: 'hidden' });
        }
      } catch (e) {
        if (!cancelled) setState({ phase: 'hidden' });
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (state.phase === 'hidden') return null;

  if (state.phase === 'loading') {
    return <s-skeleton-paragraph content="Loading pickup status…"></s-skeleton-paragraph>;
  }

  const d = state.data;
  const status = d?.status || 'pending_dropoff';
  const cfg = STATUS[status] || STATUS.pending_dropoff;
  const pickupDate = formatPickupDate(d?.expectedPickupDate);

  return (
    <s-section heading="LockerDrop Pickup">
      <s-stack gap="base">
        <s-banner tone={cfg.tone} heading={cfg.title}>{cfg.message}</s-banner>

        {d?.lockerName ? (
          <s-stack gap="small-200">
            <s-text type="strong">Pickup location</s-text>
            <s-text>{d.lockerName}</s-text>
            {d?.lockerAddress ? <s-text tone="neutral">{d.lockerAddress}</s-text> : null}
          </s-stack>
        ) : null}

        {status === 'pending_dropoff' && pickupDate ? (
          <s-stack gap="small-200">
            <s-text type="strong">Expected pickup date</s-text>
            <s-text>{pickupDate}</s-text>
          </s-stack>
        ) : null}

        {status === 'ready_for_pickup' && d?.pickupUrl ? (
          <s-stack gap="small-200">
            <s-text type="strong">Open your locker</s-text>
            <s-text>Tap the button below when you're at the locker to open the door.</s-text>
            <s-link href={d.pickupUrl}>Open locker door</s-link>
          </s-stack>
        ) : null}

        <s-divider></s-divider>

        <s-stack gap="small-200">
          <s-text type="strong">Order progress</s-text>
          <s-text>{stepIcon('pending_dropoff', status)} Preparing for locker</s-text>
          <s-text>{stepIcon('ready_for_pickup', status)} Ready for pickup</s-text>
          <s-text>{stepIcon('completed', status)} Picked up</s-text>
        </s-stack>

        <s-text tone="neutral">Lockers are available 24/7. You'll also receive text and email notifications.</s-text>
      </s-stack>
    </s-section>
  );
}
