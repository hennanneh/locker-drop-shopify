const axios = require('axios');

class HarborService {
  constructor() {
    this.apiUrl = process.env.HARBOR_API_URL;
    this.accountsUrl = 'https://accounts.harborlockers.com/realms/harbor/protocol/openid-connect/token';
    this.clientId = process.env.HARBOR_CLIENT_ID;
    this.clientSecret = process.env.HARBOR_CLIENT_SECRET;
    this.token = null;
    this.tokenExpiry = null;
  }

  // Authenticate with Harbor API
  async authenticate() {
    try {
      // Check if we have a valid token
      if (this.token && this.tokenExpiry && new Date() < this.tokenExpiry) {
        return this.token;
      }

      // Prepare form data for authentication
      const params = new URLSearchParams({
        grant_type: 'client_credentials',
        scope: 'service_provider',
        client_id: this.clientId,
        client_secret: this.clientSecret
      });

      // Get new token
      const response = await axios.post(this.accountsUrl, params, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json'
        }
      });

      this.token = response.data.access_token;
      // Token expires in 300 seconds (5 minutes), set expiry to 4 minutes to be safe
      this.tokenExpiry = new Date(Date.now() + 4 * 60 * 1000);
      
      console.log('✅ Harbor API authenticated');
      console.log('Token expires in:', response.data.expires_in, 'seconds');
      return this.token;
    } catch (error) {
      console.error('❌ Harbor authentication failed:', error.response?.data || error.message);
      throw new Error('Failed to authenticate with Harbor API');
    }
  }

  // Get API headers with authentication
  async getHeaders() {
    const token = await this.authenticate();
    return {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };
  }

  // Search for lockers near a location
  async searchLockers(latitude, longitude, radius = 5000) {
    try {
      const headers = await this.getHeaders();
      const response = await axios.get(`${this.apiUrl}/api/v1/locations/search`, {
        headers,
        params: {
          latitude,
          longitude,
          radius // in meters
        }
      });
      return response.data;
    } catch (error) {
      console.error('❌ Locker search failed:', error.response?.data || error.message);
      throw error;
    }
  }

  // Get location details
  async getLocation(locationId) {
    try {
      const headers = await this.getHeaders();
      const response = await axios.get(`${this.apiUrl}/api/v1/locations/${locationId}`, {
        headers
      });
      return response.data;
    } catch (error) {
      console.error('❌ Get location failed:', error.response?.data || error.message);
      throw error;
    }
  }

  // Create a delivery
  async createDelivery(deliveryData) {
    try {
      const headers = await this.getHeaders();
      const response = await axios.post(`${this.apiUrl}/api/v1/deliveries`, deliveryData, {
        headers
      });
      return response.data;
    } catch (error) {
      console.error('❌ Create delivery failed:', error.response?.data || error.message);
      throw error;
    }
  }

  // Get delivery details
  async getDelivery(deliveryId) {
    try {
      const headers = await this.getHeaders();
      const response = await axios.get(`${this.apiUrl}/api/v1/deliveries/${deliveryId}`, {
        headers
      });
      return response.data;
    } catch (error) {
      console.error('❌ Get delivery failed:', error.response?.data || error.message);
      throw error;
    }
  }
}

module.exports = new HarborService();