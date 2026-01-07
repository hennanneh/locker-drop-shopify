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
  Image,
} from '@shopify/ui-extensions-react/checkout';

export default reactExtension(
  'purchase.thank-you.block.render',
  () => <LockerDropThankYou />
);

function LockerDropThankYou() {
  const { order } = useOrder();

  // Check if order used LockerDrop shipping
  const isLockerDropOrder = order?.shippingLines?.some(line =>
    line.title?.toLowerCase().includes('lockerdrop') ||
    line.title?.toLowerCase().includes('locker pickup') ||
    line.title?.toLowerCase().includes('locker drop')
  );

  // If not a LockerDrop order, don't render anything
  if (!isLockerDropOrder) {
    return null;
  }

  // Extract locker info from shipping line if available
  const shippingLine = order?.shippingLines?.find(line =>
    line.title?.toLowerCase().includes('lockerdrop') ||
    line.title?.toLowerCase().includes('locker pickup')
  );

  return (
    <BlockStack spacing="loose" padding="base">
      <Banner status="success" title="Locker Pickup Selected!">
        <BlockStack spacing="tight">
          <Text>
            Your order will be delivered to a secure locker for convenient pickup.
          </Text>
        </BlockStack>
      </Banner>

      <BlockStack spacing="tight" padding="base" background="subdued" borderRadius="base">
        <InlineStack spacing="tight" blockAlignment="center">
          <Text size="extraLarge">📦</Text>
          <Heading level={2}>LockerDrop Pickup</Heading>
        </InlineStack>

        <Divider />

        <BlockStack spacing="tight">
          <Text emphasis="bold">What happens next:</Text>

          <InlineStack spacing="tight" blockAlignment="start">
            <Text size="medium">1️⃣</Text>
            <BlockStack spacing="extraTight">
              <Text emphasis="bold">Order Processing</Text>
              <Text size="small" appearance="subdued">
                The seller will prepare your order for locker delivery.
              </Text>
            </BlockStack>
          </InlineStack>

          <InlineStack spacing="tight" blockAlignment="start">
            <Text size="medium">2️⃣</Text>
            <BlockStack spacing="extraTight">
              <Text emphasis="bold">Pickup Link Sent</Text>
              <Text size="small" appearance="subdued">
                You'll receive a text message and email with your unique pickup link when your order is in the locker.
              </Text>
            </BlockStack>
          </InlineStack>

          <InlineStack spacing="tight" blockAlignment="start">
            <Text size="medium">3️⃣</Text>
            <BlockStack spacing="extraTight">
              <Text emphasis="bold">Tap & Collect</Text>
              <Text size="small" appearance="subdued">
                Visit the locker location, tap your link, and the door opens automatically. Grab your package!
              </Text>
            </BlockStack>
          </InlineStack>
        </BlockStack>

        <Divider />

        <BlockStack spacing="extraTight">
          <InlineStack spacing="tight" blockAlignment="center">
            <Icon source="clock" size="small" />
            <Text size="small" appearance="subdued">
              Lockers are available 24/7 for your convenience
            </Text>
          </InlineStack>
          <InlineStack spacing="tight" blockAlignment="center">
            <Icon source="lock" size="small" />
            <Text size="small" appearance="subdued">
              Your package is secured until you pick it up
            </Text>
          </InlineStack>
        </BlockStack>
      </BlockStack>

      <Text size="small" appearance="subdued">
        Questions about your locker pickup? Check your email for tracking updates or contact the store.
      </Text>
    </BlockStack>
  );
}
