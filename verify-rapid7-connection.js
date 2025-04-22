/**
 * Verify Rapid7 Connection
 * 
 * This script tests the Rapid7 API connection directly using the settings from Redis
 * and logs detailed diagnostic information.
 */

require('dotenv').config();
const axios = require('axios');
const { createClient } = require('redis');

async function verifyRapid7Connection() {
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
    console.log('\n=== Testing direct API connection ===');
    console.log(`Making request to: ${apiUrl}/validate`);
    console.log('Headers:', {
      'X-Api-Key': `${apiKey.substring(0, 4)}...${apiKey.substring(apiKey.length - 4)}`,
      'Content-Type': 'application/json'
    });
    
    try {
      const response = await axios.get(`${apiUrl}/validate`, {
        headers: {
          'X-Api-Key': apiKey,
          'Content-Type': 'application/json'
        }
      });
      
      console.log('Response status:', response.status);
      console.log('Response data:', JSON.stringify(response.data, null, 2));
      
      if (response.status === 200 && response.data && response.data.message === 'Authorized') {
        console.log('\n✅ Direct API connection successful!');
      } else {
        console.log('\n❌ Direct API connection failed: Unexpected response');
      }
    } catch (error) {
      console.error('\n❌ Direct API connection failed:', error.message);
      if (error.response) {
        console.error('Response status:', error.response.status);
        console.error('Response data:', error.response.data);
      }
    }
    
    // Now test the API endpoint that the UI uses
    console.log('\n=== Testing API endpoint used by UI ===');
    console.log(`Making request to: http://localhost:3000/api/rapid7-test/connection`);
    
    try {
      const response = await axios.get('http://localhost:3000/api/rapid7-test/connection');
      
      console.log('Response status:', response.status);
      console.log('Response data:', JSON.stringify(response.data, null, 2));
      
      if (response.status === 200 && response.data && response.data.success) {
        console.log('\n✅ API endpoint connection successful!');
      } else {
        console.log('\n❌ API endpoint connection failed:', response.data.message);
      }
    } catch (error) {
      console.error('\n❌ API endpoint connection failed:', error.message);
      if (error.response) {
        console.error('Response status:', error.response.status);
        console.error('Response data:', JSON.stringify(error.response.data, null, 2));
      }
    }
    
    // Test the POST endpoint with the same credentials
    console.log('\n=== Testing POST endpoint used by UI "Test Connection" button ===');
    console.log(`Making request to: http://localhost:3000/api/rapid7-test/connection`);
    
    try {
      const response = await axios.post('http://localhost:3000/api/rapid7-test/connection', {
        apiUrl,
        apiKey
      });
      
      console.log('Response status:', response.status);
      console.log('Response data:', JSON.stringify(response.data, null, 2));
      
      if (response.status === 200 && response.data && response.data.success) {
        console.log('\n✅ POST endpoint connection successful!');
      } else {
        console.log('\n❌ POST endpoint connection failed:', response.data.message);
      }
    } catch (error) {
      console.error('\n❌ POST endpoint connection failed:', error.message);
      if (error.response) {
        console.error('Response status:', error.response.status);
        console.error('Response data:', JSON.stringify(error.response.data, null, 2));
      }
    }
    
  } catch (error) {
    console.error('Error in verification script:', error);
  } finally {
    // Close Redis connection
    await redis.quit();
    console.log('\nRedis connection closed.');
  }
}

// Run the verification
verifyRapid7Connection();
