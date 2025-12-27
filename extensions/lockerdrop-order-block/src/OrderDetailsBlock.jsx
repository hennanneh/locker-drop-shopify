import { useState, useEffect } from 'react';
import {
  reactExtension,
  useApi,
  AdminBlock,
  BlockStack,
  Text,
  Link,
  Badge,
  InlineStack,
  Divider,
} from '@shopify/ui-extensions-react/admin';

// The target for the order details page block
export default reactExtension('admin.order-details.block.render', () => <OrderDetailsBlock />);

function OrderDetailsBlock() {
  const { data: orderData } = useApi('admin.order-details.block.render');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function fetchLockerData() {
      try {
        // Get the order ID from the current context
        const orderId = orderData?.selected?.[0]?.id;
        if (!orderId) {
          setLoading(false);
          return;
        }

        // Extract numeric ID from gid://shopify/Order/123456
        const numericId = orderId.split('/').pop();

        // Fetch locker data from our API
        const response = await fetch(
          `https://lockerdrop.it/api/order-locker-data/${numericId}`,
          {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
            },
          }
        );

        if (!response.ok) {
          if (response.status === 404) {
            // No locker data for this order - this is fine
            setLoading(false);
            return;
          }
          throw new Error('Failed to fetch locker data');
        }

        const lockerData = await response.json();
        setData(lockerData);
      } catch (err) {
        setError(err);
      } finally {
        setLoading(false);
      }
    }

    fetchLockerData();
  }, [orderData?.selected]);

  if (loading) {
    return (
      <AdminBlock title="LockerDrop">
        <Text>Loading locker details...</Text>
      </AdminBlock>
    );
  }

  if (error || !data) {
    return (
      <AdminBlock title="LockerDrop">
        <Text appearance="subdued">No locker pickup for this order</Text>
      </AdminBlock>
    );
  }

  const statusConfig = {
    pending: { tone: 'warning', label: 'Pending Dropoff' },
    dropped_off: { tone: 'info', label: 'In Locker' },
    ready_for_pickup: { tone: 'info', label: 'Ready for Pickup' },
    completed: { tone: 'success', label: 'Picked Up' },
    cancelled: { tone: 'critical', label: 'Cancelled' },
  };

  const config = statusConfig[data.status] || { tone: 'subdued', label: data.status };

  return (
    <AdminBlock title="LockerDrop Pickup">
      <BlockStack gap="base">
        {/* Status Badge */}
        <InlineStack gap="small" blockAlignment="center">
          <Text fontWeight="bold">Status:</Text>
          <Badge tone={config.tone}>{config.label}</Badge>
        </InlineStack>

        <Divider />

        {/* Locker Location */}
        {data.locationName && (
          <BlockStack gap="extraTight">
            <Text fontWeight="bold">Locker Location</Text>
            <Text>{data.locationName}</Text>
          </BlockStack>
        )}

        {/* Links Section */}
        <BlockStack gap="tight">
          {data.dropoffLink && data.status === 'pending' && (
            <Link href={data.dropoffLink} target="_blank">
              Open Dropoff Link
            </Link>
          )}

          {data.pickupLink && (data.status === 'ready_for_pickup' || data.status === 'dropped_off') && (
            <Link href={data.pickupLink} target="_blank">
              View Customer Pickup Link
            </Link>
          )}

          {/* Always show link to LockerDrop dashboard */}
          <Link href={`https://lockerdrop.it/admin/dashboard?shop=${data.shop}`} target="_blank">
            Open LockerDrop Dashboard
          </Link>
        </BlockStack>

        {/* Timestamps */}
        {data.status === 'completed' && data.completedAt && (
          <>
            <Divider />
            <Text appearance="subdued">
              Picked up: {new Date(data.completedAt).toLocaleString()}
            </Text>
          </>
        )}
      </BlockStack>
    </AdminBlock>
  );
}
