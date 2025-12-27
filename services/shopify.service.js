const axios = require('axios');

class ShopifyService {
  constructor(shop, accessToken) {
    this.shop = shop;
    this.accessToken = accessToken;
    this.apiVersion = '2024-10';
  }

  // Get API URL for this shop
  getApiUrl(endpoint) {
    return `https://${this.shop}/admin/api/${this.apiVersion}/${endpoint}`;
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
      const url = this.getApiUrl('carrier_services.json');
      const callbackUrl = `https://${process.env.SHOPIFY_HOST}/carrier/rates`;
      
      const response = await axios.post(url, {
        carrier_service: {
          name: 'LockerDrop',
          callback_url: callbackUrl,
          service_discovery: true
        }
      }, {
        headers: this.getHeaders()
      });

      console.log('✅ Carrier service registered for', this.shop);
      return response.data.carrier_service;
    } catch (error) {
      console.error('❌ Failed to register carrier service:', error.response?.data || error.message);
      throw error;
    }
  }

  // Get existing carrier services
  async getCarrierServices() {
    try {
      const url = this.getApiUrl('carrier_services.json');
      const response = await axios.get(url, {
        headers: this.getHeaders()
      });
      return response.data.carrier_services;
    } catch (error) {
      console.error('❌ Failed to get carrier services:', error.response?.data || error.message);
      throw error;
    }
  }

  // Delete carrier service
  async deleteCarrierService(carrierId) {
    try {
      const url = this.getApiUrl(`carrier_services/${carrierId}.json`);
      await axios.delete(url, {
        headers: this.getHeaders()
      });
      console.log('✅ Carrier service deleted:', carrierId);
    } catch (error) {
      console.error('❌ Failed to delete carrier service:', error.response?.data || error.message);
      throw error;
    }
  }

  // Get shop information
  async getShop() {
    try {
      const url = this.getApiUrl('shop.json');
      const response = await axios.get(url, {
        headers: this.getHeaders()
      });
      return response.data.shop;
    } catch (error) {
      console.error('❌ Failed to get shop info:', error.response?.data || error.message);
      throw error;
    }
  }
}

module.exports = ShopifyService;