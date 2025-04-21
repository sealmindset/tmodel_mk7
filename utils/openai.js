/**
 * OpenAI API Utility
 * Provides methods for interacting with the OpenAI API
 */
const { Configuration, OpenAIApi } = require('openai');
const redisUtil = require('./redis');
const redisClient = redisUtil.client;

// Redis key constants
const OPENAI_API_KEY_REDIS_KEY = 'settings:openai:api_key';

// Flag to ensure we only log the API key message once per server startup
let apiKeyMessageLogged = false;

// Function to get API key from PostgreSQL, Redis, or environment variables
const getApiKey = async () => {
  try {
    // First try to get from PostgreSQL directly
    try {
      // Import the database pool
      const pool = require('../db/db');
      
      // Query the database directly
      const result = await pool.query(
        'SELECT api_key FROM api_keys WHERE provider = $1 AND is_active = true ORDER BY created_at DESC LIMIT 1',
        ['openai']
      );
      
      if (result.rows && result.rows.length > 0) {
        const apiKey = result.rows[0].api_key;
        if (apiKey && apiKey.length > 0) {
          if (!apiKeyMessageLogged) {
            console.log('Successfully loaded OpenAI API key from PostgreSQL database');
            apiKeyMessageLogged = true;
          }
          // Store in Redis for faster access next time
          try {
            await redisClient.set(OPENAI_API_KEY_REDIS_KEY, apiKey);
            console.log('Cached PostgreSQL API key in Redis');
          } catch (redisError) {
            console.warn('Failed to cache PostgreSQL API key in Redis:', redisError.message);
          }
          return apiKey;
        }
      }
    } catch (pgError) {
      console.warn('Error retrieving API key from PostgreSQL:', pgError.message);
    }
    
    // Second, try to get from Redis
    const redisApiKey = await redisClient.get(OPENAI_API_KEY_REDIS_KEY);
    
    if (redisApiKey && redisApiKey.length > 0) {
      if (!apiKeyMessageLogged) {
        console.log('Successfully loaded OpenAI API key from Redis settings');
        apiKeyMessageLogged = true;
      }
      return redisApiKey;
    }
    
    // If not in PostgreSQL or Redis, check environment variables as last resort
    const envApiKey = process.env.OPENAI_API_KEY || process.env.API_KEY || '';
    
    if (!envApiKey) {
      console.warn('OpenAI API key not found in PostgreSQL, Redis, or environment variables');
    } else if (!apiKeyMessageLogged) {
      // Only log this message once per server startup
      console.log('Successfully loaded OpenAI API key from environment variables (fallback)');
      apiKeyMessageLogged = true;
    }
    
    return envApiKey;
  } catch (error) {
    console.error('Error retrieving API key:', error);
    // Fall back to environment variables
    return process.env.OPENAI_API_KEY || process.env.API_KEY || '';
  }
};

// Synchronous version for immediate initialization
const getApiKeySync = () => {
  // For initial setup, we can only use environment variables
  // Later calls will use getApiKey() which checks Redis first
  return process.env.OPENAI_API_KEY || process.env.API_KEY || '';
};

// Create a configuration with the API key
let configuration = new Configuration({
  apiKey: getApiKeySync(), // Use sync version for initial setup
});

// Create an OpenAI API client
let openai = new OpenAIApi(configuration);

// Function to refresh the API client with a new key
const refreshClient = async () => {
  try {
    const apiKey = await getApiKey();
    console.log('refreshClient - API key retrieved, length:', apiKey ? apiKey.length : 0);
    if (apiKey) {
      console.log('refreshClient - API key starts with:', apiKey.substring(0, 4));
    } else {
      console.log('refreshClient - No API key available!');
    }
    
    // Create a new configuration with the API key
    configuration = new Configuration({ apiKey });
    
    // Create a new OpenAI API client
    openai = new OpenAIApi(configuration);
    console.log('refreshClient - OpenAI client refreshed with new key');
    return true;
  } catch (error) {
    console.error('Error refreshing OpenAI client:', error);
    return false;
  }
};

/**
 * Check if the OpenAI API is accessible
 * @returns {Promise<boolean>} true if connected, false otherwise
 */
const checkStatus = async () => {
  try {
    // Refresh the client to ensure we have the latest API key
    await refreshClient();
    
    // First check if we have an API key
    const apiKey = await getApiKey();
    console.log('OpenAI status check - API key retrieved, length:', apiKey ? apiKey.length : 0);
    if (apiKey) {
      console.log('OpenAI status check - API key starts with:', apiKey.substring(0, 4));
      console.log('OpenAI status check - API key ends with:', apiKey.substring(apiKey.length - 4));
    }
    
    if (!apiKey) {
      console.error('OpenAI status check failed: No API key provided');
      return false;
    }
    
    console.log('OpenAI status check - Making API call to test connectivity...');
    // Use a lightweight models list call to check connectivity
    await openai.listModels();
    console.log('OpenAI status check - API call successful!');
    return true;
  } catch (error) {
    console.error('OpenAI connection error:', error.message);
    // More detailed error information
    if (error.response) {
      // The request was made, but the API returned an error status code
      console.error(`API error status: ${error.response.status}`);
      console.error(`API error details: ${JSON.stringify(error.response.data)}`);
      
      // Check for specific error types
      if (error.response.status === 401) {
        console.error('Authentication error: API key is invalid or missing');
      } else if (error.response.status === 429) {
        console.error('Rate limit exceeded: Too many requests');
      }
    } else if (error.request) {
      // The request was made but no response was received
      console.error('No response received from OpenAI API');
    }
    return false;
  }
};

// Store recent API events for monitoring
const apiEvents = [];
const MAX_EVENTS = 50; // Maximum number of events to keep

/**
 * Add an event to the API events log
 * @param {string} type - Type of event (request or response)
 * @param {object} data - Event data
 */
const logApiEvent = (type, data) => {
  // Create event object with timestamp
  const event = {
    id: Date.now() + Math.random().toString(36).substr(2, 5),
    timestamp: new Date().toISOString(),
    type,
    data: typeof data === 'object' ? JSON.parse(JSON.stringify(data)) : data
  };
  
  // Add to beginning of array (newest first)
  apiEvents.unshift(event);
  
  // Trim array to maximum size
  if (apiEvents.length > MAX_EVENTS) {
    apiEvents.length = MAX_EVENTS;
  }
  
  // Log to console for debugging
  console.log(`OpenAI API ${type}:`, 
    type === 'request' ? 
      `Model: ${data.model}, Prompt: ${data.prompt?.substring(0, 50)}...` : 
      `Response received, tokens: ${data.usage?.total_tokens || 'N/A'}`
  );
};

/**
 * Get all logged API events
 * @returns {Array} - Array of API events
 */
const getApiEvents = () => apiEvents;

/**
 * Get a completion from the OpenAI API
 * @param {string} prompt - The prompt to send to the API
 * @param {string} model - The model to use (default: gpt-3.5-turbo)
 * @param {number} maxTokens - Maximum number of tokens to generate
 * @returns {Promise<Object>} - The API response
 */
const getCompletion = async (prompt, model = 'gpt-3.5-turbo', maxTokens = 100) => {
  try {
    // Refresh the client to ensure we have the latest API key
    await refreshClient();

    let requestParams;
    let response;
    
    // For chat models
    if (model.includes('gpt-3.5') || model.includes('gpt-4')) {
      requestParams = {
        model: model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: maxTokens,
      };
      
      // Log request event
      logApiEvent('request', {
        model,
        prompt,
        maxTokens,
        type: 'chat',
        timestamp: new Date().toISOString()
      });
      
      response = await openai.createChatCompletion(requestParams);
    } 
    // For older completion models
    else {
      requestParams = {
        model: model,
        prompt: prompt,
        max_tokens: maxTokens,
      };
      
      // Log request event
      logApiEvent('request', {
        model,
        prompt,
        maxTokens,
        type: 'completion',
        timestamp: new Date().toISOString()
      });
      
      response = await openai.createCompletion(requestParams);
    }
    
    // Log response event
    logApiEvent('response', response.data);
    
    return response.data;
  } catch (error) {
    // Log error event
    logApiEvent('error', {
      message: error.message,
      code: error.response?.status,
      details: error.response?.data
    });
    
    console.error('Error fetching from OpenAI API:', error.message);
    throw error;
  }
};

/**
 * Fetch available models from OpenAI API
 * Returns array of model ids (e.g., gpt-3.5-turbo, gpt-4, etc.)
 */
const fetchAvailableModels = async () => {
  try {
    await refreshClient();
    const response = await openai.listModels();
    // Filter for models that are chat/completion capable
    const models = response.data.data
      .map(m => m.id)
      .filter(id => id.startsWith('gpt-'));
    return models;
  } catch (error) {
    console.error('Error fetching OpenAI models:', error.message);
    return [];
  }
};

/**
 * Helper: Get preferred OpenAI config (provider, apiKey, model) from Redis
 * Returns { provider, apiKey, model }
 */
const getPreferredOpenAIConfig = async () => {
  const provider = await redisClient.get('settings:llm:provider') || 'openai';
  if (provider !== 'openai') return null;
  const apiKey = await redisClient.get('settings:openai:api_key');
  const model = await redisClient.get('settings:api:openai:model') || 'gpt-3.5-turbo';
  return { provider, apiKey, model };
};

/**
 * Verify that the OpenAI API key is valid by making a test request
 * @returns {Promise<{valid: boolean, source: string, message: string}>}
 */
const verifyApiKey = async () => {
  try {
    // Get the API key using our prioritized approach
    const apiKey = await getApiKey();
    
    if (!apiKey) {
      return {
        valid: false,
        source: 'none',
        message: 'No API key found in any storage location'
      };
    }
    
    // Determine the source of the API key
    let source = 'unknown';
    
    // Check if it matches the environment variable
    if (apiKey === process.env.OPENAI_API_KEY) {
      source = 'environment';
    } else {
      // Check if it's from Redis or PostgreSQL
      try {
        const redisApiKey = await redisClient.get(OPENAI_API_KEY_REDIS_KEY);
        if (apiKey === redisApiKey) {
          source = 'redis';
        } else {
          // If it's not from environment or Redis, assume PostgreSQL
          source = 'postgresql';
        }
      } catch (redisError) {
        // If Redis check fails, we can't determine if it's from Redis
        console.warn('Error checking Redis for API key source:', redisError.message);
      }
    }
    
    // Make a lightweight API call to verify the key
    const response = await fetch('https://api.openai.com/v1/models', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (response.ok) {
      return {
        valid: true,
        source,
        message: `Valid API key found in ${source}`
      };
    } else {
      const errorData = await response.json().catch(() => ({}));
      return {
        valid: false,
        source,
        message: `Invalid API key from ${source}: ${errorData.error?.message || response.statusText}`
      };
    }
  } catch (error) {
    return {
      valid: false,
      source: 'error',
      message: `Error verifying API key: ${error.message}`
    };
  }
};

module.exports = {
  openai,
  checkStatus,
  getCompletion,
  getApiKey,
  getApiEvents,
  logApiEvent,
  refreshClient,
  fetchAvailableModels,
  getPreferredOpenAIConfig,
  verifyApiKey
};
