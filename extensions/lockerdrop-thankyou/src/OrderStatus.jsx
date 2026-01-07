import { useState, useEffect } from 'react';
import {
  reactExtension,
  useApi,
  useOrder,
  BlockStack,
  InlineStack,
  View,
  Text,
  Heading,
  Icon,
  Banner,
  Link,
  Divider,
  Button,
  SkeletonText,
} from '@shopify/ui-extensions-react/checkout';

export default reactExtension(
  'customer-account.order-status.block.render',
  () => <LockerDropOrderStatus />
);

function LockerDropOrderStatus() {
  const { order, sessionToken } = useApi();
  const orderData = useOrder();

  const [lockerStatus, setLockerStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Check if order used LockerDrop shipping
  const isLockerDropOrder = orderData?.shippingLines?.some(line =>
    line.title?.toLowerCase().includes('lockerdrop') ||
    line.title?.toLowerCase().includes('locker pickup') ||
    line.title?.toLowerCase().includes('locker drop')
  );

  // Fetch locker status for this order
  useEffect(() => {
    if (isLockerDropOrder && orderData?.id) {
      fetchLockerStatus();
    } else {
      setLoading(false);
    }
  }, [isLockerDropOrder, orderData?.id]);

  async function fetchLockerStatus() {
    try {
      setLoading(true);
      const token = await sessionToken.get();

      // Extract order ID (remove gid:// prefix if present)
      const orderId = orderData?.id?.split('/')?.pop() || orderData?.id;

      const response = await fetch(
        `https://app.lockerdrop.it/api/customer/order-status/${orderId}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (response.ok) {
        const data = await response.json();
        setLockerStatus(data);
      }
    } catch (err) {
      console.error('Failed to fetch locker status:', err);
      setError('Unable to load pickup status');
    } finally {
      setLoading(false);
    }
  }

  // If not a LockerDrop order, don't render anything
  if (!isLockerDropOrder) {
    return null;
  }

  if (loading) {
    return (
      <BlockStack spacing="tight" padding="base" background="subdued" borderRadius="base">
        <InlineStack spacing="tight" blockAlignment="center">
          <Text size="extraLarge">📦</Text>
          <Heading level={2}>LockerDrop Pickup</Heading>
        </InlineStack>
        <SkeletonText lines={3} />
      </BlockStack>
    );
  }

  // Determine status display
  const status = lockerStatus?.status || 'pending_dropoff';
  const statusConfig = getStatusConfig(status);

  return (
    <BlockStack spacing="loose" padding="base">
      <BlockStack spacing="tight" padding="base" background="subdued" borderRadius="base">
        <InlineStack spacing="tight" blockAlignment="center">
          <Text size="extraLarge">📦</Text>
          <Heading level={2}>LockerDrop Pickup</Heading>
        </InlineStack>

        <Divider />

        {/* Status Banner */}
        <Banner status={statusConfig.bannerStatus} title={statusConfig.title}>
          <Text>{statusConfig.message}</Text>
        </Banner>

        {/* Locker Location */}
        {lockerStatus?.lockerName && (
          <BlockStack spacing="extraTight">
            <Text emphasis="bold">Pickup Location:</Text>
            <Text>{lockerStatus.lockerName}</Text>
            {lockerStatus?.lockerAddress && (
              <Text size="small" appearance="subdued">{lockerStatus.lockerAddress}</Text>
            )}
          </BlockStack>
        )}

        {/* Pickup Link - Only show when ready */}
        {status === 'ready_for_pickup' && lockerStatus?.pickupUrl && (
          <BlockStack spacing="tight">
            <Divider />
            <Text emphasis="bold">Ready to pick up!</Text>
            <Text size="small">
              Tap the button below when you're at the locker to open the door:
            </Text>
            <Link to={lockerStatus.pickupUrl} external>
              <Button kind="primary">
                Open Locker Door
              </Button>
            </Link>
            <Text size="small" appearance="subdued">
              Or visit: {lockerStatus.pickupUrl}
            </Text>
          </BlockStack>
        )}

        {/* Status Steps */}
        <Divider />
        <BlockStack spacing="tight">
          <Text emphasis="bold" size="small">Order Progress:</Text>

          <InlineStack spacing="tight" blockAlignment="center">
            <Text>{getStepIcon('pending_dropoff', status)}</Text>
            <Text size="small" appearance={status === 'pending_dropoff' ? undefined : 'subdued'}>
              Preparing for locker
            </Text>
          </InlineStack>

          <InlineStack spacing="tight" blockAlignment="center">
            <Text>{getStepIcon('ready_for_pickup', status)}</Text>
            <Text size="small" appearance={status === 'ready_for_pickup' ? undefined : 'subdued'}>
              Ready for pickup
            </Text>
          </InlineStack>

          <InlineStack spacing="tight" blockAlignment="center">
            <Text>{getStepIcon('completed', status)}</Text>
            <Text size="small" appearance={status === 'completed' ? undefined : 'subdued'}>
              Picked up
            </Text>
          </InlineStack>
        </BlockStack>

        {/* Help text */}
        <Divider />
        <BlockStack spacing="extraTight">
          <InlineStack spacing="tight" blockAlignment="center">
            <Icon source="clock" size="small" />
            <Text size="small" appearance="subdued">
              Lockers are available 24/7
            </Text>
          </InlineStack>
          <InlineStack spacing="tight" blockAlignment="center">
            <Icon source="email" size="small" />
            <Text size="small" appearance="subdued">
              You'll receive text/email notifications
            </Text>
          </InlineStack>
        </BlockStack>
      </BlockStack>
    </BlockStack>
  );
}

function getStatusConfig(status) {
  switch (status) {
    case 'pending_dropoff':
      return {
        bannerStatus: 'info',
        title: 'Order Being Prepared',
        message: 'The seller is preparing your order for locker delivery. You\'ll receive a notification when it\'s ready for pickup.'
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
        message: 'You\'ve successfully picked up your order. Thank you for using LockerDrop!'
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
