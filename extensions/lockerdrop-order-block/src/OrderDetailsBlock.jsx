import '@shopify/ui-extensions/preact';
import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';

// Admin order-details block — migrated to the 2025-10 Preact + Polaris web
// components API (the old imperative extension()/AdminBlock API was removed in
// 2025-10). Shows the seller LockerDrop status, location, and links on the
// Shopify admin order page.
export default function extension() {
  render(<OrderBlock />, document.body);
}

const STATUS = {
  pending: { tone: 'warning', label: 'Pending dropoff' },
  pending_dropoff: { tone: 'warning', label: 'Pending dropoff' },
  dropped_off: { tone: 'info', label: 'In locker' },
  ready_for_pickup: { tone: 'info', label: 'Ready for pickup' },
  completed: { tone: 'success', label: 'Picked up' },
  cancelled: { tone: 'critical', label: 'Cancelled' }
};

function OrderBlock() {
  // phase: 'loading' | 'none' | 'sync' | 'data'
  const [phase, setPhase] = useState('loading');
  const [data, setData] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const orderId = shopify?.data?.selected?.[0]?.id;
        if (!orderId) { if (!cancelled) setPhase('none'); return; }
        const numericId = orderId.toString().split('/').pop();

        const res = await fetch(`https://app.lockerdrop.it/api/order-locker-data/${numericId}`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' }
        });
        const body = await res.json();

        if (!res.ok || body.error || body.isLockerDropOrder === false) {
          if (!cancelled) setPhase('none');
          return;
        }
        if (body.needsSync) {
          if (!cancelled) { setData(body); setPhase('sync'); }
          return;
        }
        if (!cancelled) { setData(body); setPhase('data'); }
      } catch (e) {
        if (!cancelled) setPhase('none');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (phase === 'loading') {
    return (
      <s-admin-block heading="LockerDrop Pickup">
        <s-spinner size="base"></s-spinner>
      </s-admin-block>
    );
  }

  if (phase === 'none') {
    return (
      <s-admin-block heading="LockerDrop">
        <s-text color="subdued">No LockerDrop data for this order.</s-text>
      </s-admin-block>
    );
  }

  if (phase === 'sync') {
    return (
      <s-admin-block heading="LockerDrop Pickup">
        <s-stack gap="base">
          <s-stack direction="inline" gap="small-200" alignItems="center">
            <s-text type="strong">Status</s-text>
            <s-badge tone="warning">Needs setup</s-badge>
          </s-stack>
          <s-divider></s-divider>
          <s-text>This order uses LockerDrop shipping but needs to be synced.</s-text>
          <s-link href="https://app.lockerdrop.it/admin/dashboard" target="_blank">Open dashboard to sync</s-link>
        </s-stack>
      </s-admin-block>
    );
  }

  // phase === 'data'
  const status = data?.status;
  const cfg = STATUS[status] || { tone: 'auto', label: status || 'Unknown' };
  const locationDisplay = data?.locationName || (data?.locationId ? `Location ${data.locationId}` : null);
  const showDropoff = data?.dropoffLink && (status === 'pending' || status === 'pending_dropoff');
  const showPickup = data?.pickupLink && (status === 'ready_for_pickup' || status === 'dropped_off');
  const completedAt = status === 'completed' && data?.completedAt
    ? (() => { try { return new Date(data.completedAt).toLocaleString(); } catch (e) { return null; } })()
    : null;

  return (
    <s-admin-block heading="LockerDrop Pickup">
      <s-stack gap="base">
        <s-stack direction="inline" gap="small-200" alignItems="center">
          <s-text type="strong">Status</s-text>
          <s-badge tone={cfg.tone}>{cfg.label}</s-badge>
        </s-stack>

        <s-divider></s-divider>

        {locationDisplay ? (
          <s-stack gap="small-200">
            <s-text type="strong">Locker location</s-text>
            <s-text>{locationDisplay}</s-text>
          </s-stack>
        ) : null}

        <s-stack gap="small-200">
          {showDropoff ? (
            <s-stack gap="small-200">
              <s-link href={data.dropoffLink} target="_blank">Drop Off Locker Link</s-link>
              <s-text color="subdued">Open this at the locker to drop off the package.</s-text>
            </s-stack>
          ) : null}
          {showPickup ? (
            <s-text color="subdued">Ready for the customer to collect. To resend their pickup link, open the LockerDrop dashboard and tap "Resend" on this order — don't open the pickup link yourself, it unlocks the customer's locker.</s-text>
          ) : null}
          <s-link href={`https://app.lockerdrop.it/admin/dashboard?shop=${data?.shop || ''}`} target="_blank">Open LockerDrop dashboard</s-link>
        </s-stack>

        {completedAt ? (
          <s-text color="subdued">Picked up: {completedAt}</s-text>
        ) : null}
      </s-stack>
    </s-admin-block>
  );
}
