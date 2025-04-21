/**
 * Redis Provider Fix Script
 * 
 * This script directly interacts with Redis to fix any issues with the LLM provider setting.
 * Run it with: node fix-redis-provider.js [provider]
 * Where [provider] is either 'openai' or 'ollama'
 */

// Import Redis client
const redis = require('redis');
require('dotenv').config();

// Constants
const LLM_PROVIDER_REDIS_KEY = 'settings:llm:provider';

// Create a dedicated Redis client for this fix
const redisClient = redis.createClient({
  socket: {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
  },
  password: process.env.REDIS_PASSWORD || '',
});

async function fixRedisProvider() {
  try {
    // Get provider from command line or default to 'ollama'
    const provider = process.argv[2] || 'ollama';
    
    if (provider !== 'openai' && provider !== 'ollama') {
      console.error('Error: Provider must be either "openai" or "ollama"');
      process.exit(1);
    }
    
    console.log(`Fixing Redis provider to: ${provider}`);
    
    // Connect to Redis
    await redisClient.connect();
    console.log('Connected to Redis');
    
    // Check current value
    const currentValue = await redisClient.get(LLM_PROVIDER_REDIS_KEY);
    console.log(`Current provider value: ${currentValue}`);
    
    // Force set the provider
    await redisClient.set(LLM_PROVIDER_REDIS_KEY, provider);
    console.log(`Provider set to: ${provider}`);
    
    // Verify the value was set
    const newValue = await redisClient.get(LLM_PROVIDER_REDIS_KEY);
    console.log(`Verified new provider value: ${newValue}`);
    
    if (newValue !== provider) {
      console.error('ERROR: Value verification failed!');
    } else {
      console.log('SUCCESS: Provider value set correctly!');
    }
    
    // Close Redis connection
    await redisClient.quit();
    console.log('Redis connection closed');
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

// Run the fix
fixRedisProvider();
