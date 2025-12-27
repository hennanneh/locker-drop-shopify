import {
  extension,
  BlockStack,
  InlineStack,
  View,
  Text,
  Heading,
  Button,
  Divider,
  Icon,
  Banner,
  Pressable,
  SkeletonText,
} from '@shopify/ui-extensions/checkout';

export default extension(
  'purchase.checkout.delivery-address.render-after',
  (root, api) => {
    const { shop, sessionToken, shippingAddress, lines } = api;

    // State
    let lockers = [];
    let selectedLocker = null;
    let loading = true;
    let error = null;
    let useLockerPickup = false;
    let requiredSize = null;
    let cartProducts = [];

    // Create main container
    const container = root.createComponent(BlockStack, { spacing: 'loose', padding: 'base' });
    root.appendChild(container);

    // Render function
    function render() {
      // Clear container
      while (container.children.length > 0) {
        container.removeChild(container.children[0]);
      }

      // Divider
      container.appendChild(root.createComponent(Divider));

      // Header section
      const header = root.createComponent(BlockStack, { spacing: 'tight' });
      container.appendChild(header);

      const headerRow = root.createComponent(InlineStack, { spacing: 'tight', blockAlignment: 'center' });
      header.appendChild(headerRow);

      headerRow.appendChild(root.createComponent(Icon, { source: 'delivery', size: 'base' }));
      headerRow.appendChild(root.createComponent(Heading, { level: 2 }, 'LockerDrop Pickup'));

      const freeLabel = root.createComponent(View, { inlineAlignment: 'end' });
      freeLabel.appendChild(root.createComponent(Text, { appearance: 'success', emphasis: 'bold' }, 'FREE'));
      headerRow.appendChild(freeLabel);

      header.appendChild(
        root.createComponent(Text, { appearance: 'subdued', size: 'small' },
          'Pick up your order from a secure locker near you - available 24/7'
        )
      );

      // Show required size info if available
      if (requiredSize && lockers.length > 0) {
        header.appendChild(
          root.createComponent(Text, { appearance: 'subdued', size: 'small' },
            `Your order requires a ${requiredSize} locker or larger`
          )
        );
      }

      // Content based on state
      if (loading) {
        const skeleton = root.createComponent(BlockStack, { spacing: 'tight' });
        skeleton.appendChild(root.createComponent(SkeletonText, { inlineSize: 'large' }));
        skeleton.appendChild(root.createComponent(SkeletonText, { inlineSize: 'large' }));
        skeleton.appendChild(root.createComponent(SkeletonText, { inlineSize: 'base' }));
        container.appendChild(skeleton);
      } else if (error) {
        container.appendChild(
          root.createComponent(Banner, { status: 'warning' },
            root.createComponent(Text, null, error)
          )
        );
      } else if (lockers.length === 0) {
        // No lockers available - show appropriate message
        const noLockersMessage = requiredSize
          ? `No locker locations with ${requiredSize} or larger lockers available for your order. Your items require a ${requiredSize} locker.`
          : 'No locker locations available near your address';

        container.appendChild(
          root.createComponent(Banner, { status: 'info' },
            root.createComponent(Text, null, noLockersMessage)
          )
        );
      } else if (!useLockerPickup) {
        // Show button to enable locker pickup
        const enableButton = root.createComponent(Button, {
          kind: 'secondary',
          onPress: () => {
            useLockerPickup = true;
            render();
          }
        }, 'Choose locker pickup instead');
        container.appendChild(enableButton);
      } else {
        // Show locker options
        const optionsContainer = root.createComponent(BlockStack, { spacing: 'base' });
        container.appendChild(optionsContainer);

        const lockerList = root.createComponent(BlockStack, { spacing: 'tight' });
        optionsContainer.appendChild(lockerList);

        // Show up to 3 lockers
        lockers.slice(0, 3).forEach((locker) => {
          const isSelected = selectedLocker?.id === locker.id;

          const option = root.createComponent(Pressable, {
            onPress: () => selectLocker(locker),
            border: isSelected ? 'base' : 'none',
            borderRadius: 'base',
            padding: 'base',
            background: isSelected ? 'subdued' : 'transparent'
          });
          lockerList.appendChild(option);

          const optionContent = root.createComponent(InlineStack, { spacing: 'base', blockAlignment: 'start' });
          option.appendChild(optionContent);

          // Radio icon
          const radioIcon = root.createComponent(View);
          radioIcon.appendChild(
            root.createComponent(Icon, {
              source: isSelected ? 'checkCircle' : 'circle',
              size: 'base',
              appearance: isSelected ? 'accent' : 'subdued'
            })
          );
          optionContent.appendChild(radioIcon);

          // Locker info
          const lockerInfo = root.createComponent(BlockStack, { spacing: 'extraTight' });
          optionContent.appendChild(lockerInfo);

          const nameRow = root.createComponent(InlineStack, { spacing: 'tight', blockAlignment: 'center' });
          lockerInfo.appendChild(nameRow);
          nameRow.appendChild(root.createComponent(Text, { emphasis: 'bold' }, locker.name));
          if (locker.distance) {
            nameRow.appendChild(
              root.createComponent(Text, { appearance: 'subdued', size: 'small' }, `(${locker.distance} mi)`)
            );
          }

          lockerInfo.appendChild(
            root.createComponent(Text, { size: 'small', appearance: 'subdued' }, locker.address)
          );

          const availabilityRow = root.createComponent(InlineStack, { spacing: 'tight' });
          lockerInfo.appendChild(availabilityRow);
          const sizeLabel = locker.requiredSize ? ` (${locker.requiredSize}+)` : '';
          availabilityRow.appendChild(
            root.createComponent(Text, { size: 'small', appearance: 'success' },
              `${locker.availableCount} locker${locker.availableCount !== 1 ? 's' : ''} available${sizeLabel}`
            )
          );
        });

        // Cancel button
        const cancelButton = root.createComponent(Button, {
          kind: 'plain',
          onPress: () => {
            useLockerPickup = false;
            selectedLocker = null;
            render();
          }
        }, 'Use regular shipping instead');
        optionsContainer.appendChild(cancelButton);
      }
    }

    // Get cart products for size calculation
    function getCartProducts() {
      try {
        const currentLines = lines.current || [];
        return currentLines.map(line => ({
          productId: line.merchandise?.product?.id?.replace('gid://shopify/Product/', ''),
          variantId: line.merchandise?.id?.replace('gid://shopify/ProductVariant/', ''),
          title: line.merchandise?.title || line.merchandise?.product?.title,
          quantity: line.quantity
        })).filter(p => p.productId);
      } catch (err) {
        console.error('Error getting cart products:', err);
        return [];
      }
    }

    // Fetch lockers from API
    async function fetchLockers() {
      loading = true;
      error = null;
      render();

      try {
        const address = shippingAddress.current;
        if (!address?.zip && !address?.city) {
          loading = false;
          render();
          return;
        }

        const token = await sessionToken.get();
        const addressQuery = encodeURIComponent(
          `${address?.address1 || ''} ${address?.city || ''} ${address?.provinceCode || ''} ${address?.zip || ''}`
        );

        // Get cart products for size calculation
        cartProducts = getCartProducts();
        const productsParam = cartProducts.length > 0
          ? `&products=${encodeURIComponent(JSON.stringify(cartProducts))}`
          : '';

        const response = await fetch(
          `https://app.lockerdrop.it/api/checkout/lockers?address=${addressQuery}&shop=${shop.myshopifyDomain}${productsParam}`,
          {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            }
          }
        );

        if (!response.ok) {
          throw new Error('Failed to fetch lockers');
        }

        const data = await response.json();
        lockers = data.lockers || [];
        requiredSize = data.requiredSize || null;

        if (lockers.length > 0 && !selectedLocker) {
          selectedLocker = lockers[0];
        }
      } catch (err) {
        console.error('Error fetching lockers:', err);
        error = 'Unable to load pickup locations';
      } finally {
        loading = false;
        render();
      }
    }

    // Handle locker selection
    function selectLocker(locker) {
      selectedLocker = locker;
      useLockerPickup = true;

      // Update shipping address with locker info and required size
      const address = shippingAddress.current;
      const sizeInfo = requiredSize ? ` [Size: ${requiredSize}]` : '';
      api.applyShippingAddressChange({
        type: 'updateShippingAddress',
        address: {
          ...address,
          address2: `LockerDrop: ${locker.name} (ID: ${locker.id})${sizeInfo}`
        }
      }).catch(err => console.error('Error updating address:', err));

      render();
    }

    // Subscribe to address changes
    shippingAddress.subscribe((newAddress) => {
      if (newAddress?.zip || newAddress?.city) {
        fetchLockers();
      }
    });

    // Subscribe to cart changes (different items may require different locker size)
    lines.subscribe(() => {
      const address = shippingAddress.current;
      if (address?.zip || address?.city) {
        // Reset selection when cart changes - size requirements may have changed
        selectedLocker = null;
        fetchLockers();
      }
    });

    // Initial fetch if address exists
    const currentAddress = shippingAddress.current;
    if (currentAddress?.zip || currentAddress?.city) {
      fetchLockers();
    } else {
      loading = false;
      render();
    }
  }
);
