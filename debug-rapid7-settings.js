/**
 * Debug Rapid7 Settings
 * 
 * This script checks and displays the current Rapid7 API settings in Redis
 * and attempts to validate the connection.
 */

const redis = require('./utils/redis').client;
const axios = require('axios');

async function debugRapid7Settings() {
  try {
    console.log('Checking Rapid7 API settings in Redis...');
    
    // Get API URL and Key from Redis
    const [apiUrl, apiKey] = await Promise.all([
      redis.get('settings:rapid7:api_url'),
      redis.get('settings:rapid7:api_key')
    ]);
    
    console.log('Rapid7 API URL:', apiUrl || 'Not set');
    console.log('Rapid7 API Key:', apiKey ? `${apiKey.substring(0, 4)}...${apiKey.substring(apiKey.length - 4)}` : 'Not set');
    
    // Test the connection if settings are available
    if (apiUrl && apiKey) {
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
    } else {
      console.log('\n⚠️ Cannot test connection: API URL or API Key not set in Redis');
    }
    
    // Check all Redis keys related to Rapid7
    console.log('\nAll Redis keys related to Rapid7:');
    const allKeys = await redis.keys('*rapid7*');
    
    if (allKeys.length === 0) {
      console.log('No keys found with "rapid7" in the name');
    } else {
      for (const key of allKeys) {
        const value = await redis.get(key);
        console.log(`${key}: ${value ? (key.includes('key') ? '****' : value) : 'null'}`);
      }
    }
    
    // Try to save the settings directly
    console.log('\nAttempting to save Rapid7 settings directly to Redis...');
    
    const testUrl = 'https://us.api.insight.rapid7.com';
    const testKey = 'c8428ef0-6786-4a6e-aaa8-ac4841d87894';
    
    await redis.set('settings:rapid7:api_url', testUrl);
    await redis.set('settings:rapid7:api_key', testKey);
    
    console.log('Settings saved. Verifying...');
    
    const [newUrl, newKey] = await Promise.all([
      redis.get('settings:rapid7:api_url'),
      redis.get('settings:rapid7:api_key')
    ]);
    
    console.log('Rapid7 API URL after save:', newUrl);
    console.log('Rapid7 API Key after save:', newKey ? `${newKey.substring(0, 4)}...${newKey.substring(newKey.length - 4)}` : 'Not set');
    
    if (newUrl === testUrl && newKey === testKey) {
      console.log('\n✅ Settings saved successfully to Redis');
    } else {
      console.log('\n❌ Failed to save settings to Redis');
    }
  } catch (error) {
    console.error('Error in debug script:', error);
  } finally {
    // Close Redis connection
    redis.quit();
  }
}

// Run the debug function
debugRapid7Settings();
