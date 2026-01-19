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
} from '@shopify/ui-extensions/checkout';

// Locker selection extension
extension(
  'purchase.checkout.block.render',
  (root, api) => {
    const { shop, shippingAddress, buyerJourney, settings, deliveryGroups } = api;

    // Get custom title from settings
    const customTitle = settings?.current?.title || 'LockerDrop Pickup';

    // State
    let lockers = [];
    let selectedLocker = null;
    let loading = true;
    let error = null;
    let showAllLockers = false;
    let pickupDate = null; // From API
    let availableDates = [];
    let selectedDate = null;

    // Create container
    const container = root.createComponent(BlockStack, { spacing: 'base', padding: 'base' });
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

      // Header
      container.appendChild(root.createComponent(Divider));
      const header = root.createComponent(InlineStack, { spacing: 'tight', blockAlignment: 'center' });
      container.appendChild(header);
      header.appendChild(root.createComponent(Heading, { level: 2 }, customTitle));

      // Check address
      const address = shippingAddress.current;
      const hasAddress = address?.zip || address?.city;

      if (!hasAddress) {
        const placeholder = root.createComponent(View, { padding: 'base', background: 'subdued', borderRadius: 'base' });
        container.appendChild(placeholder);
        const content = root.createComponent(BlockStack, { spacing: 'none', inlineAlignment: 'center' });
        placeholder.appendChild(content);
        content.appendChild(root.createComponent(Text, { appearance: 'subdued' }, 'Enter your shipping address to see pickup locations'));
        return;
      }

      if (loading) {
        const loadingView = root.createComponent(View, { padding: 'base', background: 'subdued', borderRadius: 'base' });
        container.appendChild(loadingView);
        const content = root.createComponent(BlockStack, { spacing: 'none', inlineAlignment: 'center' });
        loadingView.appendChild(content);
        content.appendChild(root.createComponent(Text, { appearance: 'subdued' }, 'Finding pickup locations...'));
        return;
      }

      if (error) {
        container.appendChild(root.createComponent(Banner, { status: 'warning' }, root.createComponent(Text, null, error)));
        return;
      }

      if (lockers.length === 0) {
        const noLockers = root.createComponent(View, { padding: 'base', background: 'subdued', borderRadius: 'base' });
        container.appendChild(noLockers);
        const content = root.createComponent(BlockStack, { spacing: 'none', inlineAlignment: 'center' });
        noLockers.appendChild(content);
        content.appendChild(root.createComponent(Text, { appearance: 'subdued' }, 'No pickup locations available nearby'));
        return;
      }

      // Selected locker view
      if (selectedLocker) {
        const lockerDropSelected = isLockerDropShippingSelected();

        if (!lockerDropSelected) {
          container.appendChild(root.createComponent(Banner, { status: 'warning' },
            root.createComponent(Text, null, 'Please select "LockerDrop Pickup" as your shipping method above.')));
        }

        const selected = root.createComponent(BlockStack, { spacing: 'extraTight' });
        container.appendChild(selected);

        selected.appendChild(root.createComponent(Text, { emphasis: 'bold', appearance: 'success' }, `✓ ${selectedLocker.name}`));
        selected.appendChild(root.createComponent(Text, { size: 'small', appearance: 'subdued' }, selectedLocker.address));

        if (selectedLocker.distance) {
          selected.appendChild(root.createComponent(Text, { size: 'small', appearance: 'subdued' }, `${selectedLocker.distance} miles away`));
        }

        // Show pickup date
        const displayDate = selectedDate?.display || pickupDate;
        if (displayDate) {
          selected.appendChild(root.createComponent(Text, { size: 'small', appearance: 'success', emphasis: 'bold' }, `📅 Ready ${displayDate}`));
        }

        // Date picker (if dates available)
        if (availableDates.length > 1) {
          container.appendChild(root.createComponent(Divider));
          container.appendChild(root.createComponent(Text, { size: 'small', emphasis: 'bold' }, 'Choose pickup date:'));

          const dateRow = root.createComponent(InlineStack, { spacing: 'tight' });
          container.appendChild(dateRow);

          availableDates.slice(0, 5).forEach((date) => {
            const isSelected = selectedDate?.date === date.date;
            dateRow.appendChild(
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
                  root.createComponent(Text, { size: 'extraSmall', appearance: isSelected ? 'accent' : 'subdued' }, date.monthDay)
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
        // Locker list
        const list = root.createComponent(BlockStack, { spacing: 'base' });
        container.appendChild(list);

        const lockersToShow = showAllLockers ? lockers : lockers.slice(0, 3);

        lockersToShow.forEach((locker, i) => {
          const option = root.createComponent(BlockStack, { spacing: 'extraTight' });
          list.appendChild(option);

          const nameRow = root.createComponent(InlineStack, { spacing: 'tight', blockAlignment: 'center' });
          option.appendChild(nameRow);

          nameRow.appendChild(
            root.createComponent(Button, { kind: 'secondary', onPress: () => {
              selectedLocker = locker;
              if (availableDates.length > 0 && !selectedDate) {
                selectedDate = availableDates[0];
              }
              updateAttribute();
              render();
            }}, locker.name)
          );

          if (locker.distance) {
            nameRow.appendChild(root.createComponent(Text, { size: 'small', appearance: 'subdued' }, `${locker.distance} mi`));
          }

          if (i === 0) {
            nameRow.appendChild(root.createComponent(Text, { size: 'extraSmall', appearance: 'success', emphasis: 'bold' }, 'CLOSEST'));
          }

          option.appendChild(root.createComponent(Text, { size: 'small', appearance: 'subdued' }, locker.address));
        });

        // Show pickup date info
        if (pickupDate) {
          container.appendChild(root.createComponent(Text, { size: 'small', appearance: 'success' }, `📅 Ready ${pickupDate}`));
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
      if (selectedLocker && !isLockerDropShippingSelected() && canBlockProgress) {
        return {
          behavior: 'block',
          reason: 'Shipping method mismatch',
          errors: [{ message: 'You selected a locker but chose a different shipping method. Please select "LockerDrop Pickup" as your shipping method, or click "Change location" to remove your locker selection.' }]
        };
      }
      return { behavior: 'allow' };
    });

    // Subscribe to delivery group changes
    if (deliveryGroups?.subscribe) {
      deliveryGroups.subscribe(() => { if (selectedLocker) render(); });
    }

    // Fetch lockers and dates
    async function fetchLockers() {
      const address = shippingAddress.current;
      if (!address?.zip && !address?.city) {
        loading = false;
        render();
        return;
      }

      try {
        const addressQuery = encodeURIComponent(`${address?.city || ''} ${address?.provinceCode || ''} ${address?.zip || ''}`);
        const response = await fetch(`https://app.lockerdrop.it/api/checkout/lockers?address=${addressQuery}&shop=${shop.myshopifyDomain}`);

        if (response.ok) {
          const data = await response.json();
          lockers = (data.lockers || []).slice(0, 5);
          pickupDate = data.pickupDate || null;
        }

        // Fetch available dates
        const datesResponse = await fetch(`https://app.lockerdrop.it/api/available-pickup-dates/${shop.myshopifyDomain}`);
        if (datesResponse.ok) {
          const datesData = await datesResponse.json();
          availableDates = datesData.dates || [];
        }
      } catch (err) {
        console.error('LockerDrop fetch error:', err);
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
