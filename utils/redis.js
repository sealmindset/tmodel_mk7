/**
 * Redis Client Utility
 * Provides a shared Redis client instance
 */
const redis = require('redis');

// Initialize logger - defer requiring to avoid circular dependencies
let logger;
function getLogger() {
  if (!logger) {
    try {
      logger = require('./logger').forModule('redis');
    } catch (e) {
      // If logger isn't available yet, just use console
      logger = {
        debug: console.debug,
        info: console.log,
        warn: console.warn,
        error: console.error
      };
    }
    return logger;
  }
  return logger;
}

// Redis connection configuration from environment variables
const redisHost = process.env.REDIS_HOST || 'localhost';
const redisPort = process.env.REDIS_PORT || 6379;

// Create Redis client
const client = redis.createClient({
  socket: {
    host: redisHost,
    port: redisPort,
  },
  password: process.env.REDIS_PASSWORD || '',
});

// Handle Redis connection events
client.on('connect', () => {
  console.log('Redis client connected');
  getLogger().info('Redis client connected');
});

client.on('error', (err) => {
  console.error('Redis client error:', err);
  getLogger().error('Redis client error', null, err);
});

// Export a connect function instead of auto-connecting
const connect = async () => {
  try {
    // Only connect if not already connected
    if (!client.isOpen) {
      await client.connect();
      getLogger().info('Redis client connected');
    } else {
      getLogger().debug('Redis client already connected');
    }
    return true;
  } catch (error) {
    getLogger().error('Failed to connect to Redis', null, error);
    return false;
  }
};

// Helper functions for Redis keys
const getRedisValue = async (key, defaultValue = null) => {
  try {
    // Always ensure connection before any operation
    if (!client.isOpen) {
      getLogger().debug(`Connecting to Redis before getting key: ${key}`);
      await client.connect();
    }
    
    getLogger().debug(`Getting Redis value for key: ${key}`);
    const value = await client.get(key);
    if (value === null) {
      getLogger().debug(`Redis key '${key}' not found${defaultValue !== null ? ', using default value' : ''}`);
      
      // Store the default value for future use if provided
      if (defaultValue !== null) {
        await client.set(key, defaultValue);
        return defaultValue;
      }
    } else {
      const truncatedValue = value?.substring(0, 10) + (value?.length > 10 ? '...' : '');
      getLogger().debug(`Retrieved value from Redis: ${key} = ${truncatedValue}`, {
        key,
        valueLength: value?.length || 0
      });
    }
    return value;
  } catch (error) {
    getLogger().error(`Error getting Redis value for key '${key}'`, { key }, error);
    return defaultValue;
  }
};

const storeRedisValue = async (key, value) => {
  try {
    // Always ensure connection before any operation
    if (!client.isOpen) {
      getLogger().debug(`Connecting to Redis before storing key: ${key}`);
      await client.connect();
    }
    
    const truncatedValue = value?.substring(0, 10) + (value?.length > 10 ? '...' : '');
    getLogger().debug(`Storing value in Redis: ${key} = ${truncatedValue}`, {
      key,
      valueLength: value?.length || 0
    });
    
    await client.set(key, value);
    getLogger().debug(`Successfully stored value in Redis: ${key}`);
    return true;
  } catch (error) {
    getLogger().error(`Error storing Redis value for key '${key}'`, { key }, error);
    throw error; // Re-throw to allow proper error handling by callers
  }
};

// Function to initialize necessary default settings
const initializeDefaultSettings = async () => {
  try {
    // Define default settings keys
    const defaultSettings = {
      'settings:llm:provider': 'ollama',
      'settings:openai:api_model': 'gpt-3.5-turbo',
      'settings:ollama:model': 'llama3.3:latest'
    };
    
    getLogger().info('Initializing default LLM settings...');
    
    // For each setting, check if it exists and set default if not
    for (const [key, defaultValue] of Object.entries(defaultSettings)) {
      const value = await client.get(key);
      if (value === null) {
        await client.set(key, defaultValue);
        getLogger().info(`Initialized default setting: ${key} = ${defaultValue}`);
      } else {
        getLogger().debug(`Existing setting found: ${key} = ${value}`);
      }
    }
    
    return true;
  } catch (error) {
    getLogger().error('Error initializing default settings', null, error);
    return false;
  }
};

// Function to get the Redis client
const getClient = () => {
  if (!client.isOpen) {
    // Connect if not already connected
    getLogger().debug('Auto-connecting Redis client in getClient()');
    connect().catch(err => {
      getLogger().error('Failed to auto-connect Redis client', null, err);
    });
  }
  return client;
};

// Export the client and functions
module.exports = {
  client,
  connect,
  getRedisValue,
  storeRedisValue,
  initializeDefaultSettings,
  getClient
};
