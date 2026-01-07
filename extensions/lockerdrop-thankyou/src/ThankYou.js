import {
  extension,
  BlockStack,
  InlineStack,
  Text,
  Heading,
  Icon,
  Banner,
  Divider,
} from '@shopify/ui-extensions/checkout';

export default extension(
  'purchase.thank-you.block.render',
  (root, api) => {
    // order is a subscribable - actual data is in order.current
    const orderData = api.order?.current || api.order;

    // Get shipping address - it's nested in the order data
    const shippingAddress = orderData?.shippingAddress;
    const address2 = shippingAddress?.address2 || '';

    // Get delivery groups which contain shipping info
    const deliveryGroups = orderData?.deliveryGroups || [];

    const hasLockerDropShipping = deliveryGroups.some(group =>
      group.selectedDeliveryOption?.title?.toLowerCase().includes('lockerdrop')
    );

    // Check if this is a LockerDrop order (check address2 for LockerDrop marker)
    const isLockerDropOrder = address2.toLowerCase().includes('lockerdrop') || hasLockerDropShipping;

    // If not a LockerDrop order, don't render anything
    if (!isLockerDropOrder) {
      return;
    }

    // Extract locker name from address2 (format: "LockerDrop: Name (ID: xxx)")
    let lockerName = 'Your selected locker';
    const lockerMatch = address2.match(/LockerDrop:\s*([^(]+)/i);
    if (lockerMatch) {
      lockerName = lockerMatch[1].trim();
    }

    // Build locker address from shipping address fields
    const lockerAddress = [
      shippingAddress?.address1,
      shippingAddress?.city,
      shippingAddress?.provinceCode,
      shippingAddress?.zip
    ].filter(Boolean).join(', ');

    // Main container
    const container = root.createComponent(BlockStack, { spacing: 'loose', padding: 'base' });
    root.appendChild(container);

    // Success Banner
    const banner = root.createComponent(Banner, {
      status: 'success',
      title: 'Locker Pickup Confirmed!'
    });
    banner.appendChild(root.createComponent(Text, {},
      'Your order will be delivered to a secure locker for convenient pickup.'
    ));
    container.appendChild(banner);

    // Info Card
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

    card.appendChild(root.createComponent(Divider));

    // Locker Location
    const locationBlock = root.createComponent(BlockStack, { spacing: 'extraTight' });
    locationBlock.appendChild(root.createComponent(Text, { emphasis: 'bold' }, 'Pickup Location:'));
    locationBlock.appendChild(root.createComponent(Text, {}, lockerName));
    if (lockerAddress) {
      locationBlock.appendChild(root.createComponent(Text, { size: 'small', appearance: 'subdued' }, lockerAddress));
    }
    card.appendChild(locationBlock);

    card.appendChild(root.createComponent(Divider));

    // Steps container
    const stepsContainer = root.createComponent(BlockStack, { spacing: 'tight' });
    card.appendChild(stepsContainer);

    stepsContainer.appendChild(root.createComponent(Text, { emphasis: 'bold' }, 'What happens next:'));

    // Step 1
    const step1 = root.createComponent(InlineStack, { spacing: 'tight', blockAlignment: 'start' });
    step1.appendChild(root.createComponent(Text, { size: 'medium' }, '1️⃣'));
    const step1Content = root.createComponent(BlockStack, { spacing: 'extraTight' });
    step1Content.appendChild(root.createComponent(Text, { emphasis: 'bold' }, 'Order Processing'));
    step1Content.appendChild(root.createComponent(Text, { size: 'small', appearance: 'subdued' },
      'The seller will prepare your order for locker delivery.'
    ));
    step1.appendChild(step1Content);
    stepsContainer.appendChild(step1);

    // Step 2
    const step2 = root.createComponent(InlineStack, { spacing: 'tight', blockAlignment: 'start' });
    step2.appendChild(root.createComponent(Text, { size: 'medium' }, '2️⃣'));
    const step2Content = root.createComponent(BlockStack, { spacing: 'extraTight' });
    step2Content.appendChild(root.createComponent(Text, { emphasis: 'bold' }, 'Pickup Link Sent'));
    step2Content.appendChild(root.createComponent(Text, { size: 'small', appearance: 'subdued' },
      "You'll receive a text message and email with your unique pickup link when your order is in the locker."
    ));
    step2.appendChild(step2Content);
    stepsContainer.appendChild(step2);

    // Step 3
    const step3 = root.createComponent(InlineStack, { spacing: 'tight', blockAlignment: 'start' });
    step3.appendChild(root.createComponent(Text, { size: 'medium' }, '3️⃣'));
    const step3Content = root.createComponent(BlockStack, { spacing: 'extraTight' });
    step3Content.appendChild(root.createComponent(Text, { emphasis: 'bold' }, 'Tap & Collect'));
    step3Content.appendChild(root.createComponent(Text, { size: 'small', appearance: 'subdued' },
      'Visit the locker location, tap your link, and the door opens automatically. Grab your package!'
    ));
    step3.appendChild(step3Content);
    stepsContainer.appendChild(step3);

    card.appendChild(root.createComponent(Divider));

    // Info footer
    const infoFooter = root.createComponent(BlockStack, { spacing: 'extraTight' });
    card.appendChild(infoFooter);

    const clockRow = root.createComponent(InlineStack, { spacing: 'tight', blockAlignment: 'center' });
    clockRow.appendChild(root.createComponent(Icon, { source: 'clock', size: 'small' }));
    clockRow.appendChild(root.createComponent(Text, { size: 'small', appearance: 'subdued' },
      'Lockers are available 24/7 for your convenience'
    ));
    infoFooter.appendChild(clockRow);

    const lockRow = root.createComponent(InlineStack, { spacing: 'tight', blockAlignment: 'center' });
    lockRow.appendChild(root.createComponent(Icon, { source: 'lock', size: 'small' }));
    lockRow.appendChild(root.createComponent(Text, { size: 'small', appearance: 'subdued' },
      'Your package is secured until you pick it up'
    ));
    infoFooter.appendChild(lockRow);
  }
);
