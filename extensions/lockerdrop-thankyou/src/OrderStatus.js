import {
  extension,
  BlockStack,
  InlineStack,
  Text,
  Heading,
  Icon,
  Banner,
  Divider,
  Link,
  Button,
  SkeletonText,
} from '@shopify/ui-extensions/checkout';

export default extension(
  'customer-account.order-status.block.render',
  (root, api) => {
    const { order, sessionToken } = api;

    // order is a subscribable - actual data is in order.current
    const orderData = order?.current || order;

    // Get order ID/name for API lookup
    const orderId = orderData?.id;
    const orderName = orderData?.name; // e.g., "#1011"

    // Main container - always create it, we'll populate after API call
    const container = root.createComponent(BlockStack, { spacing: 'loose', padding: 'base' });
    root.appendChild(container);

    // Show loading initially
    const loadingBlock = root.createComponent(SkeletonText, { lines: 3 });
    container.appendChild(loadingBlock);

    // Fetch from our API to check if this is a LockerDrop order
    checkLockerDropOrder();

    async function checkLockerDropOrder() {
      try {
        const token = await sessionToken.get();
        // Use order name (e.g., "#1011" -> "1011")
        const orderNumber = orderName?.replace('#', '') || orderId?.split('/')?.pop();

        console.log('LockerDrop OrderStatus: Checking order', orderNumber);

        const response = await fetch(
          `https://app.lockerdrop.it/api/customer/order-status/${orderNumber}`,
          {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            }
          }
        );

        // Remove loading
        if (container.children.length > 0) {
          container.removeChild(loadingBlock);
        }

        if (!response.ok) {
          console.log('LockerDrop OrderStatus: API returned', response.status);
          // Not a LockerDrop order or not found - don't render anything
          // Clear the container contents
          while (container.children.length > 0) {
            container.removeChild(container.children[0]);
          }
          return;
        }

        const lockerStatus = await response.json();
        console.log('LockerDrop OrderStatus: API response:', JSON.stringify(lockerStatus));

        // If no locker data, this isn't a LockerDrop order
        if (!lockerStatus || !lockerStatus.isLockerDropOrder) {
          console.log('LockerDrop OrderStatus: Not a LockerDrop order');
          while (container.children.length > 0) {
            container.removeChild(container.children[0]);
          }
          return;
        }

        console.log('LockerDrop OrderStatus: Rendering status UI');
        // Render the LockerDrop status UI
        renderLockerDropStatus(lockerStatus);
      } catch (err) {
        console.error('Failed to check LockerDrop status:', err);
        // Clean up loading indicator safely
        while (container.children.length > 0) {
          container.removeChild(container.children[0]);
        }
      }
    }

    function renderLockerDropStatus(lockerStatus) {
      // Card container
      const card = root.createComponent(BlockStack, {
        spacing: 'tight',
        padding: 'base',
        background: 'subdued',
        borderRadius: 'base'
      });
      container.appendChild(card);

      // Header with icon
      const headerRow = root.createComponent(InlineStack, { spacing: 'tight', blockAlignment: 'center' });
      headerRow.appendChild(root.createComponent(Text, { size: 'extraLarge' }, '📦'));
      headerRow.appendChild(root.createComponent(Heading, { level: 2 }, 'LockerDrop Pickup'));
      card.appendChild(headerRow);

      const status = lockerStatus?.status || 'pending_dropoff';
      const statusConfig = getStatusConfig(status);

      card.appendChild(root.createComponent(Divider));

      // Status Banner
      const banner = root.createComponent(Banner, {
        status: statusConfig.bannerStatus,
        title: statusConfig.title
      });
      banner.appendChild(root.createComponent(Text, {}, statusConfig.message));
      card.appendChild(banner);

      // Locker Location
      if (lockerStatus?.lockerName) {
        const locationBlock = root.createComponent(BlockStack, { spacing: 'extraTight' });
        locationBlock.appendChild(root.createComponent(Text, { emphasis: 'bold' }, 'Pickup Location:'));
        locationBlock.appendChild(root.createComponent(Text, {}, lockerStatus.lockerName));
        if (lockerStatus?.lockerAddress) {
          locationBlock.appendChild(root.createComponent(Text, { size: 'small', appearance: 'subdued' }, lockerStatus.lockerAddress));
        }
        card.appendChild(locationBlock);
      }

      // Expected Pickup Date - show when status is pending_dropoff
      if (status === 'pending_dropoff' && lockerStatus?.expectedPickupDate) {
        card.appendChild(root.createComponent(Divider));
        const dateBlock = root.createComponent(BlockStack, { spacing: 'extraTight' });
        dateBlock.appendChild(root.createComponent(Text, { emphasis: 'bold' }, 'Expected Pickup Date:'));
        // Format the date nicely
        const pickupDate = new Date(lockerStatus.expectedPickupDate);
        const formattedDate = pickupDate.toLocaleDateString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        });
        dateBlock.appendChild(root.createComponent(Text, {}, formattedDate));
        card.appendChild(dateBlock);
      }

      // Pickup Link - Only show when ready
      if (status === 'ready_for_pickup' && lockerStatus?.pickupUrl) {
        card.appendChild(root.createComponent(Divider));

        const pickupBlock = root.createComponent(BlockStack, { spacing: 'tight' });
        pickupBlock.appendChild(root.createComponent(Text, { emphasis: 'bold' }, 'Ready to pick up!'));
        pickupBlock.appendChild(root.createComponent(Text, { size: 'small' },
          "Tap the button below when you're at the locker to open the door:"
        ));

        const linkWrapper = root.createComponent(Link, { to: lockerStatus.pickupUrl, external: true });
        linkWrapper.appendChild(root.createComponent(Button, { kind: 'primary' }, 'Open Locker Door'));
        pickupBlock.appendChild(linkWrapper);

        pickupBlock.appendChild(root.createComponent(Text, { size: 'small', appearance: 'subdued' },
          `Or visit: ${lockerStatus.pickupUrl}`
        ));

        card.appendChild(pickupBlock);
      }

      // Status Steps
      card.appendChild(root.createComponent(Divider));

      const stepsBlock = root.createComponent(BlockStack, { spacing: 'tight' });
      stepsBlock.appendChild(root.createComponent(Text, { emphasis: 'bold', size: 'small' }, 'Order Progress:'));

      // Step 1: Preparing
      const step1Row = root.createComponent(InlineStack, { spacing: 'tight', blockAlignment: 'center' });
      step1Row.appendChild(root.createComponent(Text, {}, getStepIcon('pending_dropoff', status)));
      step1Row.appendChild(root.createComponent(Text, {
        size: 'small',
        appearance: status === 'pending_dropoff' ? undefined : 'subdued'
      }, 'Preparing for locker'));
      stepsBlock.appendChild(step1Row);

      // Step 2: Ready for pickup
      const step2Row = root.createComponent(InlineStack, { spacing: 'tight', blockAlignment: 'center' });
      step2Row.appendChild(root.createComponent(Text, {}, getStepIcon('ready_for_pickup', status)));
      step2Row.appendChild(root.createComponent(Text, {
        size: 'small',
        appearance: status === 'ready_for_pickup' ? undefined : 'subdued'
      }, 'Ready for pickup'));
      stepsBlock.appendChild(step2Row);

      // Step 3: Picked up
      const step3Row = root.createComponent(InlineStack, { spacing: 'tight', blockAlignment: 'center' });
      step3Row.appendChild(root.createComponent(Text, {}, getStepIcon('completed', status)));
      step3Row.appendChild(root.createComponent(Text, {
        size: 'small',
        appearance: status === 'completed' ? undefined : 'subdued'
      }, 'Picked up'));
      stepsBlock.appendChild(step3Row);

      card.appendChild(stepsBlock);

      // Help text
      card.appendChild(root.createComponent(Divider));

      const helpBlock = root.createComponent(BlockStack, { spacing: 'extraTight' });

      const clockRow = root.createComponent(InlineStack, { spacing: 'tight', blockAlignment: 'center' });
      clockRow.appendChild(root.createComponent(Icon, { source: 'clock', size: 'small' }));
      clockRow.appendChild(root.createComponent(Text, { size: 'small', appearance: 'subdued' },
        'Lockers are available 24/7'
      ));
      helpBlock.appendChild(clockRow);

      const emailRow = root.createComponent(InlineStack, { spacing: 'tight', blockAlignment: 'center' });
      emailRow.appendChild(root.createComponent(Icon, { source: 'email', size: 'small' }));
      emailRow.appendChild(root.createComponent(Text, { size: 'small', appearance: 'subdued' },
        "You'll receive text/email notifications"
      ));
      helpBlock.appendChild(emailRow);

      card.appendChild(helpBlock);
    }

    function getStatusConfig(status) {
      switch (status) {
        case 'pending_dropoff':
          return {
            bannerStatus: 'info',
            title: 'Order Being Prepared',
            message: "The seller is preparing your order for locker delivery. You'll receive a notification when it's ready for pickup."
          };
        case 'ready_for_pickup':
          return {
            bannerStatus: 'success',
            title: 'Ready for Pickup!',
            message: 'Your order is in the locker and ready to be picked up. Use the pickup link below to open the locker door.'
          };
        case 'completed':
          return {
            bannerStatus: 'success',
            title: 'Picked Up',
            message: "You've successfully picked up your order. Thank you for using LockerDrop!"
          };
        case 'cancelled':
          return {
            bannerStatus: 'warning',
            title: 'Cancelled',
            message: 'This locker pickup has been cancelled. Please contact the store for more information.'
          };
        case 'expired':
          return {
            bannerStatus: 'warning',
            title: 'Pickup Expired',
            message: 'The pickup window has expired. Please contact the store for assistance.'
          };
        default:
          return {
            bannerStatus: 'info',
            title: 'Processing',
            message: 'Your locker pickup order is being processed.'
          };
      }
    }

    function getStepIcon(step, currentStatus) {
      const statusOrder = ['pending_dropoff', 'ready_for_pickup', 'completed'];
      const currentIndex = statusOrder.indexOf(currentStatus);
      const stepIndex = statusOrder.indexOf(step);

      if (currentStatus === 'cancelled' || currentStatus === 'expired') {
        return '⚪';
      }

      if (stepIndex < currentIndex) {
        return '✅'; // Completed
      } else if (stepIndex === currentIndex) {
        return '🔵'; // Current
      } else {
        return '⚪'; // Pending
      }
    }
  }
);
