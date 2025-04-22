/**
 * Ollama API Utility
 * Provides methods for interacting with the local Ollama API
 */
const axios = require('axios');
const redisUtil = require('./redis');

// Redis key constants
const OLLAMA_API_URL_REDIS_KEY = 'settings:ollama:api_url';
const OLLAMA_MODEL_REDIS_KEY = 'settings:ollama:model';

// Default Ollama endpoint
let OLLAMA_API_URL = process.env.OLLAMA_API_URL || 'http://localhost:11434/api';

// Default Ollama model
let DEFAULT_MODEL = process.env.OLLAMA_MODEL || 'llama3.3:latest';

// Flag to ensure we only log the API status message once per server startup
let apiStatusMessageLogged = false;

// Store recent API events for monitoring
const apiEvents = [];
const MAX_EVENTS = 50; // Maximum number of events to keep

/**
 * Check if the Ollama API is accessible
 * @returns {Promise<boolean>} true if connected, false otherwise
 */
const checkStatus = async () => {
  try {
    // Use a lightweight models list call to check connectivity
    const response = await axios.get(`${OLLAMA_API_URL}/tags`);
    
    if (response.status === 200 && response.data && response.data.models) {
      if (!apiStatusMessageLogged) {
        console.log(`Successfully connected to Ollama API with ${response.data.models.length} models available`);
        apiStatusMessageLogged = true;
      }
      return true;
    }
    return false;
  } catch (error) {
    console.error('Ollama connection error:', error.message);
    // More detailed error information
    if (error.response) {
      console.error(`API error status: ${error.response.status}`);
      console.error(`API error details: ${JSON.stringify(error.response.data)}`);
    } else if (error.request) {
      console.error('No response received from Ollama API');
    }
    return false;
  }
};

/**
 * Get list of available Ollama models
 * @returns {Promise<Array>} List of available models
 */
const getModels = async () => {
  try {
    const response = await axios.get(`${OLLAMA_API_URL}/tags`);
    if (response.status === 200 && response.data && response.data.models) {
      return response.data.models;
    }
    return [];
  } catch (error) {
    console.error('Error fetching Ollama models:', error.message);
    return [];
  }
};

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
  console.log(`Ollama API ${type}:`, 
    type === 'request' ? 
      `Model: ${data.model}, Prompt: ${data.prompt?.substring(0, 50)}...` : 
      `Response received`
  );
};

/**
 * Get all logged API events
 * @returns {Array} - Array of API events
 */
const getApiEvents = () => apiEvents;

/**
 * Get a completion from the Ollama API
 * @param {string} prompt - The prompt to send to the API
 * @param {string} model - The model to use (default: llama3.3)
 * @param {number} maxTokens - Maximum number of tokens to generate
 * @returns {Promise<Object>} - The API response
 */
const getCompletion = async (prompt, model = DEFAULT_MODEL, maxTokens = 100) => {
  try {
    // Prepare request parameters
    const requestParams = {
      model,
      prompt,
      max_tokens: maxTokens,
      stream: false
    };
    
    // Log request event
    logApiEvent('request', {
      model,
      prompt,
      maxTokens,
      timestamp: new Date().toISOString()
    });
    
    const response = await axios.post(`${OLLAMA_API_URL}/generate`, requestParams);
    console.log('Raw Ollama API response structure:', JSON.stringify(response.data).substring(0, 200));
    
    // Format response to match OpenAI structure
    const formattedResponse = {
      id: `ollama-${Date.now()}`,
      object: 'text_completion',
      created: Math.floor(Date.now() / 1000),
      model,
      choices: [{
        text: response.data.response,
        index: 0,
        finish_reason: 'stop'
      }],
      // Include the response directly on the object for app.js to find it
      response: response.data.response,
      usage: {
        prompt_tokens: prompt.length / 4, // Rough estimation
        completion_tokens: response.data.response.length / 4, // Rough estimation
        total_tokens: (prompt.length + response.data.response.length) / 4 // Rough estimation
      }
    };
    
    // Log response event
    logApiEvent('response', formattedResponse);
    
    return formattedResponse;
  } catch (error) {
    // Log error event
    logApiEvent('error', {
      message: error.message,
      code: error.response?.status,
      details: error.response?.data
    });
    
    console.error('Error fetching from Ollama API:', error.message);
    throw error;
  }
};

/**
 * Get a chat completion from the Ollama API
 * @param {Array} messages - Array of message objects with role and content
 * @param {string} model - The model to use (default: llama3.3)
 * @param {number} maxTokens - Maximum number of tokens to generate
 * @returns {Promise<Object>} - The API response formatted like OpenAI's
 */
const getChatCompletion = async (messages, model = DEFAULT_MODEL, maxTokens = 100) => {
  try {
    // Convert messages array to a prompt format that Ollama can understand
    const conversationText = messages.map(msg => {
      const role = msg.role === 'assistant' ? 'Assistant' : 'User';
      return `${role}: ${msg.content}`;
    }).join('\n\n');
    
    const finalPrompt = `${conversationText}\n\nAssistant:`;
    
    // Prepare request parameters
    const requestParams = {
      model,
      prompt: finalPrompt,
      max_tokens: maxTokens,
      stream: false
    };
    
    // Log request event
    logApiEvent('request', {
      model,
      messages,
      maxTokens,
      timestamp: new Date().toISOString()
    });
    
    const response = await axios.post(`${OLLAMA_API_URL}/generate`, requestParams);
    
    // Format response to match OpenAI chat structure
    const formattedResponse = {
      id: `ollama-chat-${Date.now()}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model,
      choices: [{
        message: {
          role: 'assistant',
          content: response.data.response
        },
        index: 0,
        finish_reason: 'stop'
      }],
      usage: {
        prompt_tokens: finalPrompt.length / 4, // Rough estimation
        completion_tokens: response.data.response.length / 4, // Rough estimation
        total_tokens: (finalPrompt.length + response.data.response.length) / 4 // Rough estimation
      }
    };
    
    // Log response event
    logApiEvent('response', formattedResponse);
    
    return formattedResponse;
  } catch (error) {
    // Log error event
    logApiEvent('error', {
      message: error.message,
      code: error.response?.status,
      details: error.response?.data
    });
    
    console.error('Error fetching chat completion from Ollama API:', error.message);
    throw error;
  }
};

/**
 * Test connection to Ollama API with a provided API URL
 * @param {string} apiUrl - The API URL to test (e.g., 'http://localhost:11434')
 * @returns {Promise<Object>} - { success: boolean, models?: Array, error?: string }
 */
const testConnection = async (apiUrl) => {
  try {
    if (!apiUrl) {
      return { success: false, error: 'API URL is required' };
    }
    
    // Normalize API URL format
    let baseUrl = apiUrl;
    if (baseUrl.endsWith('/')) {
      baseUrl = baseUrl.slice(0, -1);
    }
    if (baseUrl.endsWith('/api')) {
      baseUrl = baseUrl.slice(0, -4);
    }
    
    // Make a request to get available models
    const response = await axios.get(`${baseUrl}/api/tags`, {
      timeout: 5000 // 5-second timeout
    });
    
    if (response.status !== 200) {
      return { 
        success: false, 
        error: `API returned ${response.status}: ${response.statusText}`
      };
    }
    
    // Check if response has the expected structure
    if (!response.data || !response.data.models || !Array.isArray(response.data.models)) {
      return { 
        success: false, 
        error: 'Invalid API response structure'
      };
    }
    
    // Extract useful model information
    const models = response.data.models.map(model => ({
      name: model.name,
      modified_at: model.modified_at,
      size: model.size,
      digest: model.digest?.substring(0, 8) || ''
    }));
    
    // Cache API URL in Redis (using environment variables to avoid circular dependency)
    try {
      const redis = require('./redis');
      await redis.client.set('settings:ollama:api_url', baseUrl);
      console.log('Cached tested Ollama API URL in Redis');
    } catch (redisError) {
      console.warn('Failed to cache Ollama API URL in Redis:', redisError.message);
    }
    
    return { 
      success: true,
      models
    };
  } catch (error) {
    console.error('Error testing Ollama connection:', error.message);
    
    // Provide more detailed error information
    let errorMessage = error.message;
    if (error.code === 'ECONNREFUSED') {
      errorMessage = `Connection refused at ${apiUrl}. Make sure Ollama is running.`;
    } else if (error.code === 'ETIMEDOUT' || error.code === 'TIMEOUT') {
      errorMessage = `Connection to ${apiUrl} timed out. Check your network or if Ollama is running.`;
    }
    
    return { 
      success: false, 
      error: errorMessage
    };
  }
};

/**
 * Reload the Ollama client with current settings from Redis
 * @returns {Promise<boolean>} - true if successful, false otherwise
 */
const reloadClient = async () => {
  try {
    // Get API URL from Redis
    const redisClient = redisUtil.client;
    const storedApiUrl = await redisClient.get(OLLAMA_API_URL_REDIS_KEY);
    if (storedApiUrl) {
      OLLAMA_API_URL = storedApiUrl.endsWith('/api') ? storedApiUrl : `${storedApiUrl}/api`;
      console.log(`Reloaded Ollama API URL from Redis: ${OLLAMA_API_URL}`);
    }
    
    // Get default model from Redis
    const storedModel = await redisClient.get(OLLAMA_MODEL_REDIS_KEY);
    if (storedModel) {
      DEFAULT_MODEL = storedModel;
      console.log(`Reloaded Ollama default model from Redis: ${DEFAULT_MODEL}`);
    }
    
    // Reset the logged status message flag so we get fresh status messages
    apiStatusMessageLogged = false;
    
    // Test connection with new settings
    const isConnected = await checkStatus();
    return isConnected;
  } catch (error) {
    console.error('Error reloading Ollama client:', error.message);
    return false;
  }
};

module.exports = {
  checkStatus,
  getCompletion,
  getChatCompletion,
  getModels,
  getApiEvents,
  logApiEvent,
  testConnection,
  reloadClient
};
