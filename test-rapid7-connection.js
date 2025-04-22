/**
 * Test Rapid7 API Connection
 * 
 * This script tests the connection to the Rapid7 API using the settings from Redis
 */

require('dotenv').config();
const { createClient } = require('redis');
const axios = require('axios');

async function testRapid7Connection() {
  // Create a new Redis client
  const redis = createClient({
    url: `redis://${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || 6379}`
  });
  
  try {
    console.log('Connecting to Redis...');
    await redis.connect();
    console.log('Connected to Redis successfully!');
    
    // Get the Rapid7 API settings from Redis
    const [apiUrl, apiKey] = await Promise.all([
      redis.get('settings:rapid7:api_url'),
      redis.get('settings:rapid7:api_key')
    ]);
    
    console.log(`Retrieved Rapid7 API URL: ${apiUrl || 'Not set'}`);
    console.log(`Retrieved Rapid7 API Key: ${apiKey ? `${apiKey.substring(0, 4)}...${apiKey.substring(apiKey.length - 4)}` : 'Not set'}`);
    
    if (!apiUrl || !apiKey) {
      console.log('\n❌ Cannot test connection: API URL or API Key not set in Redis');
      return;
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
      console.log('Response data:', JSON.stringify(response.data, null, 2));
      
      if (response.status === 200 && response.data && response.data.message === 'Authorized') {
        console.log('\n✅ Connection successful! The API key is valid.');
      } else {
        console.log('\n❌ Connection failed: Unexpected response');
      }
      
      // Now let's test the Rapid7 service from the application
      console.log('\nTesting the Rapid7 service from the application...');
      const rapid7Service = require('./services/rapid7Service');
      
      // Ensure the client is refreshed with the latest settings
      await rapid7Service.refreshClient();
      
      // Test the connection using the service
      const isConnected = await rapid7Service.checkConnection();
      
      if (isConnected) {
        console.log('\n✅ Rapid7 service connection successful!');
      } else {
        console.log('\n❌ Rapid7 service connection failed.');
      }
      
    } catch (error) {
      console.error('\n❌ Connection failed:', error.message);
      if (error.response) {
        console.error('Response status:', error.response.status);
        console.error('Response data:', error.response.data);
      }
    }
  } catch (error) {
    console.error('Error in test script:', error);
  } finally {
    // Close Redis connection
    await redis.quit();
    console.log('Redis connection closed.');
  }
}

// Run the function
testRapid7Connection();
