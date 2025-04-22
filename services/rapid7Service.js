/**
 * Rapid7 Integration Service
 * 
 * This service handles communication with the Rapid7 InsightVM API
 * to fetch vulnerabilities and scan information.
 */
const axios = require('axios');
const db = require('../db/db');
const redisUtil = require('../utils/redis');
const logger = require('../utils/logger').forModule('rapid7Service');

// Connect to Redis at startup
redisUtil.connect().catch(err => {
  logger.error('Failed to connect to Redis at startup', null, err);
});

// Helper functions for storing scan data and vulnerabilities
async function saveVulnerability(vulnData) {
  try {
    const query = `
      INSERT INTO threat_model.vulnerabilities 
        (external_id, title, description, severity, cvss_score, 
         status, remediation, asset_id, asset_name, first_found, last_found)
      VALUES 
        ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      ON CONFLICT (external_id) 
      DO UPDATE SET 
        title = $2, 
        description = $3, 
        severity = $4, 
        cvss_score = $5, 
        status = $6, 
        remediation = $7,
        asset_id = $8,
        asset_name = $9,
        last_found = $11,
        updated_at = CURRENT_TIMESTAMP
      RETURNING id`;

    const result = await db.query(query, [
      vulnData.id, // external_id
      vulnData.title, 
      vulnData.description || '',
      vulnData.severity,
      vulnData.cvss_score, 
      'Open',  // default status
      vulnData.remediation || '',
      vulnData.asset_id,
      vulnData.asset_name || '',
      new Date(), // first_found 
      new Date()  // last_found
    ]);

    return result.rows[0].id;
  } catch (error) {
    console.error(`Error saving vulnerability ${vulnData.id}:`, error);
    throw error;
  }
}

async function updateScanHistory(scanId, status, vulnCount = 0) {
  try {
    const query = `
      UPDATE threat_model.scan_history 
      SET status = $1, 
          total_vulnerabilities = $2,
          end_time = $3,
          updated_at = CURRENT_TIMESTAMP
      WHERE scan_id = $4
      RETURNING id`;

    const result = await db.query(query, [
      status,
      vulnCount,
      status === 'Completed' ? new Date() : null,
      scanId
    ]);

    return result.rows[0];
  } catch (error) {
    console.error(`Error updating scan history for ${scanId}:`, error);
    throw error;
  }
}

class Rapid7Service {
  constructor() {
    this.refreshClient();
  }
  
  /**
   * Initialize the service with the provided settings
   * @param {Object} settings - Settings object
   * @param {string} settings.apiUrl - API URL
   * @param {string} settings.apiKey - API key
   */
  init(settings = {}) {
    if (settings.apiUrl) {
      this.apiUrl = settings.apiUrl;
      this.baseUrl = settings.apiUrl;
      
      // Remove trailing slash from baseUrl if present
      if (this.baseUrl.endsWith('/')) {
        this.baseUrl = this.baseUrl.slice(0, -1);
      }
      
      console.log('Initialized Rapid7 service with API URL:', this.apiUrl);
    }
    
    if (settings.apiKey) {
      this.apiKey = settings.apiKey;
      console.log('Initialized Rapid7 service with API key, length:', this.apiKey.length);
    }
    
    // Configure axios client with updated settings
    this.client = axios.create({
      baseURL: this.baseUrl,
      headers: {
        'X-Api-Key': this.apiKey,
        'Content-Type': 'application/json'
      }
    });
  }

  /**
   * Refresh the API client with latest settings from Redis
   */
  async refreshClient() {
    try {
      // Get API URL and key from Redis using the utility functions
      const apiUrl = await redisUtil.getRedisValue('settings:rapid7:api_url');
      const apiKey = await redisUtil.getRedisValue('settings:rapid7:api_key');
      
      logger.debug('Retrieved Rapid7 settings from Redis', {
        apiUrlSet: !!apiUrl,
        apiKeyLength: apiKey ? apiKey.length : 0
      });
      
      // Set baseUrl and apiKey with fallbacks to environment variables
      this.baseUrl = apiUrl || process.env.RAPID7_API_URL || 'https://us.api.insight.rapid7.com';
      this.apiUrl = this.baseUrl;
      this.apiKey = apiKey || process.env.RAPID7_API_KEY || '';
      
      // Configure axios client
      this.client = axios.create({
        baseURL: this.baseUrl,
        headers: {
          'X-Api-Key': this.apiKey,
          'Content-Type': 'application/json'
        },
        timeout: 30000 // 30 seconds timeout
      });
      
      logger.info('Rapid7 client refreshed', { baseUrl: this.baseUrl });
      return true;
    } catch (error) {
      logger.error('Error refreshing Rapid7 client', null, error);
      return false;
    }
  }

  /**
   * Check connection to Rapid7 API
   * @returns {Promise<boolean>} - True if connection is successful
   */
  async checkConnection() {
    try {
      // Force refresh client to ensure we have the latest settings from Redis
      await this.refreshClient();
      
      // If API URL is empty, use default but log a warning
      if (!this.apiUrl) {
        console.warn('Rapid7 API URL is empty, using default');
        this.apiUrl = 'https://us.api.insight.rapid7.com';
      }
      
      // Very minimal API key validation - just log a warning if empty
      if (!this.apiKey) {
        console.warn('Rapid7 API key is empty');
        throw new Error('API key is required for Rapid7 connection');
      }
      
      // Log connection attempt
      console.log(`Attempting to connect to Rapid7 API with URL: ${this.apiUrl}`);
      
      // Mask API key for logging
      let maskedKey = 'HIDDEN';
      if (this.apiKey && this.apiKey.length > 8) {
        maskedKey = this.apiKey.substring(0, 4) + '...' + this.apiKey.substring(this.apiKey.length - 4);
      }
      console.log(`Using API key: ${maskedKey}`);
      
      // Format the URL properly
      const axios = require('axios');
      try {
        logger.debug('Sending Rapid7 validation request', { url: validationUrl });
        
        // Use exactly the same approach as the working curl command
        const response = await axios({
          method: 'GET',
          url: validationUrl,
          headers: {
            'X-Api-Key': this.apiKey,
            'Accept': 'application/json'
          },
          timeout: 30000, // 30 seconds timeout for slow connections
          validateStatus: () => true, // Don't throw on any status code
          maxRedirects: 5 // Allow redirects
        });
        
        logger.debug('Rapid7 validation response received', { 
          status: response.status,
          statusText: response.statusText,
          dataReceived: !!response.data
        });
        
        // Check if the response is valid
        if (response.status >= 200 && response.status < 300) {
          logger.info('Rapid7 connection validated successfully');
          return true;
        } else {
          logger.error('Rapid7 validation failed', { 
            status: response.status,
            statusText: response.statusText,
            data: response.data
          });
          
          // Try to extract a meaningful error message
          let errorMessage = 'Connection failed. Check your API URL and key.';
          
          // Add more details if available
          if (response.data && response.data.message) {
            errorMessage = response.data.message;
          } else if (response.statusText) {
            errorMessage = response.statusText;
          }
          
          throw new Error(errorMessage);
        }
      } catch (error) {
        logger.error('Error validating Rapid7 connection', { message: error.message }, error);
        
        let errorMessage = 'Connection failed. Check your API URL and key.';
        
        // Add more details if available
        if (error.response) {
          errorMessage = `API responded with status ${error.response.status}. Check your API key.`;
        } else if (error.code) {
          errorMessage = `Network error: ${error.code}. Check your API URL.`;
        }
        
        logger.error('Rapid7 connection validation error', { errorMessage });
        throw new Error(errorMessage);
      }
    } catch (error) {
      logger.error('Rapid7 connectivity check failed', { message: error.message }, error);
      throw error;
    }
  }
  
  async mapAssetsToComponents(assets, componentMatcher) {
    const results = {
      mapped: 0,
      unmapped: 0,
      mappings: []
    };
    
    for (const asset of assets) {
      // Use the provided matcher function to find a matching component
      const component = await componentMatcher(asset);
      
      if (component) {
        results.mapped++;
        results.mappings.push({
          asset_id: asset.id,
          asset_hostname: asset.hostName,
          component_id: component.id,
          component_name: component.name
        });
      } else {
        results.unmapped++;
      }
    }
    
    return results;
  }
}

module.exports = new Rapid7Service();
