/**
 * Set Rapid7 Settings
 * 
 * This script directly sets the Rapid7 API settings in Redis
 * using a fresh Redis client.
 */

require('dotenv').config();
const { createClient } = require('redis');

async function setRapid7Settings() {
  // Create a new Redis client
  const redis = createClient({
    url: `redis://${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || 6379}`
  });
  
  try {
    console.log('Connecting to Redis...');
    await redis.connect();
    console.log('Connected to Redis successfully!');
    
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
    console.error('Error in set script:', error);
  } finally {
    // Close Redis connection
    await redis.quit();
    console.log('Redis connection closed.');
  }
}

// Run the function
setRapid7Settings();
