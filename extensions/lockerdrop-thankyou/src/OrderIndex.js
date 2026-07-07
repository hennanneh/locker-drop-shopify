import {
  extension,
  BlockStack,
  InlineStack,
  Text,
  Heading,
  Divider,
  Link,
} from '@shopify/ui-extensions/checkout';

// Renders on the customer account "Orders" list page. Shows a compact summary of any
// of the customer's recent LockerDrop pickups (esp. ones ready to collect). Fully
// self-hiding: if the customer has no locker orders, or anything fails, it renders
// nothing — it can never break the orders page.
export default extension(
  'customer-account.order-index.block.render',
  (root, api) => {
    const { sessionToken } = api;

    const container = root.createComponent(BlockStack, { spacing: 'loose', padding: 'base' });
    root.appendChild(container);

    loadLockerPickups();

    async function loadLockerPickups() {
      try {
        // 1) Get the customer's most recent orders via the Customer Account API.
        if (typeof api.query !== 'function') return; // API surface unavailable — render nothing
        const result = await api.query(
          `query { customer { orders(first: 5, reverse: true) { edges { node { id name } } } } }`
        );
        const edges = result?.data?.customer?.orders?.edges || [];
        if (edges.length === 0) return;

        const token = await sessionToken.get();

        // 2) Check each order against our API; keep only LockerDrop pickups.
        const checks = await Promise.all(edges.map(async (e) => {
          try {
            const node = e?.node || {};
            const orderNumber = node.id?.split('/')?.pop() || node.name?.replace('#', '');
            if (!orderNumber) return null;
            const resp = await fetch(
              `https://app.lockerdrop.it/api/customer/order-status/${orderNumber}`,
              { headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' } }
            );
            if (!resp.ok) return null;
            const data = await resp.json();
            if (!data || !data.isLockerDropOrder) return null;
            return { name: node.name || `#${orderNumber}`, status: data.status, lockerName: data.lockerName };
          } catch (_) { return null; }
        }));

        const pickups = checks.filter(Boolean);
        if (pickups.length === 0) return; // nothing relevant — render nothing

        renderSummary(pickups);
      } catch (_) {
        // Any failure: leave the page untouched.
      }
    }

    function renderSummary(pickups) {
      const card = root.createComponent(BlockStack, {
        spacing: 'tight', padding: 'base', background: 'subdued', borderRadius: 'base'
      });
      container.appendChild(card);

      const header = root.createComponent(InlineStack, { spacing: 'tight', blockAlignment: 'center' });
      header.appendChild(root.createComponent(Text, { size: 'large' }, '📦'));
      header.appendChild(root.createComponent(Heading, { level: 3 }, 'Your locker pickups'));
      card.appendChild(header);
      card.appendChild(root.createComponent(Divider));

      pickups.forEach((p) => {
        const row = root.createComponent(InlineStack, { spacing: 'tight', blockAlignment: 'center' });
        row.appendChild(root.createComponent(Text, {}, statusIcon(p.status)));
        const label = p.lockerName ? `${p.name} · ${p.lockerName}` : p.name;
        row.appendChild(root.createComponent(Text, { emphasis: 'bold' }, label));
        row.appendChild(root.createComponent(Text, { size: 'small', appearance: 'subdued' }, statusLabel(p.status)));
        card.appendChild(row);
      });

      card.appendChild(root.createComponent(Text, { size: 'small', appearance: 'subdued' },
        'Open an order to see its pickup location and locker code.'
      ));
    }

    function statusIcon(status) {
      if (status === 'ready_for_pickup') return '🟢';
      if (status === 'completed') return '✅';
      if (status === 'cancelled' || status === 'expired') return '⚪';
      return '🔵';
    }

    function statusLabel(status) {
      switch (status) {
        case 'ready_for_pickup': return 'Ready to pick up';
        case 'pending_dropoff': return 'Preparing';
        case 'completed': return 'Picked up';
        case 'cancelled': return 'Cancelled';
        case 'expired': return 'Expired';
        default: return 'Processing';
      }
    }
  }
);
