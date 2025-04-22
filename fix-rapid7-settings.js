/**
 * Fix Rapid7 Settings
 * 
 * This script directly sets the Rapid7 API settings in Redis
 * and validates the connection.
 */

require('dotenv').config();
const axios = require('axios');

// Use the existing Redis client from the application
const redisUtil = require('./utils/redis');
const redis = redisUtil.client;

async function fixRapid7Settings() {
  try {
    console.log('Connecting to Redis...');
    
    // Set the Rapid7 API settings
    const apiUrl = 'https://us.api.insight.rapid7.com';
    const apiKey = 'c8428ef0-6786-4a6e-aaa8-ac4841d87894';
    
    console.log(`Setting Rapid7 API URL to: ${apiUrl}`);
    console.log(`Setting Rapid7 API Key to: ${apiKey.substring(0, 4)}...${apiKey.substring(apiKey.length - 4)}`);
    
    // Save settings to Redis
    await redis.set('settings:rapid7:api_url', apiUrl);
    await redis.set('settings:rapid7:api_key', apiKey);
    
    // Verify the settings were saved
    const [savedUrl, savedKey] = await Promise.all([
      redis.get('settings:rapid7:api_url'),
      redis.get('settings:rapid7:api_key')
    ]);
    
    console.log('\nVerifying saved settings:');
    console.log(`Saved API URL: ${savedUrl}`);
    console.log(`Saved API Key: ${savedKey ? `${savedKey.substring(0, 4)}...${savedKey.substring(savedKey.length - 4)}` : 'Not saved'}`);
    
    if (savedUrl === apiUrl && savedKey === apiKey) {
      console.log('\n✅ Settings saved successfully to Redis');
    } else {
      console.log('\n❌ Settings were not saved correctly');
      if (savedUrl !== apiUrl) console.log(`  - API URL mismatch: expected "${apiUrl}", got "${savedUrl}"`);
      if (savedKey !== apiKey) console.log(`  - API Key mismatch: expected "${apiKey.substring(0, 4)}...${apiKey.substring(apiKey.length - 4)}", got "${savedKey ? `${savedKey.substring(0, 4)}...${savedKey.substring(savedKey.length - 4)}` : 'Not saved'}"`);
    }
    
    // Test the connection
    console.log('\nTesting connection to Rapid7 API...');
    
    try {
      const response = await axios.get(`${apiUrl}/validate`, {
        headers: {
          'X-Api-Key': apiKey
        }
      });
      
      console.log('Response status:', response.status);
      console.log('Response data:', response.data);
      
      if (response.status === 200 && response.data && response.data.message === 'Authorized') {
        console.log('\n✅ Connection successful! The API key is valid.');
      } else {
        console.log('\n❌ Connection failed: Unexpected response');
      }
    } catch (error) {
      console.error('\n❌ Connection failed:', error.message);
      if (error.response) {
        console.error('Response status:', error.response.status);
        console.error('Response data:', error.response.data);
      }
    }
    
    // List all Redis keys related to Rapid7
    console.log('\nAll Redis keys related to Rapid7:');
    const allKeys = await redis.keys('*rapid7*');
    
    if (allKeys.length === 0) {
      console.log('No keys found with "rapid7" in the name');
    } else {
      for (const key of allKeys) {
        const value = await redis.get(key);
        console.log(`${key}: ${value ? (key.includes('key') ? `${value.substring(0, 4)}...${value.substring(value.length - 4)}` : value) : 'null'}`);
      }
    }
    
    console.log('\nSettings update completed.');
  } catch (error) {
    console.error('Error in fix script:', error);
  } finally {
    // Close Redis connection
    redis.quit();
    console.log('Redis connection closed.');
  }
}

// Run the fix function
fixRapid7Settings();
