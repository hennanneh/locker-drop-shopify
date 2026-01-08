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
    const { shop, sessionToken, shippingAddress, lines, buyerJourney, deliveryGroups } = api;

    // State
    let lockers = [];
    let selectedLocker = null;
    let loading = true;
    let error = null;
    let useLockerPickup = false;
    let lockerDropShippingSelected = false; // Track if LockerDrop was selected via carrier service
    let requiredSize = null;
    let cartProducts = [];
    let availabilityError = null;

    // State for reservation
    let currentReservation = null;

    // Check if LockerDrop shipping is selected (from carrier service)
    function checkLockerDropShipping() {
      try {
        const groups = deliveryGroups?.current || [];
        console.log('LockerDrop: Checking delivery groups:', JSON.stringify(groups));

        for (const group of groups) {
          const selectedOption = group.selectedDeliveryOption;
          console.log('LockerDrop: Selected option:', JSON.stringify(selectedOption));

          if (selectedOption?.title?.toLowerCase().includes('lockerdrop') ||
              selectedOption?.handle?.toLowerCase().includes('lockerdrop') ||
              selectedOption?.code?.toLowerCase().includes('lockerdrop')) {
            console.log('LockerDrop: Detected LockerDrop shipping selection');
            return true;
          }
        }

        // Fallback: Check if address2 already contains LockerDrop info
        // This means the customer already selected a locker
        const address = shippingAddress?.current;
        if (address?.address2?.toLowerCase().includes('lockerdrop')) {
          console.log('LockerDrop: Detected via address2');
          return true;
        }
      } catch (err) {
        console.error('LockerDrop: Error checking delivery groups:', err);
      }
      return false;
    }

    // Subscribe to delivery group changes
    if (deliveryGroups?.subscribe) {
      deliveryGroups.subscribe(() => {
        const wasSelected = lockerDropShippingSelected;
        lockerDropShippingSelected = checkLockerDropShipping();

        // Auto-enable locker pickup UI if LockerDrop shipping selected
        if (lockerDropShippingSelected && !useLockerPickup) {
          useLockerPickup = true;
          // Auto-select first locker if available
          if (lockers.length > 0 && !selectedLocker) {
            selectedLocker = lockers[0];
          }
          render();
        }
      });
    }

    // Initial check
    lockerDropShippingSelected = checkLockerDropShipping();

    // Intercept checkout to RESERVE locker before payment (not just check availability)
    // This prevents pending_allocation by actually reserving the locker
    buyerJourney.intercept(async ({ canBlockProgress }) => {
      console.log('LockerDrop: buyerJourney.intercept called');
      console.log('LockerDrop: canBlockProgress =', canBlockProgress);
      console.log('LockerDrop: useLockerPickup =', useLockerPickup);
      console.log('LockerDrop: selectedLocker =', selectedLocker?.id || 'none');
      console.log('LockerDrop: lockers.length =', lockers.length);

      // Re-check if LockerDrop shipping is selected
      lockerDropShippingSelected = checkLockerDropShipping();
      console.log('LockerDrop: lockerDropShippingSelected =', lockerDropShippingSelected);

      // If LockerDrop shipping selected but NO lockers available at all, block checkout
      if (lockerDropShippingSelected && lockers.length === 0) {
        console.log('LockerDrop: BLOCKING - LockerDrop selected but no lockers available');
        if (canBlockProgress) {
          availabilityError = 'No lockers are currently available. Please select a different shipping method.';
          render();
          return {
            behavior: 'block',
            reason: 'No lockers available',
            errors: [
              {
                message: 'No lockers are currently available at this location. Please select a different shipping method to complete your order.',
              }
            ]
          };
        }
      }

      // If LockerDrop shipping selected via carrier service but no locker selected, block
      if (lockerDropShippingSelected && !selectedLocker) {
        console.log('LockerDrop: BLOCKING - LockerDrop selected but no locker chosen');
        if (canBlockProgress) {
          availabilityError = 'Please select a locker pickup location to continue.';
          useLockerPickup = true;
          render();
          return {
            behavior: 'block',
            reason: 'Locker selection required',
            errors: [
              {
                message: 'You selected LockerDrop shipping. Please select a pickup locker location below.',
              }
            ]
          };
        }
      }

      // Only proceed with reservation if user has locker pickup enabled AND selected a locker
      if (!useLockerPickup || !selectedLocker) {
        console.log('LockerDrop: ALLOWING - not using locker pickup or no locker selected');
        return { behavior: 'allow' };
      }

      // If we can't block progress, just allow
      if (!canBlockProgress) {
        console.log('LockerDrop: ALLOWING - cannot block progress');
        return { behavior: 'allow' };
      }

      console.log('LockerDrop: Attempting to reserve locker', selectedLocker.id);

      try {
        const token = await sessionToken.get();
        const address = shippingAddress.current;

        // CRITICAL: Actually reserve the locker, not just check availability
        // This creates a Harbor dropoff link and blocks the locker
        const reserveResponse = await fetch(
          'https://app.lockerdrop.it/api/checkout/reserve-locker',
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              locationId: selectedLocker.id,
              lockerTypeId: requiredSize ? (
                requiredSize === 'small' ? 1 :
                requiredSize === 'medium' ? 2 :
                requiredSize === 'large' ? 3 : 4
              ) : 2,
              shop: shop.myshopifyDomain,
              customerEmail: address?.email || null,
              customerPhone: address?.phone || null,
              pickupDate: null
            })
          }
        );

        const reserveData = await reserveResponse.json();

        if (!reserveResponse.ok || !reserveData.success) {
          // Reservation failed - locker not available
          console.error('Locker reservation failed:', reserveData);

          availabilityError = reserveData.message || 'No lockers available at this location. Please select a different pickup location.';

          // Clear selection and refresh lockers
          selectedLocker = null;
          render();

          // Re-fetch available lockers
          const addressQuery = encodeURIComponent(
            `${address?.address1 || ''} ${address?.city || ''} ${address?.provinceCode || ''} ${address?.zip || ''}`
          );
          cartProducts = getCartProducts();
          const productsParam = cartProducts.length > 0
            ? `&products=${encodeURIComponent(JSON.stringify(cartProducts))}`
            : '';

          const lockersResponse = await fetch(
            `https://app.lockerdrop.it/api/checkout/lockers?address=${addressQuery}&shop=${shop.myshopifyDomain}${productsParam}`,
            {
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
              }
            }
          );

          if (lockersResponse.ok) {
            const lockersData = await lockersResponse.json();
            lockers = lockersData.lockers || [];
            render();
          }

          return {
            behavior: 'block',
            reason: 'Locker not available',
            errors: [
              {
                message: 'The selected locker is no longer available. Please select a different pickup location or use regular shipping.',
              }
            ]
          };
        }

        // Reservation successful! Store reference and update address
        currentReservation = reserveData;
        availabilityError = null;

        // Update shipping address with reservation reference
        const sizeInfo = reserveData.lockerSize ? ` [Size: ${reserveData.lockerSize}]` : '';
        await api.applyShippingAddressChange({
          type: 'updateShippingAddress',
          address: {
            ...address,
            address2: `LockerDrop: ${selectedLocker.name} (ID: ${selectedLocker.id}) [Res: ${reserveData.reservationRef}]${sizeInfo}`
          }
        });

        console.log('Locker reserved successfully:', reserveData.reservationRef);
        return { behavior: 'allow' };

      } catch (err) {
        console.error('Error reserving locker:', err);
        // On error, block checkout to prevent pending_allocation
        availabilityError = 'Failed to reserve locker. Please try again.';
        render();

        return {
          behavior: 'block',
          reason: 'Reservation error',
          errors: [
            {
              message: 'Unable to reserve locker. Please try again or select a different pickup location.',
            }
          ]
        };
      }
    });

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

      // Show availability error if locker became unavailable
      if (availabilityError) {
        container.appendChild(
          root.createComponent(Banner, { status: 'critical' },
            root.createComponent(Text, null, availabilityError)
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

        // If LockerDrop shipping was selected via carrier service, show critical warning
        if (lockerDropShippingSelected) {
          container.appendChild(
            root.createComponent(Banner, { status: 'critical' },
              root.createComponent(Text, null,
                'No lockers are currently available. Please select a different shipping method to continue.'
              )
            )
          );
        } else {
          container.appendChild(
            root.createComponent(Banner, { status: 'info' },
              root.createComponent(Text, null, noLockersMessage)
            )
          );
        }
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
