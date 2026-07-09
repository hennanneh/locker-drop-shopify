import '@shopify/ui-extensions/preact';
import { render } from 'preact';

// 2025-10 Preact build with NO network_access / api_access capabilities and no
// backend fetch — reads the locker name + pickup date client-side from the
// order's shipping line title ("LockerDrop @ <locker> - Pickup <date>"), the
// way the original working version did. Renders unconditionally for now so we
// can confirm the block mounts once the capabilities are removed.
export default function extension() {
  render(<LockerDropThankYou />, document.body);
}

function getLockerInfo() {
  try {
    const oc = shopify.orderConfirmation?.value;
    const lines = oc?.order?.shippingLines || oc?.shippingLines || [];
    const line = lines.find((l) => (l?.title || '').toLowerCase().includes('locker'));
    const title = line?.title || '';
    const afterAt = title.split('@')[1] || '';
    const parts = afterAt.split(/-\s*Pickup\s*/i);
    return {
      location: (parts[0] || '').trim() || null,
      pickupDate: (parts[1] || '').trim() || null
    };
  } catch (e) {
    return { location: null, pickupDate: null };
  }
}

function LockerDropThankYou() {
  const { location, pickupDate } = getLockerInfo();

  return (
    <s-section heading="LockerDrop Pickup">
      <s-stack gap="base">
        <s-banner tone="success" heading="Locker pickup confirmed!">
          Your order will be delivered to a secure locker for convenient pickup.
        </s-banner>

        {location ? (
          <s-stack gap="small-200">
            <s-text type="strong">Pickup location</s-text>
            <s-text>{location}</s-text>
          </s-stack>
        ) : null}

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
