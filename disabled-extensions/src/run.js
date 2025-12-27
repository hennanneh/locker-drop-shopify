// @ts-check

/**
 * Run target - transforms locker data into pickup point delivery options
 * @param {RunInputQuery} input - The input containing fetch results
 * @returns {FunctionRunResult}
 */
export function run(input) {
  const fetchResult = input.fetchResult;

  // Check if fetch was successful
  if (!fetchResult || fetchResult.status !== 200 || !fetchResult.body) {
    console.error('Fetch failed or returned empty response');
    return { operations: [] };
  }

  let lockerData;
  try {
    lockerData = JSON.parse(fetchResult.body);
  } catch (e) {
    console.error('Failed to parse locker response:', e);
    return { operations: [] };
  }

  // Check for valid locker data
  if (!lockerData.lockers || !Array.isArray(lockerData.lockers) || lockerData.lockers.length === 0) {
    return { operations: [] };
  }

  // Transform lockers into pickup point operations
  const operations = lockerData.lockers.map((locker) => {
    return {
      add: {
        cost: locker.cost || null, // null = free, or { amount: "1.00", currencyCode: "USD" }
        pickupPoint: {
          externalId: `harbor_${locker.id}`,
          name: locker.name || `Harbor Locker ${locker.id}`,
          address: {
            address1: locker.address || locker.street_address || '',
            address2: locker.address2 || null,
            city: locker.city || '',
            provinceCode: locker.state || locker.province_code || null,
            zip: locker.zip || locker.postal_code || '',
            countryCode: locker.country_code || 'US',
            latitude: locker.lat ? parseFloat(locker.lat) : null,
            longitude: locker.lon ? parseFloat(locker.lon) : null
          },
          businessHours: buildBusinessHours(locker.hours),
          provider: {
            name: "Harbor Lockers",
            logoUrl: "https://app.lockerdrop.it/images/harbor-logo.png"
          },
          carrierCode: "LOCKERDROP",
          metafields: [
            {
              namespace: "lockerdrop",
              key: "location_id",
              value: String(locker.id),
              type: "single_line_text_field"
            },
            {
              namespace: "lockerdrop",
              key: "distance",
              value: locker.distance ? locker.distance.toFixed(2) : "0",
              type: "single_line_text_field"
            },
            {
              namespace: "lockerdrop",
              key: "available_count",
              value: String(locker.availableCount || 0),
              type: "single_line_text_field"
            },
            {
              namespace: "lockerdrop",
              key: "pickup_date",
              value: lockerData.pickupDateISO || "",
              type: "date"
            }
          ]
        }
      }
    };
  });

  return { operations };
}

/**
 * Build business hours structure for a locker
 * Harbor lockers are typically 24/7, but we'll use provided hours if available
 * @param {object|null} hours - Hours object from locker data
 * @returns {object|null}
 */
function buildBusinessHours(hours) {
  // Default to 24/7 for lockers
  const allDays = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];

  if (!hours || hours.is24_7) {
    // 24/7 access
    return {
      periods: allDays.map(day => ({
        day: day,
        openTime: "00:00:00",
        closeTime: "23:59:59"
      }))
    };
  }

  // If specific hours are provided, use them
  if (hours.periods && Array.isArray(hours.periods)) {
    return { periods: hours.periods };
  }

  // Fallback to 24/7
  return {
    periods: allDays.map(day => ({
      day: day,
      openTime: "00:00:00",
      closeTime: "23:59:59"
    }))
  };
}

// Required for Shopify Functions
// @ts-ignore
export default run;
