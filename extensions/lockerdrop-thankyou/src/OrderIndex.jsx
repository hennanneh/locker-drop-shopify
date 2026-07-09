import '@shopify/ui-extensions/preact';
import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';

// Customer-account Orders list block — migrated to the 2025-10 Preact + Polaris
// web components API. Shows a compact summary of the customer's LockerDrop
// pickups. Fully self-hiding: if there are none, or anything fails, it renders
// nothing and never disturbs the orders page.
export default function extension() {
  render(<OrderIndexBlock />, document.body);
}

const API_BASE = 'https://app.lockerdrop.it';

const STATUS_LABEL = {
  ready_for_pickup: 'Ready to pick up',
  pending_dropoff: 'Preparing',
  completed: 'Picked up',
  cancelled: 'Cancelled',
  expired: 'Expired'
};

function statusIcon(status) {
  if (status === 'ready_for_pickup') return '🟢';
  if (status === 'completed') return '✅';
  if (status === 'cancelled' || status === 'expired') return '⚪';
  return '🔵';
}

function OrderIndexBlock() {
  const [pickups, setPickups] = useState(null); // null = loading, [] = none

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Customer Account GraphQL API — access defensively; if the accessor
        // isn't available, degrade to rendering nothing.
        const runQuery = typeof shopify?.query === 'function'
          ? shopify.query.bind(shopify)
          : null;
        if (!runQuery) { if (!cancelled) setPickups([]); return; }

        const result = await runQuery(
          `query { customer { orders(first: 5, reverse: true) { edges { node { id name } } } } }`
        );
        const edges = result?.data?.customer?.orders?.edges || [];
        if (edges.length === 0) { if (!cancelled) setPickups([]); return; }

        const token = await shopify.sessionToken.get();
        const checks = await Promise.all(edges.map(async (e) => {
          try {
            const node = e?.node || {};
            const orderNumber = node.id?.split('/')?.pop() || node.name?.replace('#', '');
            if (!orderNumber) return null;
            const resp = await fetch(`${API_BASE}/api/customer/order-status/${orderNumber}`, {
              headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
            });
            if (!resp.ok) return null;
            const data = await resp.json();
            if (!data || !data.isLockerDropOrder) return null;
            return {
              name: node.name || `#${orderNumber}`,
              status: data.status,
              lockerName: data.lockerName,
              label: STATUS_LABEL[data.status] || 'Processing'
            };
          } catch (_) { return null; }
        }));

        if (!cancelled) setPickups(checks.filter(Boolean));
      } catch (_) {
        if (!cancelled) setPickups([]);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Render nothing while loading or when there are no locker pickups.
  if (!pickups || pickups.length === 0) return null;

  return (
    <s-section heading="Your locker pickups">
      <s-stack gap="small-200">
        {pickups.map((p) => (
          <s-stack direction="inline" gap="small-200" alignItems="center">
            <s-text>{statusIcon(p.status)}</s-text>
            <s-text type="strong">{p.lockerName ? `${p.name} · ${p.lockerName}` : p.name}</s-text>
            <s-text tone="neutral">{p.label}</s-text>
          </s-stack>
        ))}
        <s-text tone="neutral">Open an order to see its pickup location and locker code.</s-text>
      </s-stack>
    </s-section>
  );
}
