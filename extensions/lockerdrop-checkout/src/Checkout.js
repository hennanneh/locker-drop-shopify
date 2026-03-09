import {
  extension,
  BlockStack,
  InlineStack,
  View,
  Text,
  Heading,
  Button,
  Banner,
  Divider,
  Pressable,
  Icon,
  Badge,
} from '@shopify/ui-extensions/checkout';

// Locker selection extension
extension(
  'purchase.checkout.block.render',
  (root, api) => {
    const { shop, shippingAddress, buyerJourney, settings, deliveryGroups, lines } = api;

    // Merchant settings with defaults
    function getSetting(key, defaultValue) {
      const val = settings?.current?.[key];
      return val !== undefined && val !== null && val !== '' ? val : defaultValue;
    }

    const customTitle = getSetting('title', 'LockerDrop Pickup');
    const badgeText = getSetting('badge_text', 'FREE');
    const showBadge = getSetting('show_badge', true);
    const showBenefits = getSetting('show_benefits', true);
    const benefitsText = getSetting('benefits_text', 'Pick up 24/7 \u00B7 Secure & contactless');
    const showAvailability = getSetting('show_availability', true);
    const compactMode = getSetting('compact_mode', false);

    // Spacing helpers based on compact mode
    const sp = compactMode ? 'tight' : 'base';
    const spLoose = compactMode ? 'base' : 'loose';

    // State
    let lockers = [];
    let selectedLocker = null;
    let loading = true;
    let error = null;
    let showAllLockers = false;
    let pickupDate = null;
    let availableDates = [];
    let selectedDate = null;

    // Create container
    const container = root.createComponent(BlockStack, { spacing: sp, padding: sp });
    root.appendChild(container);

    // Check if LockerDrop shipping is selected
    function isLockerDropShippingSelected() {
      try {
        const groups = deliveryGroups?.current || [];
        for (const group of groups) {
          const selectedHandle = group.selectedDeliveryOption?.handle;
          if (!selectedHandle) continue;
          const deliveryOptions = group.deliveryOptions || [];
          const selectedOption = deliveryOptions.find(opt => opt.handle === selectedHandle);
          if (!selectedOption) continue;
          if (selectedOption.title?.toLowerCase().includes('lockerdrop') ||
              selectedOption.code?.toLowerCase().includes('lockerdrop')) {
            return true;
          }
        }
      } catch (err) {
        console.error('LockerDrop: Error checking delivery groups:', err);
      }
      return false;
    }

    // Render UI
    function render() {
      while (container.children.length > 0) {
        container.removeChild(container.children[0]);
      }

      // Only show the widget when LockerDrop shipping is selected
      if (!isLockerDropShippingSelected()) {
        return;
      }

      // ── Header ──
      container.appendChild(root.createComponent(Divider));

      const headerBlock = root.createComponent(BlockStack, { spacing: 'extraTight' });
      container.appendChild(headerBlock);

      const headerRow = root.createComponent(InlineStack, { spacing: 'tight', blockAlignment: 'center' });
      headerBlock.appendChild(headerRow);

      headerRow.appendChild(root.createComponent(Icon, { source: 'delivery', size: 'base', appearance: 'accent' }));
      headerRow.appendChild(root.createComponent(Heading, { level: 2 }, customTitle));

      if (showBadge && badgeText) {
        headerRow.appendChild(root.createComponent(Badge, { tone: 'default' }, badgeText));
      }

      if (showBenefits) {
        headerBlock.appendChild(root.createComponent(Text, { size: 'small', appearance: 'subdued' }, benefitsText));
      }

      // ── Check address ──
      const address = shippingAddress.current;
      const hasAddress = address?.zip || address?.city;

      if (!hasAddress) {
        const placeholder = root.createComponent(BlockStack, {
          padding: sp,
          background: 'subdued',
          borderRadius: 'base',
          spacing: 'tight',
          inlineAlignment: 'center'
        });
        container.appendChild(placeholder);
        const placeholderRow = root.createComponent(InlineStack, { spacing: 'tight', blockAlignment: 'center', inlineAlignment: 'center' });
        placeholderRow.appendChild(root.createComponent(Icon, { source: 'marker', size: 'small', appearance: 'subdued' }));
        placeholderRow.appendChild(root.createComponent(Text, { appearance: 'subdued' }, 'Enter your address to see nearby pickup lockers'));
        placeholder.appendChild(placeholderRow);
        return;
      }

      // ── Loading ──
      if (loading) {
        const loadingView = root.createComponent(BlockStack, {
          padding: sp,
          background: 'subdued',
          borderRadius: 'base',
          spacing: 'tight',
          inlineAlignment: 'center'
        });
        container.appendChild(loadingView);
        const loadingRow = root.createComponent(InlineStack, { spacing: 'tight', blockAlignment: 'center', inlineAlignment: 'center' });
        loadingRow.appendChild(root.createComponent(Icon, { source: 'delivery', size: 'small', appearance: 'accent' }));
        loadingRow.appendChild(root.createComponent(Text, { appearance: 'subdued' }, 'Finding pickup locations near you...'));
        loadingView.appendChild(loadingRow);
        return;
      }

      // ── Error ──
      if (error) {
        const errorBlock = root.createComponent(BlockStack, { spacing: 'tight' });
        container.appendChild(errorBlock);
        errorBlock.appendChild(root.createComponent(Banner, { status: 'warning' }, root.createComponent(Text, null, error)));
        errorBlock.appendChild(
          root.createComponent(Button, { kind: 'secondary', onPress: () => {
            error = null;
            loading = true;
            render();
            fetchLockers();
          }}, 'Retry')
        );
        return;
      }

      // ── No lockers ──
      if (lockers.length === 0) {
        container.appendChild(
          root.createComponent(Banner, { status: 'info' },
            root.createComponent(Text, null, 'No pickup lockers available near your address')
          )
        );
        return;
      }

      // ── Selected locker view ──
      if (selectedLocker) {
        const lockerDropSelected = isLockerDropShippingSelected();

        if (!lockerDropSelected) {
          container.appendChild(root.createComponent(Banner, { status: 'warning' },
            root.createComponent(Text, null, 'Please select "LockerDrop Pickup" as your shipping method above.')));
        }

        // Selected locker card
        const selectedCard = root.createComponent(BlockStack, {
          spacing: 'tight',
          padding: sp,
          background: 'subdued',
          borderRadius: 'base',
          border: 'base'
        });
        container.appendChild(selectedCard);

        // Selected header row with checkmark
        const selectedHeader = root.createComponent(InlineStack, { spacing: 'tight', blockAlignment: 'center' });
        selectedCard.appendChild(selectedHeader);
        selectedHeader.appendChild(root.createComponent(Icon, { source: 'checkmark', size: 'base', appearance: 'success' }));
        selectedHeader.appendChild(root.createComponent(Text, { emphasis: 'bold', appearance: 'success' }, selectedLocker.name));
        if (selectedLocker.distance) {
          selectedHeader.appendChild(root.createComponent(Text, { size: 'small', appearance: 'subdued' }, `${selectedLocker.distance} mi`));
        }

        // Address
        const addressRow = root.createComponent(InlineStack, { spacing: 'tight', blockAlignment: 'center' });
        selectedCard.appendChild(addressRow);
        addressRow.appendChild(root.createComponent(Icon, { source: 'marker', size: 'small', appearance: 'subdued' }));
        addressRow.appendChild(root.createComponent(Text, { size: 'small', appearance: 'subdued' }, selectedLocker.address));

        // Pickup date
        const displayDate = selectedDate?.display || pickupDate;
        if (displayDate) {
          const dateRow = root.createComponent(InlineStack, { spacing: 'tight', blockAlignment: 'center' });
          selectedCard.appendChild(dateRow);
          dateRow.appendChild(root.createComponent(Icon, { source: 'calendar', size: 'small', appearance: 'success' }));
          dateRow.appendChild(root.createComponent(Text, { size: 'small', appearance: 'success', emphasis: 'bold' }, `Ready ${displayDate}`));
        }

        // Hold time info
        const holdRow = root.createComponent(InlineStack, { spacing: 'tight', blockAlignment: 'center' });
        selectedCard.appendChild(holdRow);
        holdRow.appendChild(root.createComponent(Icon, { source: 'lock', size: 'small', appearance: 'subdued' }));
        holdRow.appendChild(root.createComponent(Text, { size: 'extraSmall', appearance: 'subdued' }, 'Held securely for up to 5 days'));

        // Date picker (if dates available)
        if (availableDates.length > 1) {
          container.appendChild(root.createComponent(Text, { size: 'small', emphasis: 'bold' }, 'Choose pickup date:'));

          const datePickerRow = root.createComponent(InlineStack, { spacing: 'tight' });
          container.appendChild(datePickerRow);

          availableDates.slice(0, 5).forEach((date) => {
            const isSelected = selectedDate?.date === date.date;
            datePickerRow.appendChild(
              root.createComponent(Pressable, {
                onPress: () => {
                  selectedDate = date;
                  updateAttribute();
                  render();
                },
                border: 'base',
                borderRadius: 'base',
                padding: 'tight',
                background: isSelected ? 'subdued' : 'transparent'
              },
                root.createComponent(BlockStack, { spacing: 'none', inlineAlignment: 'center' },
                  root.createComponent(Text, { size: 'small', emphasis: isSelected ? 'bold' : undefined }, date.dayName),
                  root.createComponent(Text, { size: 'extraSmall', appearance: isSelected ? 'accent' : 'subdued' }, date.monthDay),
                  isSelected ? root.createComponent(Icon, { source: 'checkmark', size: 'small', appearance: 'accent' }) : root.createComponent(Text, { size: 'extraSmall' }, ' ')
                )
              )
            );
          });
        }

        container.appendChild(
          root.createComponent(Button, { kind: 'plain', onPress: () => {
            selectedLocker = null;
            selectedDate = null;
            api.applyAttributeChange({ type: 'updateAttribute', key: 'LockerDrop Pickup', value: '' }).catch(() => {});
            render();
          }}, 'Change location')
        );
      } else {
        // ── Locker list ──
        const list = root.createComponent(BlockStack, { spacing: 'tight' });
        container.appendChild(list);

        const lockersToShow = showAllLockers ? lockers : lockers.slice(0, 3);

        lockersToShow.forEach((locker, i) => {
          const isClosest = i === 0;

          // Card-style pressable for each locker
          const card = root.createComponent(Pressable, {
            onPress: () => {
              selectedLocker = locker;
              if (availableDates.length > 0 && !selectedDate) {
                selectedDate = availableDates[0];
              }
              updateAttribute();
              render();
            },
            border: 'base',
            borderRadius: 'base',
            padding: sp
          });
          list.appendChild(card);

          const cardContent = root.createComponent(InlineStack, { spacing: sp, blockAlignment: 'start' });
          card.appendChild(cardContent);

          // Radio-style icon
          cardContent.appendChild(
            root.createComponent(View, { padding: ['extraTight', 'none', 'none', 'none'] },
              root.createComponent(Icon, { source: 'hollowCircle', size: 'small', appearance: 'subdued' })
            )
          );

          // Locker details
          const details = root.createComponent(BlockStack, { spacing: 'extraTight' });
          cardContent.appendChild(details);

          // Name row with distance and closest badge
          const nameRow = root.createComponent(InlineStack, { spacing: 'tight', blockAlignment: 'center' });
          details.appendChild(nameRow);
          nameRow.appendChild(root.createComponent(Text, { emphasis: 'bold' }, locker.name));

          if (locker.distance) {
            nameRow.appendChild(root.createComponent(Text, { size: 'small', appearance: 'subdued' }, `(${locker.distance} mi)`));
          }

          if (isClosest) {
            nameRow.appendChild(root.createComponent(Badge, { tone: 'default' }, 'CLOSEST'));
          }

          // Address
          details.appendChild(root.createComponent(Text, { size: 'small', appearance: 'subdued' }, locker.address));

          // Availability count
          if (showAvailability && locker.availableCount !== undefined) {
            const availRow = root.createComponent(InlineStack, { spacing: 'extraTight', blockAlignment: 'center' });
            details.appendChild(availRow);
            availRow.appendChild(root.createComponent(Icon, { source: 'success', size: 'extraSmall', appearance: 'success' }));
            availRow.appendChild(root.createComponent(Text, { size: 'small', appearance: 'success' },
              `${locker.availableCount} locker${locker.availableCount !== 1 ? 's' : ''} available`
            ));
          }
        });

        // Pickup date info
        if (pickupDate) {
          const dateInfoRow = root.createComponent(InlineStack, { spacing: 'tight', blockAlignment: 'center' });
          container.appendChild(dateInfoRow);
          dateInfoRow.appendChild(root.createComponent(Icon, { source: 'calendar', size: 'small', appearance: 'success' }));
          dateInfoRow.appendChild(root.createComponent(Text, { size: 'small', appearance: 'success' }, `Ready ${pickupDate}`));
        }

        if (!showAllLockers && lockers.length > 3) {
          container.appendChild(
            root.createComponent(Button, { kind: 'plain', onPress: () => { showAllLockers = true; render(); }},
              `Show ${lockers.length - 3} more location${lockers.length > 4 ? 's' : ''}`)
          );
        }
      }
    }

    // Update order attribute
    function updateAttribute() {
      if (!selectedLocker) return;
      const dateInfo = selectedDate ? ` | Pickup: ${selectedDate.date}` : '';
      const value = `${selectedLocker.name} (ID: ${selectedLocker.id})${dateInfo}`;
      api.applyAttributeChange({ type: 'updateAttribute', key: 'LockerDrop Pickup', value }).catch(() => {});
    }

    // Intercept checkout
    buyerJourney.intercept(async ({ canBlockProgress }) => {
      if (!canBlockProgress) return { behavior: 'allow' };

      const lockerDropSelected = isLockerDropShippingSelected();

      // Block: selected a locker but chose a different shipping method
      if (selectedLocker && !lockerDropSelected) {
        return {
          behavior: 'block',
          reason: 'Shipping method mismatch',
          errors: [{ message: 'You selected a locker but chose a different shipping method. Please select "LockerDrop Pickup" as your shipping method, or click "Change location" to remove your locker selection.' }]
        };
      }

      // Block: selected LockerDrop shipping but didn't pick a locker
      if (lockerDropSelected && !selectedLocker) {
        return {
          behavior: 'block',
          reason: 'No locker selected',
          errors: [{ message: 'Please select a pickup locker location below, or choose a different shipping method.' }]
        };
      }

      return { behavior: 'allow' };
    });

    // Subscribe to delivery group changes - re-render to show/hide widget
    if (deliveryGroups?.subscribe) {
      deliveryGroups.subscribe(() => { render(); });
    }

    // Fetch with timeout helper
    async function fetchWithTimeout(url, timeoutMs = 10000) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);
        return response;
      } catch (err) {
        clearTimeout(timeoutId);
        throw err;
      }
    }

    // Fetch lockers and dates with retry
    let retryCount = 0;
    const MAX_RETRIES = 2;

    async function fetchLockers() {
      const address = shippingAddress.current;
      if (!address?.zip && !address?.city) {
        loading = false;
        render();
        return;
      }

      error = null; // Clear any previous error

      try {
        const addressQuery = encodeURIComponent(`${address?.city || ''} ${address?.provinceCode || ''} ${address?.zip || ''}`);

        // Pass cart line items so the server can check availability for the correct locker size
        let productsParam = '';
        try {
          const cartLines = lines?.current || [];
          const products = cartLines
            .filter(line => line.merchandise?.id)
            .map(line => ({
              variantId: line.merchandise.id,
              productId: line.merchandise.product?.id || '',
              quantity: line.quantity || 1
            }));
          if (products.length > 0) {
            productsParam = `&products=${encodeURIComponent(JSON.stringify(products))}`;
          }
        } catch (e) {
          console.warn('LockerDrop: Could not read cart lines:', e);
        }

        const response = await fetchWithTimeout(
          `https://app.lockerdrop.it/api/checkout/lockers?address=${addressQuery}&shop=${shop.myshopifyDomain}${productsParam}`,
          10000
        );

        if (response.ok) {
          const data = await response.json();
          lockers = (data.lockers || []).slice(0, 5);
          pickupDate = data.pickupDate || null;
          retryCount = 0; // Reset retry count on success
        } else if (response.status >= 500) {
          throw new Error('Server temporarily unavailable');
        } else if (response.status === 404) {
          // No lockers found is not an error
          lockers = [];
        } else {
          throw new Error(`Request failed (${response.status})`);
        }

        // Fetch available dates (non-critical, don't fail if this fails)
        try {
          const datesResponse = await fetchWithTimeout(
            `https://app.lockerdrop.it/api/available-pickup-dates/${shop.myshopifyDomain}`,
            5000
          );
          if (datesResponse.ok) {
            const datesData = await datesResponse.json();
            availableDates = datesData.dates || [];
          }
        } catch (dateErr) {
          console.warn('LockerDrop: Could not fetch dates, using default');
          availableDates = [];
        }

      } catch (err) {
        console.error('LockerDrop fetch error:', err);

        // Handle specific error types
        if (err.name === 'AbortError') {
          error = 'Request timed out. Please check your connection and try again.';
        } else if (!navigator.onLine) {
          error = 'No internet connection. Please check your network.';
        } else if (retryCount < MAX_RETRIES) {
          // Auto-retry with exponential backoff
          retryCount++;
          const delay = Math.pow(2, retryCount) * 500; // 1s, 2s
          console.log(`LockerDrop: Retrying in ${delay}ms (attempt ${retryCount}/${MAX_RETRIES})`);
          setTimeout(fetchLockers, delay);
          return; // Don't update loading state yet
        } else {
          error = 'Unable to load pickup locations. Please try again.';
          retryCount = 0; // Reset for manual retry
        }
      } finally {
        loading = false;
        render();
      }
    }

    // Subscribe to address changes
    let fetchTimeout = null;
    shippingAddress.subscribe(() => {
      if (fetchTimeout) clearTimeout(fetchTimeout);
      fetchTimeout = setTimeout(fetchLockers, 500);
    });

    // Initial
    render();
    fetchLockers();
  }
);
