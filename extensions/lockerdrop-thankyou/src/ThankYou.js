import {
  extension,
  BlockStack,
  InlineStack,
  Text,
  Heading,
  Icon,
  Banner,
  Divider,
  Spinner,
} from '@shopify/ui-extensions/checkout';

export default extension(
  'purchase.thank-you.block.render',
  (root, api) => {
    // Note: Thank You page uses orderConfirmation, not order
    const { orderConfirmation, sessionToken } = api;

    // Main container - always create it, we'll populate after API call
    const container = root.createComponent(BlockStack, { spacing: 'loose', padding: 'base' });
    root.appendChild(container);

    // Create a branded loading state
    const loadingCard = root.createComponent(BlockStack, {
      spacing: 'tight',
      padding: 'base',
      background: 'subdued',
      borderRadius: 'base',
      inlineAlignment: 'center'
    });
    container.appendChild(loadingCard);

    // Spinner row
    const spinnerRow = root.createComponent(InlineStack, {
      spacing: 'tight',
      blockAlignment: 'center',
      inlineAlignment: 'center'
    });
    spinnerRow.appendChild(root.createComponent(Spinner, { size: 'small' }));
    spinnerRow.appendChild(root.createComponent(Text, { emphasis: 'bold' }, 'LockerDrop'));
    loadingCard.appendChild(spinnerRow);

    // Status message - we'll update this text
    const statusText = root.createComponent(Text, {
      size: 'small',
      appearance: 'subdued'
    }, 'Confirming your locker reservation...');
    loadingCard.appendChild(statusText);

    // Store reference to update status text
    let currentStatusMessage = 'Confirming your locker reservation...';

    // Debug: Log what we have access to
    console.log('LockerDrop ThankYou: api keys:', Object.keys(api));
    console.log('LockerDrop ThankYou: orderConfirmation:', orderConfirmation);

    // orderConfirmation is a subscribable - access via .current or .value
    const orderData = orderConfirmation?.current || orderConfirmation?.value;
    console.log('LockerDrop ThankYou: orderData:', JSON.stringify(orderData));

    // Get order ID - orderData.number is a random string, not useful
    // orderData.order.id is a GID like "gid://shopify/OrderIdentity/6824621965561"
    // We need the numeric part which matches our shopify_order_id in the database
    let orderNumber = null;

    // Try .order.id first (GID format like gid://shopify/OrderIdentity/12345)
    // Extract the numeric ID which matches our shopify_order_id
    if (orderData?.order?.id) {
      orderNumber = orderData.order.id.toString().split('/').pop();
      console.log('LockerDrop ThankYou: Got shopify_order_id from GID:', orderNumber);
    }
    // Try direct id on orderData as fallback
    else if (orderData?.id) {
      orderNumber = orderData.id.toString().split('/').pop();
      console.log('LockerDrop ThankYou: Got ID from orderData.id:', orderNumber);
    }

    console.log('LockerDrop ThankYou: Resolved orderNumber:', orderNumber);

    // If we still don't have an order number, try subscribing
    if (!orderNumber && orderConfirmation?.subscribe) {
      console.log('LockerDrop ThankYou: Subscribing to orderConfirmation changes...');
      orderConfirmation.subscribe((data) => {
        console.log('LockerDrop ThankYou: subscription fired:', JSON.stringify(data));
        let num = null;
        // Use order.id GID to get the shopify_order_id
        if (data?.order?.id) {
          num = data.order.id.toString().split('/').pop();
        } else if (data?.id) {
          num = data.id.toString().split('/').pop();
        }
        if (num) {
          console.log('LockerDrop ThankYou: Got shopify_order_id from subscription:', num);
          checkLockerDropOrder(num);
        }
      });
    }

    // Check if this is a LockerDrop order via our API
    if (orderNumber) {
      checkLockerDropOrder(orderNumber);
    }

    // Update the loading status message
    function updateStatus(message) {
      // Remove old status text and add new one
      if (loadingCard.children.length > 1) {
        loadingCard.removeChild(loadingCard.children[1]);
      }
      const newStatusText = root.createComponent(Text, {
        size: 'small',
        appearance: 'subdued'
      }, message);
      loadingCard.appendChild(newStatusText);
    }

    async function checkLockerDropOrder(orderNum, retryCount = 0) {
      const MAX_RETRIES = 6;
      const RETRY_DELAY = 1500; // 1.5 seconds between retries

      // Progress messages for each retry
      const statusMessages = [
        'Confirming your locker reservation...',
        'Securing your pickup spot...',
        'Almost there...',
        'Finalizing details...',
        'Just a moment...',
        'Wrapping up...',
        'Completing reservation...'
      ];

      try {
        const token = await sessionToken.get();

        console.log(`LockerDrop ThankYou: Checking order ${orderNum} (attempt ${retryCount + 1}/${MAX_RETRIES + 1})`);

        if (!orderNum) {
          console.log('LockerDrop ThankYou: No order number provided');
          while (container.children.length > 0) {
            container.removeChild(container.children[0]);
          }
          return;
        }

        const response = await fetch(
          `https://app.lockerdrop.it/api/customer/order-status/${orderNum}`,
          {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            }
          }
        );

        if (!response.ok) {
          console.log('LockerDrop ThankYou: API returned', response.status);
          // Retry if we haven't exhausted retries (webhook might not have processed yet)
          if (retryCount < MAX_RETRIES) {
            updateStatus(statusMessages[Math.min(retryCount + 1, statusMessages.length - 1)]);
            console.log(`LockerDrop ThankYou: Retrying in ${RETRY_DELAY}ms...`);
            setTimeout(() => checkLockerDropOrder(orderNum, retryCount + 1), RETRY_DELAY);
            return;
          }
          // Exhausted retries - clear container
          while (container.children.length > 0) {
            container.removeChild(container.children[0]);
          }
          return;
        }

        const lockerStatus = await response.json();
        console.log('LockerDrop ThankYou: API response:', JSON.stringify(lockerStatus));

        // If no locker data, this isn't a LockerDrop order - but might just be timing
        if (!lockerStatus || !lockerStatus.isLockerDropOrder) {
          // Retry if we haven't exhausted retries (webhook might not have processed yet)
          if (retryCount < MAX_RETRIES) {
            updateStatus(statusMessages[Math.min(retryCount + 1, statusMessages.length - 1)]);
            console.log(`LockerDrop ThankYou: Order not found yet, retrying in ${RETRY_DELAY}ms...`);
            setTimeout(() => checkLockerDropOrder(orderNum, retryCount + 1), RETRY_DELAY);
            return;
          }
          console.log('LockerDrop ThankYou: Not a LockerDrop order (after retries)');
          while (container.children.length > 0) {
            container.removeChild(container.children[0]);
          }
          return;
        }

        // Success! Remove loading card and render UI
        while (container.children.length > 0) {
          container.removeChild(container.children[0]);
        }

        console.log('LockerDrop ThankYou: Rendering thank you UI');
        // Render the LockerDrop thank you UI
        renderThankYouUI(lockerStatus);
      } catch (err) {
        console.error('LockerDrop ThankYou: Error checking order:', err);
        // Retry on error too (might be transient)
        if (retryCount < MAX_RETRIES) {
          updateStatus(statusMessages[Math.min(retryCount + 1, statusMessages.length - 1)]);
          console.log(`LockerDrop ThankYou: Error occurred, retrying in ${RETRY_DELAY}ms...`);
          setTimeout(() => checkLockerDropOrder(orderNum, retryCount + 1), RETRY_DELAY);
          return;
        }
        // Clean up loading indicator safely
        while (container.children.length > 0) {
          container.removeChild(container.children[0]);
        }
      }
    }

    function renderThankYouUI(lockerStatus) {
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
      locationBlock.appendChild(root.createComponent(Text, {}, lockerStatus.lockerName || 'Your selected locker'));
      if (lockerStatus.lockerAddress) {
        locationBlock.appendChild(root.createComponent(Text, { size: 'small', appearance: 'subdued' }, lockerStatus.lockerAddress));
      }
      card.appendChild(locationBlock);

      // Expected Pickup Date
      if (lockerStatus.expectedPickupDate) {
        card.appendChild(root.createComponent(Divider));
        const dateBlock = root.createComponent(BlockStack, { spacing: 'extraTight' });
        dateBlock.appendChild(root.createComponent(Text, { emphasis: 'bold' }, 'Expected Pickup Date:'));
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
  }
);
