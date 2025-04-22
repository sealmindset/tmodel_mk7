/**
 * Rapid7 API Configuration Script
 * 
 * This script configures the Rapid7 API settings in Redis
 * and tests the connection to ensure it's working properly.
 */

const axios = require('axios');
const redis = require('../utils/redis').client;
require('dotenv').config();

// Default Rapid7 API settings
const DEFAULT_API_URL = 'https://us.api.insight.rapid7.com';
const API_KEY = process.env.RAPID7_API_KEY || 'c8428ef0-6786-4a6e-aaa8-ac4841d87894';

// ANSI color codes for formatting output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

/**
 * Test connection to Rapid7 API
 * @param {string} apiUrl - Rapid7 API URL
 * @param {string} apiKey - Rapid7 API Key
 * @returns {Promise<boolean>} - True if connection successful
 */
async function testRapid7Connection(apiUrl, apiKey) {
  try {
    console.log(`${colors.blue}Testing connection to Rapid7 API...${colors.reset}`);
    
    const response = await axios.get(`${apiUrl}/validate`, {
      headers: {
        'X-Api-Key': apiKey
      }
    });
    
    if (response.status === 200 && response.data.message === 'Authorized') {
      console.log(`${colors.green}✅ Connection to Rapid7 API successful!${colors.reset}`);
      return true;
    } else {
      console.log(`${colors.red}❌ Connection to Rapid7 API failed: Unexpected response${colors.reset}`);
      console.log(`Response: ${JSON.stringify(response.data)}`);
      return false;
    }
  } catch (error) {
    console.log(`${colors.red}❌ Connection to Rapid7 API failed: ${error.message}${colors.reset}`);
    if (error.response) {
      console.log(`Status: ${error.response.status}`);
      console.log(`Response: ${JSON.stringify(error.response.data)}`);
    }
    return false;
  }
}

/**
 * Configure Rapid7 API settings in Redis
 * @param {string} apiUrl - Rapid7 API URL
 * @param {string} apiKey - Rapid7 API Key
 * @returns {Promise<boolean>} - True if configuration successful
 */
async function configureRapid7Api(apiUrl, apiKey) {
  try {
    console.log(`${colors.blue}Configuring Rapid7 API settings...${colors.reset}`);
    
    // Store API settings in Redis
    await redis.set('settings:rapid7:api_url', apiUrl);
    await redis.set('settings:rapid7:api_key', apiKey);
    
    console.log(`${colors.green}✅ Rapid7 API settings configured successfully!${colors.reset}`);
    return true;
  } catch (error) {
    console.log(`${colors.red}❌ Failed to configure Rapid7 API settings: ${error.message}${colors.reset}`);
    return false;
  }
}

/**
 * Main function to configure and test Rapid7 API
 */
async function main() {
  console.log(`${colors.cyan}============================================================${colors.reset}`);
  console.log(`${colors.cyan}  Rapid7 API Configuration${colors.reset}`);
  console.log(`${colors.cyan}============================================================${colors.reset}`);
  
  try {
    // Check if API settings already exist in Redis
    const [existingApiUrl, existingApiKey] = await Promise.all([
      redis.get('settings:rapid7:api_url'),
      redis.get('settings:rapid7:api_key')
    ]);
    
    const apiUrl = existingApiUrl || DEFAULT_API_URL;
    const apiKey = existingApiKey || API_KEY;
    
    if (existingApiUrl && existingApiKey) {
      console.log(`${colors.yellow}Existing Rapid7 API settings found:${colors.reset}`);
      console.log(`API URL: ${apiUrl}`);
      console.log(`API Key: ${'*'.repeat(apiKey.length - 8)}${apiKey.substring(apiKey.length - 8)}`);
    } else {
      console.log(`${colors.blue}Using default Rapid7 API settings:${colors.reset}`);
      console.log(`API URL: ${apiUrl}`);
      console.log(`API Key: ${'*'.repeat(apiKey.length - 8)}${apiKey.substring(apiKey.length - 8)}`);
    }
    
    // Test connection
    const connectionSuccessful = await testRapid7Connection(apiUrl, apiKey);
    
    if (connectionSuccessful) {
      // Configure API settings
      await configureRapid7Api(apiUrl, apiKey);
      
      console.log(`\n${colors.green}Rapid7 API configuration completed successfully!${colors.reset}`);
      console.log(`You can now use the Rapid7 API to sync vulnerabilities in TModel MK7.`);
    } else {
      console.log(`\n${colors.red}Rapid7 API configuration failed due to connection issues.${colors.reset}`);
      console.log(`Please check your API key and try again.`);
      process.exit(1);
    }
  } catch (error) {
    console.log(`\n${colors.red}Error during Rapid7 API configuration: ${error.message}${colors.reset}`);
    process.exit(1);
  } finally {
    // Close Redis connection
    redis.quit();
  }
}

// Run the main function
main();
