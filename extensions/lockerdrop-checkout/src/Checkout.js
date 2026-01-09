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
} from '@shopify/ui-extensions/checkout';

export default extension(
  'purchase.checkout.block.render',
  (root, api) => {
    const { shop, sessionToken, shippingAddress, lines, buyerJourney, deliveryGroups, settings } = api;

    // Read merchant settings
    const showExpanded = settings?.current?.show_expanded ?? true;
    const customTitle = settings?.current?.title || 'LockerDrop Pickup';

    // State
    let lockers = [];
    let selectedLocker = null;
    let loading = true;
    let error = null;
    let useLockerPickup = false; // Only enable when user selects LockerDrop shipping or clicks a locker
    let lockerDropShippingSelected = false; // Track if LockerDrop was selected via carrier service
    let requiredSize = null;
    let cartProducts = [];
    let availabilityError = null;
    let pickupDate = null; // Expected pickup date from API
    let showAllLockers = false; // Collapsed by default - show only best choice

    // Track previous address to avoid unnecessary re-fetches
    let lastFetchedAddress = null;
    let fetchTimeout = null;

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
      } catch (err) {
        console.error('LockerDrop: Error checking delivery groups:', err);
      }
      return false;
    }

    // Subscribe to delivery group changes (just track state, don't re-render)
    if (deliveryGroups?.subscribe) {
      deliveryGroups.subscribe(() => {
        lockerDropShippingSelected = checkLockerDropShipping();
        // Auto-select first locker if LockerDrop selected and no locker chosen yet
        if (lockerDropShippingSelected && lockers.length > 0 && !selectedLocker) {
          selectedLocker = lockers[0];
          useLockerPickup = true;
        }
      });
    }

    // Initial check
    lockerDropShippingSelected = checkLockerDropShipping();

    // Intercept checkout to validate locker selection
    // NOTE: We no longer block on reservation failures - order webhook will handle allocation
    buyerJourney.intercept(async ({ canBlockProgress }) => {
      console.log('LockerDrop: buyerJourney.intercept called');

      // Re-check if LockerDrop shipping is selected
      lockerDropShippingSelected = checkLockerDropShipping();

      // If LockerDrop shipping selected via carrier service but no locker selected, prompt selection
      if (lockerDropShippingSelected && !selectedLocker && canBlockProgress) {
        console.log('LockerDrop: Prompting locker selection');
        useLockerPickup = true;
        render();
        return {
          behavior: 'block',
          reason: 'Locker selection required',
          errors: [
            {
              message: 'Please select a locker pickup location to continue.',
            }
          ]
        };
      }

      // If user selected locker pickup, ensure the attribute is set
      if (useLockerPickup && selectedLocker) {
        console.log('LockerDrop: Setting locker attribute for', selectedLocker.name);

        const sizeInfo = requiredSize ? ` [Size: ${requiredSize}]` : '';
        const lockerInfo = `${selectedLocker.name} (ID: ${selectedLocker.id})${sizeInfo}`;

        try {
          await api.applyAttributeChange({
            type: 'updateAttribute',
            key: 'LockerDrop Pickup',
            value: lockerInfo
          });
        } catch (err) {
          console.error('Error setting locker attribute:', err);
        }
      }

      // Always allow checkout to proceed - order webhook handles locker allocation
      return { behavior: 'allow' };
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
      headerRow.appendChild(root.createComponent(Heading, { level: 2 }, customTitle));

      const freeLabel = root.createComponent(View, { inlineAlignment: 'end' });
      freeLabel.appendChild(root.createComponent(Text, { appearance: 'success', emphasis: 'bold' }, 'FREE'));
      headerRow.appendChild(freeLabel);

      header.appendChild(
        root.createComponent(Text, { size: 'small' },
          '✓ Skip shipping fees  ✓ Pick up on YOUR schedule (24/7)  ✓ Secure contactless'
        )
      );
      header.appendChild(
        root.createComponent(Text, { appearance: 'subdued', size: 'extraSmall' },
          'Changed your mind? No problem - we hold it for 5 days'
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

      // Content based on state - skip skeleton to reduce flashing
      if (loading && lockers.length === 0) {
        // Only show loading on very first load when we have nothing to show
        container.appendChild(
          root.createComponent(Text, { appearance: 'subdued', size: 'small' }, 'Finding pickup locations...')
        );
      } else if (error) {
        container.appendChild(
          root.createComponent(Banner, { status: 'warning' },
            root.createComponent(Text, null, error)
          )
        );
      } else if (lockers.length === 0) {
        // Check if we have an address yet
        const address = shippingAddress.current;
        const hasAddress = address?.zip || address?.city;

        if (!hasAddress) {
          // No address entered yet
          container.appendChild(
            root.createComponent(Banner, { status: 'info' },
              root.createComponent(Text, null,
                'Enter your shipping address above to find locker pickup locations near you.'
              )
            )
          );
        } else if (lockerDropShippingSelected) {
          // LockerDrop shipping was selected but no lockers found
          container.appendChild(
            root.createComponent(Banner, { status: 'critical' },
              root.createComponent(Text, null,
                'No lockers are currently available. Please select a different shipping method to continue.'
              )
            )
          );
        } else {
          // Address entered but no lockers found
          const noLockersMessage = requiredSize
            ? `No locker locations with ${requiredSize} or larger lockers available near you.`
            : 'No locker pickup locations found near your address. Try a different zip code or use regular shipping.';
          container.appendChild(
            root.createComponent(Banner, { status: 'info' },
              root.createComponent(Text, null, noLockersMessage)
            )
          );
        }
      } else {
        // Always show locker selection
        const optionsContainer = root.createComponent(BlockStack, { spacing: 'base' });
        container.appendChild(optionsContainer);

        const lockerList = root.createComponent(BlockStack, { spacing: 'tight' });
        optionsContainer.appendChild(lockerList);

        // Determine which lockers to show
        const lockersToShow = showAllLockers ? lockers.slice(0, 5) : [lockers[0]];

        lockersToShow.forEach((locker, index) => {
          const isSelected = selectedLocker?.id === locker.id;
          const isFirstLocker = lockers.indexOf(locker) === 0;

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

          // Name row with distance and badge
          const nameRow = root.createComponent(InlineStack, { spacing: 'tight', blockAlignment: 'center' });
          lockerInfo.appendChild(nameRow);
          nameRow.appendChild(root.createComponent(Text, { emphasis: 'bold' }, locker.name));
          if (locker.distance) {
            nameRow.appendChild(
              root.createComponent(Text, { appearance: 'subdued', size: 'small' }, `(${locker.distance} mi)`)
            );
          }
          // Show CLOSEST badge for first locker
          if (isFirstLocker) {
            nameRow.appendChild(
              root.createComponent(Text, { size: 'extraSmall', appearance: 'success', emphasis: 'bold' }, 'CLOSEST')
            );
          }

          // Address
          lockerInfo.appendChild(
            root.createComponent(Text, { size: 'small', appearance: 'subdued' }, locker.address)
          );

          // Pickup date (prominent)
          if (pickupDate) {
            lockerInfo.appendChild(
              root.createComponent(Text, { size: 'small', appearance: 'success', emphasis: 'bold' },
                `Ready ${pickupDate}`
              )
            );
          }

          // Availability info
          const sizeLabel = locker.requiredSize ? ` (${locker.requiredSize}+)` : '';
          lockerInfo.appendChild(
            root.createComponent(Text, { size: 'extraSmall', appearance: 'subdued' },
              `${locker.availableCount} locker${locker.availableCount !== 1 ? 's' : ''} available${sizeLabel}`
            )
          );
        });

        // Show "See more locations" button if there are more lockers and not expanded
        if (!showAllLockers && lockers.length > 1) {
          const moreButton = root.createComponent(Button, {
            kind: 'plain',
            onPress: () => {
              showAllLockers = true;
              render();
            }
          }, `See ${lockers.length - 1} more location${lockers.length > 2 ? 's' : ''}`);
          optionsContainer.appendChild(moreButton);
        }
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
    async function fetchLockers(forceRefresh = false) {
      const address = shippingAddress.current;
      if (!address?.zip && !address?.city) {
        loading = false;
        render();
        return;
      }

      // Build address key (excluding address2 which we update with locker info)
      const addressKey = `${address?.address1 || ''}|${address?.city || ''}|${address?.provinceCode || ''}|${address?.zip || ''}`;

      // Skip fetch if address hasn't changed (just address2 updated)
      if (!forceRefresh && lastFetchedAddress === addressKey && lockers.length > 0) {
        console.log('LockerDrop: Skipping fetch - address unchanged');
        return;
      }

      // Only show loading spinner on initial load, not refreshes
      const isInitialLoad = lockers.length === 0;
      if (isInitialLoad) {
        loading = true;
        error = null;
        render();
      }

      try {
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
        pickupDate = data.pickupDate || null;
        lastFetchedAddress = addressKey;

        // Clear any previous availability error when lockers load successfully
        if (lockers.length > 0) {
          availabilityError = null;
          // Only auto-select first locker if LockerDrop shipping is already selected
          if (!selectedLocker && lockerDropShippingSelected) {
            selectedLocker = lockers[0];
          }
        }
      } catch (err) {
        console.error('Error fetching lockers:', err);
        // Only show error if we don't already have lockers
        if (lockers.length === 0) {
          error = 'Unable to load pickup locations';
        }
      } finally {
        loading = false;
        render();
      }
    }

    // Handle locker selection
    function selectLocker(locker) {
      selectedLocker = locker;
      useLockerPickup = true;
      availabilityError = null; // Clear any error when user selects a locker

      // Store locker info in order attributes (preserves customer's address2 like apt number)
      const sizeInfo = requiredSize ? ` [Size: ${requiredSize}]` : '';
      const lockerInfo = `${locker.name} (ID: ${locker.id})${sizeInfo}`;

      api.applyAttributeChange({
        type: 'updateAttribute',
        key: 'LockerDrop Pickup',
        value: lockerInfo
      }).catch(err => console.error('Error setting locker attribute:', err));

      render();
    }

    // Subscribe to address changes (debounced to reduce flashing)
    shippingAddress.subscribe((newAddress) => {
      if (newAddress?.zip || newAddress?.city) {
        if (fetchTimeout) clearTimeout(fetchTimeout);
        fetchTimeout = setTimeout(() => fetchLockers(), 300);
      }
    });

    // Subscribe to cart changes (different items may require different locker size)
    lines.subscribe(() => {
      const address = shippingAddress.current;
      if (address?.zip || address?.city) {
        // Reset selection when cart changes - size requirements may have changed
        selectedLocker = null;
        lastFetchedAddress = null; // Force re-fetch
        fetchLockers(true);
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
