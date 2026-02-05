const axios = require('axios');

class ShopifyService {
  constructor(shop, accessToken) {
    this.shop = shop;
    this.accessToken = accessToken;
    this.apiVersion = '2025-10';
  }

  // GraphQL helper
  async graphql(query, variables = {}) {
    const response = await axios.post(
      `https://${this.shop}/admin/api/${this.apiVersion}/graphql.json`,
      { query, variables },
      { headers: this.getHeaders() }
    );

    if (response.data.errors) {
      throw new Error(response.data.errors[0]?.message || 'GraphQL query failed');
    }

    return response.data.data;
  }

  // Get headers with authentication
  getHeaders() {
    return {
      'X-Shopify-Access-Token': this.accessToken,
      'Content-Type': 'application/json'
    };
  }

  // Register carrier service
  async registerCarrierService() {
    try {
      const callbackUrl = `https://${process.env.SHOPIFY_HOST}/carrier/rates`;

      const result = await this.graphql(`
        mutation carrierServiceCreate($input: DeliveryCarrierServiceCreateInput!) {
          carrierServiceCreate(input: $input) {
            carrierService {
              id
              name
            }
            userErrors {
              field
              message
            }
          }
        }
      `, {
        input: {
          name: 'LockerDrop',
          callbackUrl: callbackUrl,
          active: true,
          serviceDiscovery: true
        }
      });

      const errors = result.carrierServiceCreate?.userErrors;
      if (errors && errors.length > 0) {
        throw new Error(errors[0].message);
      }

      console.log('✅ Carrier service registered for', this.shop);
      return result.carrierServiceCreate.carrierService;
    } catch (error) {
      console.error('❌ Failed to register carrier service:', error.message);
      throw error;
    }
  }

  // Get shop information
  async getShop() {
    try {
      const result = await this.graphql(`{
        shop {
          name
          email
          billingAddress {
            zip
            city
            province
            country
          }
        }
      }`);
      return result.shop;
    } catch (error) {
      console.error('❌ Failed to get shop info:', error.message);
      throw error;
    }
  }
}

module.exports = ShopifyService;
