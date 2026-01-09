import React, { useState, useEffect } from 'react';
import {
  reactExtension,
  useApi,
  useShippingAddress,
  useApplyShippingAddressChange,
  useCartLines,
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
  Style,
  ScrollView,
} from '@shopify/ui-extensions-react/checkout';

// Main extension export
export default reactExtension(
  'purchase.checkout.delivery-address.render-after',
  () => <LockerDropPickup />
);

function LockerDropPickup() {
  const { shop, sessionToken } = useApi();
  const shippingAddress = useShippingAddress();
  const applyShippingAddressChange = useApplyShippingAddressChange();
  const cartLines = useCartLines();

  const [lockers, setLockers] = useState([]);
  const [selectedLocker, setSelectedLocker] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [useLockerPickup, setUseLockerPickup] = useState(false);
  const [pickupDate, setPickupDate] = useState(null);

  // Date picker state
  const [availableDates, setAvailableDates] = useState([]);
  const [selectedDate, setSelectedDate] = useState(null);
  const [datesLoading, setDatesLoading] = useState(false);

  // Fetch nearby lockers when address changes
  useEffect(() => {
    if (shippingAddress?.zip || shippingAddress?.city) {
      fetchNearbyLockers();
    }
  }, [shippingAddress?.zip, shippingAddress?.city, shippingAddress?.countryCode]);

  // Fetch available dates when locker pickup is enabled
  useEffect(() => {
    if (useLockerPickup && selectedLocker) {
      fetchAvailableDates();
    }
  }, [useLockerPickup, selectedLocker]);

  async function fetchNearbyLockers() {
    setLoading(true);
    setError(null);

    try {
      const token = await sessionToken.get();

      // Build location query from shipping address
      const addressQuery = encodeURIComponent(
        `${shippingAddress?.address1 || ''} ${shippingAddress?.city || ''} ${shippingAddress?.provinceCode || ''} ${shippingAddress?.zip || ''}`
      );

      // Extract product variant IDs and quantities from cart for size calculation
      const cartProducts = cartLines.map(line => ({
        variantId: line.merchandise?.id,
        productId: line.merchandise?.product?.id,
        quantity: line.quantity
      }));
      const productsParam = encodeURIComponent(JSON.stringify(cartProducts));

      const response = await fetch(
        `https://app.lockerdrop.it/api/checkout/lockers?address=${addressQuery}&shop=${shop.myshopifyDomain}&products=${productsParam}`,
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
      setLockers(data.lockers || []);
      setPickupDate(data.pickupDate || null);

      // Auto-select first locker if available
      if (data.lockers?.length > 0 && !selectedLocker) {
        setSelectedLocker(data.lockers[0]);
      }
    } catch (err) {
      console.error('Error fetching lockers:', err);
      setError('Unable to load pickup locations');
    } finally {
      setLoading(false);
    }
  }

  async function fetchAvailableDates() {
    setDatesLoading(true);
    try {
      const response = await fetch(
        `https://app.lockerdrop.it/api/available-pickup-dates/${shop.myshopifyDomain}`
      );

      if (!response.ok) {
        throw new Error('Failed to fetch dates');
      }

      const data = await response.json();
      setAvailableDates(data.dates || []);

      // Auto-select first date if none selected
      if (data.dates?.length > 0 && !selectedDate) {
        setSelectedDate(data.dates[0]);
      }
    } catch (err) {
      console.error('Error fetching available dates:', err);
    } finally {
      setDatesLoading(false);
    }
  }

  async function handleLockerSelect(locker) {
    setSelectedLocker(locker);
    setUseLockerPickup(true);

    // Update shipping address with locker info (date will be added when date is selected)
    await updateShippingWithLockerInfo(locker, selectedDate);
  }

  async function handleDateSelect(date) {
    setSelectedDate(date);

    // Update shipping address with both locker and date info
    if (selectedLocker) {
      await updateShippingWithLockerInfo(selectedLocker, date);
    }
  }

  async function updateShippingWithLockerInfo(locker, date) {
    try {
      let address2Value = `LockerDrop: ${locker.name} (ID: ${locker.id})`;
      if (date) {
        address2Value += ` | Pickup: ${date.date}`;
      }

      await applyShippingAddressChange({
        type: 'updateShippingAddress',
        address: {
          ...shippingAddress,
          address2: address2Value
        }
      });
    } catch (err) {
      console.error('Error updating address:', err);
    }
  }

  function handleDisableLockerPickup() {
    setUseLockerPickup(false);
    setSelectedLocker(null);
    setSelectedDate(null);

    // Clear the locker info from address
    applyShippingAddressChange({
      type: 'updateShippingAddress',
      address: {
        ...shippingAddress,
        address2: shippingAddress?.address2?.replace(/LockerDrop:.*$/, '').trim() || ''
      }
    });
  }

  // Don't show if no shipping address yet
  if (!shippingAddress?.zip && !shippingAddress?.city) {
    return null;
  }

  return (
    <BlockStack spacing="loose" padding="base">
      <Divider />

      <BlockStack spacing="tight">
        <InlineStack spacing="tight" blockAlignment="center">
          <Icon source="delivery" size="base" />
          <Heading level={2}>LockerDrop Pickup</Heading>
          <View inlineAlignment="end">
            <Text appearance="success" emphasis="bold">FREE</Text>
          </View>
        </InlineStack>

        <Text size="small">
          ✓ Skip shipping fees  ✓ Pick up on YOUR schedule (24/7)  ✓ Secure contactless pickup
        </Text>
        <Text appearance="subdued" size="extraSmall">
          Changed your mind? No problem - we'll hold it for 5 days
        </Text>
      </BlockStack>

      {loading ? (
        <BlockStack spacing="tight">
          <SkeletonText inlineSize="large" />
          <SkeletonText inlineSize="large" />
          <SkeletonText inlineSize="base" />
        </BlockStack>
      ) : error ? (
        <Banner status="warning">
          <Text>{error}</Text>
        </Banner>
      ) : lockers.length === 0 ? (
        <Banner status="info">
          <Text>No locker locations available near your address</Text>
        </Banner>
      ) : (
        <BlockStack spacing="base">
          {!useLockerPickup ? (
            <Button
              kind="secondary"
              onPress={() => setUseLockerPickup(true)}
            >
              Choose locker pickup instead
            </Button>
          ) : (
            <>
              <BlockStack spacing="tight">
                {lockers.slice(0, 3).map((locker, index) => {
                  // First locker with good availability is recommended (already sorted by distance)
                  const isRecommended = index === 0 && locker.availableCount >= 3;
                  return (
                    <LockerOption
                      key={locker.id}
                      locker={locker}
                      selected={selectedLocker?.id === locker.id}
                      onSelect={() => handleLockerSelect(locker)}
                      isRecommended={isRecommended}
                    />
                  );
                })}
              </BlockStack>

              {/* Date Picker Section */}
              {selectedLocker && (
                <BlockStack spacing="tight">
                  <Divider />
                  <Text emphasis="bold" size="small">Choose your pickup date:</Text>

                  {datesLoading ? (
                    <SkeletonText inlineSize="large" />
                  ) : availableDates.length > 0 ? (
                    <InlineStack spacing="tight">
                      {availableDates.map((date) => (
                        <DateOption
                          key={date.date}
                          date={date}
                          selected={selectedDate?.date === date.date}
                          onSelect={() => handleDateSelect(date)}
                        />
                      ))}
                    </InlineStack>
                  ) : (
                    <Text size="small" appearance="subdued">
                      Pickup dates loading...
                    </Text>
                  )}

                  {selectedDate && (
                    <Text size="small" appearance="success">
                      ✓ Pickup scheduled for {selectedDate.display}
                    </Text>
                  )}
                </BlockStack>
              )}

              <Button
                kind="plain"
                onPress={handleDisableLockerPickup}
              >
                Use regular shipping instead
              </Button>
            </>
          )}
        </BlockStack>
      )}
    </BlockStack>
  );
}

function LockerOption({ locker, selected, onSelect, isRecommended }) {
  return (
    <Pressable
      onPress={onSelect}
      border={selected ? 'base' : 'none'}
      borderRadius="base"
      padding="base"
      background={selected ? 'subdued' : 'transparent'}
    >
      <InlineStack spacing="base" blockAlignment="start">
        <View>
          {selected ? (
            <Icon source="checkCircle" size="base" appearance="accent" />
          ) : (
            <Icon source="circle" size="base" appearance="subdued" />
          )}
        </View>

        <BlockStack spacing="extraTight">
          <InlineStack spacing="tight" blockAlignment="center">
            <Text emphasis="bold">{locker.name}</Text>
            {locker.distance && (
              <Text appearance="subdued" size="small">
                ({locker.distance} mi)
              </Text>
            )}
            {isRecommended && (
              <Text size="extraSmall" appearance="success" emphasis="bold">
                ⭐ BEST CHOICE
              </Text>
            )}
          </InlineStack>

          <Text size="small" appearance="subdued">
            {locker.address}
          </Text>

          <Text size="small" appearance="success">
            {locker.availableCount} locker{locker.availableCount !== 1 ? 's' : ''} available
          </Text>

          {isRecommended && (
            <Text size="extraSmall" appearance="subdued">
              Closest location with best availability
            </Text>
          )}
        </BlockStack>
      </InlineStack>
    </Pressable>
  );
}

function DateOption({ date, selected, onSelect }) {
  return (
    <Pressable
      onPress={onSelect}
      border="base"
      borderRadius="base"
      padding="tight"
      background={selected ? 'subdued' : 'transparent'}
      minInlineSize={80}
    >
      <BlockStack spacing="none" inlineAlignment="center">
        <Text size="small" emphasis={selected ? 'bold' : undefined}>
          {date.dayName}
        </Text>
        <Text size="small" appearance={selected ? 'accent' : 'subdued'}>
          {date.monthDay}
        </Text>
        {selected && (
          <Icon source="checkCircle" size="small" appearance="accent" />
        )}
      </BlockStack>
    </Pressable>
  );
}
