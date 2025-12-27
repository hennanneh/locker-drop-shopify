// @ts-check

/**
 * Fetch target - generates HTTP request to get nearby lockers
 * @param {InputQuery} input - The input from Shopify
 * @returns {FunctionFetchResult}
 */
export function fetch(input) {
  const deliveryAddress = input.deliveryAddress;
  const shop = input.shop?.myshopifyDomain || '';

  // Only proceed if we have location data
  if (!deliveryAddress?.latitude || !deliveryAddress?.longitude) {
    console.error('No coordinates available for delivery address');
    return { request: null };
  }

  const lat = deliveryAddress.latitude;
  const lon = deliveryAddress.longitude;
  const zip = deliveryAddress.zip || '';
  const countryCode = deliveryAddress.countryCode || 'US';

  // Only support US locations for now
  if (countryCode !== 'US') {
    return { request: null };
  }

  // Build URL to fetch lockers from LockerDrop server
  const url = `https://app.lockerdrop.it/api/pickup-points?lat=${lat}&lon=${lon}&zip=${encodeURIComponent(zip)}&shop=${encodeURIComponent(shop)}`;

  return {
    request: {
      method: "GET",
      url: url,
      headers: [
        {
          name: "Accept",
          value: "application/json"
        }
      ],
      body: null,
      policy: {
        readTimeoutMs: 2000
      }
    }
  };
}

// Required for Shopify Functions
// @ts-ignore
export default fetch;
