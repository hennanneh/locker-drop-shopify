import {
  extension,
  AdminBlock,
  BlockStack,
  Text,
  Link,
  Badge,
  InlineStack,
  Divider,
} from '@shopify/ui-extensions/admin';

// The target for the order details page block
export default extension('admin.order-details.block.render', async (root, api) => {
  const { data } = api;

  // Get the order ID from the current context
  const orderId = data?.selected?.[0]?.id;

  if (!orderId) {
    const block = root.createComponent(AdminBlock, { title: 'LockerDrop' });
    block.appendChild(root.createComponent(Text, { appearance: 'subdued' }, 'No order selected'));
    root.appendChild(block);
    return;
  }

  // Extract numeric ID from gid://shopify/Order/123456
  const numericId = orderId.split('/').pop();

  try {
    // Fetch locker data from our API (shop is returned in response if order exists)
    const response = await fetch(
      `https://app.lockerdrop.it/api/order-locker-data/${numericId}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    const lockerData = await response.json();

    // Handle API errors
    if (!response.ok || lockerData.error) {
      const block = root.createComponent(AdminBlock, { title: 'LockerDrop' });
      block.appendChild(root.createComponent(Text, { appearance: 'subdued' }, 'No LockerDrop data'));
      root.appendChild(block);
      return;
    }

    // Check if this is NOT a LockerDrop order
    if (lockerData.isLockerDropOrder === false) {
      const block = root.createComponent(AdminBlock, { title: 'LockerDrop' });
      block.appendChild(root.createComponent(Text, { appearance: 'subdued' }, 'No LockerDrop data'));
      root.appendChild(block);
      return;
    }

    // Handle case where order needs to be synced (LockerDrop shipping but not yet processed)
    if (lockerData.needsSync) {
      const block = root.createComponent(AdminBlock, { title: 'LockerDrop Pickup' });
      const stack = root.createComponent(BlockStack, { gap: 'base' });

      const statusRow = root.createComponent(InlineStack, { gap: 'small', blockAlignment: 'center' });
      statusRow.appendChild(root.createComponent(Text, { fontWeight: 'bold' }, 'Status:'));
      statusRow.appendChild(root.createComponent(Badge, { tone: 'warning' }, 'Needs Setup'));
      stack.appendChild(statusRow);

      stack.appendChild(root.createComponent(Divider, {}));
      stack.appendChild(root.createComponent(Text, {}, 'This order uses LockerDrop shipping but needs to be synced.'));

      const linksStack = root.createComponent(BlockStack, { gap: 'tight' });
      linksStack.appendChild(
        root.createComponent(
          Link,
          { href: `https://app.lockerdrop.it/admin/dashboard`, target: '_blank' },
          'Open Dashboard to Sync'
        )
      );
      stack.appendChild(linksStack);

      block.appendChild(stack);
      root.appendChild(block);
      return;
    }

    // Status configuration (includes both pending and pending_dropoff for compatibility)
    const statusConfig = {
      pending: { tone: 'warning', label: 'Pending Dropoff' },
      pending_dropoff: { tone: 'warning', label: 'Pending Dropoff' },
      dropped_off: { tone: 'info', label: 'In Locker' },
      ready_for_pickup: { tone: 'info', label: 'Ready for Pickup' },
      completed: { tone: 'success', label: 'Picked Up' },
      cancelled: { tone: 'critical', label: 'Cancelled' },
    };

    const config = statusConfig[lockerData.status] || { tone: 'subdued', label: lockerData.status };

    // Build the UI
    const block = root.createComponent(AdminBlock, { title: 'LockerDrop Pickup' });
    const stack = root.createComponent(BlockStack, { gap: 'base' });

    // Status row
    const statusRow = root.createComponent(InlineStack, { gap: 'small', blockAlignment: 'center' });
    statusRow.appendChild(root.createComponent(Text, { fontWeight: 'bold' }, 'Status:'));
    statusRow.appendChild(root.createComponent(Badge, { tone: config.tone }, config.label));
    stack.appendChild(statusRow);

    stack.appendChild(root.createComponent(Divider, {}));

    // Location info - show location name or location ID if available
    const locationDisplay = lockerData.locationName || (lockerData.locationId ? `Location ${lockerData.locationId}` : null);
    if (locationDisplay) {
      const locationStack = root.createComponent(BlockStack, { gap: 'extraTight' });
      locationStack.appendChild(root.createComponent(Text, { fontWeight: 'bold' }, 'Locker Location'));
      locationStack.appendChild(root.createComponent(Text, {}, locationDisplay));
      stack.appendChild(locationStack);
    }

    // Links section
    const linksStack = root.createComponent(BlockStack, { gap: 'tight' });

    // Show dropoff link for pending statuses
    if (lockerData.dropoffLink && (lockerData.status === 'pending' || lockerData.status === 'pending_dropoff')) {
      linksStack.appendChild(
        root.createComponent(Link, { href: lockerData.dropoffLink, target: '_blank' }, 'Open Dropoff Link')
      );
    }

    // Show pickup link for ready/dropped off statuses
    if (lockerData.pickupLink && (lockerData.status === 'ready_for_pickup' || lockerData.status === 'dropped_off')) {
      linksStack.appendChild(
        root.createComponent(Link, { href: lockerData.pickupLink, target: '_blank' }, 'View Customer Pickup Link')
      );
    }

    // Dashboard link
    linksStack.appendChild(
      root.createComponent(
        Link,
        { href: `https://app.lockerdrop.it/admin/dashboard?shop=${lockerData.shop || ''}`, target: '_blank' },
        'Open LockerDrop Dashboard'
      )
    );

    stack.appendChild(linksStack);

    // Completed timestamp
    if (lockerData.status === 'completed' && lockerData.completedAt) {
      stack.appendChild(root.createComponent(Divider, {}));
      stack.appendChild(
        root.createComponent(
          Text,
          { appearance: 'subdued' },
          `Picked up: ${new Date(lockerData.completedAt).toLocaleString()}`
        )
      );
    }

    block.appendChild(stack);
    root.appendChild(block);

  } catch (err) {
    const block = root.createComponent(AdminBlock, { title: 'LockerDrop' });
    block.appendChild(root.createComponent(Text, { appearance: 'critical' }, 'Error loading locker data'));
    root.appendChild(block);
  }
});
