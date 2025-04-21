/**
 * Settings Routes
 */
const express = require('express');
const router = express.Router();
const redisUtil = require('../utils/redis');
const openaiUtil = require('../utils/openai');
const ollamaUtil = require('../utils/ollama');
const redisClient = redisUtil.client;

// Import auth middleware
let ensureAuthenticated;
try {
  ensureAuthenticated = require('../auth')(express()).ensureAuthenticated;
} catch (error) {
  console.log('Using direct middleware import for auth');
  ensureAuthenticated = require('../middleware/auth').ensureAuthenticated;
}

// Constants for Redis keys
const OPENAI_API_KEY_REDIS_KEY = 'settings:openai:api_key';
const OPENAI_MODEL_REDIS_KEY = 'settings:api:openai:model'; // Updated to match app.js keys
const LLM_PROVIDER_REDIS_KEY = 'settings:llm:provider';
const OLLAMA_MODEL_REDIS_KEY = 'settings:api:ollama:model'; // Updated to match app.js keys

// Debug all Redis keys on startup
console.log('Settings.js - Redis key constants:');
console.log('OPENAI_API_KEY_REDIS_KEY:', OPENAI_API_KEY_REDIS_KEY);
console.log('OPENAI_MODEL_REDIS_KEY:', OPENAI_MODEL_REDIS_KEY);
console.log('LLM_PROVIDER_REDIS_KEY:', LLM_PROVIDER_REDIS_KEY);
console.log('OLLAMA_MODEL_REDIS_KEY:', OLLAMA_MODEL_REDIS_KEY);

// Debug endpoint to see all settings in Redis
router.get('/debug', ensureAuthenticated, async (req, res) => {
  try {
    // Get all the settings from Redis
    const keys = [
      LLM_PROVIDER_REDIS_KEY,
      OPENAI_MODEL_REDIS_KEY,
      OLLAMA_MODEL_REDIS_KEY,
      OPENAI_API_KEY_REDIS_KEY
    ];
    
    const values = {};
    for (const key of keys) {
      values[key] = await redisClient.get(key);
    }
    
    // Also get keys using pattern matching
    const allSettingsKeys = await redisClient.keys('settings:*');
    const allSettings = {};
    for (const key of allSettingsKeys) {
      allSettings[key] = await redisClient.get(key);
    }
    
    res.json({
      specificKeys: values,
      allSettings: allSettings,
      processEnv: {
        LLM_PROVIDER: process.env.LLM_PROVIDER,
        OPENAI_MODEL: process.env.OPENAI_MODEL,
        OLLAMA_MODEL: process.env.OLLAMA_MODEL
      }
    });
  } catch (error) {
    console.error('Redis debug error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get API settings page
router.get('/', ensureAuthenticated, async (req, res) => {
  try {
    // Get service status
    const redisStatus = await checkRedisStatus();
    const openaiStatus = await openaiUtil.checkStatus();
    let ollamaStatus = false;
    let availableOllamaModels = [];
    
    try {
      ollamaStatus = await ollamaUtil.checkStatus();
      if (ollamaStatus) {
        availableOllamaModels = await ollamaUtil.getModels();
      }
    } catch (err) {
      console.error('Error checking Ollama status:', err);
    }
    
    // Get stored settings with debug logging
    console.log('GET /api-settings - Starting to retrieve Redis values');
    let openaiApiKey = await getStoredOpenAIKey() || '';
    console.log('GET /api-settings - Retrieved OpenAI API key - length:', openaiApiKey ? openaiApiKey.length : 0);
    
    // Get each setting with careful error handling to ensure all values are retrieved
    let openaiModel = '';
    try {
      // Directly use redisClient for maximum reliability
      openaiModel = await redisClient.get(OPENAI_MODEL_REDIS_KEY);
      console.log('GET /api-settings - Raw Redis openaiModel value:', openaiModel, 'from key', OPENAI_MODEL_REDIS_KEY);
    } catch (err) {
      console.error('Error getting OpenAI model from Redis:', err);
    }
    
    // If not found, check the old key as fallback
    if (!openaiModel) {
      try {
        openaiModel = await redisClient.get('settings:openai:model');
        console.log('GET /api-settings - Fallback key value:', openaiModel, 'from key settings:openai:model');
        
        // If found in the old key, migrate it to the new key
        if (openaiModel) {
          console.log('Migrating value from old key to new key');
          await redisClient.set(OPENAI_MODEL_REDIS_KEY, openaiModel);
        }
      } catch (err) {
        console.error('Error checking fallback Redis key:', err);
      }
    }
    
    // Default as last resort
    openaiModel = openaiModel || 'gpt-3.5-turbo';
    console.log('GET /api-settings - Final openaiModel value to render:', openaiModel);
    
    let llmProvider = '';
    try {
      llmProvider = await getRedisValue(LLM_PROVIDER_REDIS_KEY);
    } catch (err) {
      console.error('Error getting LLM provider from Redis:', err);
    }
    llmProvider = llmProvider || 'openai';
    
    let ollamaModel = '';
    try {
      ollamaModel = await getRedisValue(OLLAMA_MODEL_REDIS_KEY);
    } catch (err) {
      console.error('Error getting Ollama model from Redis:', err);
    }
    ollamaModel = ollamaModel || 'llama3.3';
    
    // Always log all settings for debugging
    console.log('GET /api-settings - Final settings values:');
    console.log('GET /api-settings - Retrieved from Redis - llmProvider:', llmProvider);
    console.log('GET /api-settings - Retrieved from Redis - openaiModel:', openaiModel);
    console.log('GET /api-settings - Retrieved from Redis - ollamaModel:', ollamaModel);
    console.log('GET /api-settings - Process env LLM_PROVIDER:', process.env.LLM_PROVIDER);
    console.log('GET /api-settings - Process env OPENAI_MODEL:', process.env.OPENAI_MODEL);
    console.log('GET /api-settings - Process env OLLAMA_MODEL:', process.env.OLLAMA_MODEL);
    
    // Ensure we have at least one model in the list
    if (availableOllamaModels.length === 0) {
      availableOllamaModels = [{ name: ollamaModel }];
    }
    
    console.log('Available Ollama models:', JSON.stringify(availableOllamaModels));
    // Make sure the saved model is in the exact same format as the models list
    if (availableOllamaModels.length > 0) {
      // Try to find an exact match first
      const exactMatch = availableOllamaModels.find(model => model.name === ollamaModel);
      // If no exact match, look for partial match (e.g., 'llama3.3' vs 'llama3.3:latest')
      if (!exactMatch && ollamaModel) {
        const partialMatch = availableOllamaModels.find(model => 
          model.name.startsWith(ollamaModel) || ollamaModel.startsWith(model.name)
        );
        if (partialMatch) {
          console.log(`Found partial match: ${ollamaModel} => ${partialMatch.name}`);
          ollamaModel = partialMatch.name;
        }
      }
    }
    
    // Rapid7 settings from Redis
    let rapid7ApiUrl = await redisClient.get('settings:rapid7:api_url') || 'http://localhost:3100';
    let rapid7ApiKey = await redisClient.get('settings:rapid7:api_key') || '';
    
    // Ollama API URL from Redis
    let ollamaApiUrl = await redisClient.get('settings:ollama:api_url') || 'http://localhost:11434';
    if (rapid7ApiKey) {
      rapid7ApiKey = maskApiKey(rapid7ApiKey);
    }
    if (openaiApiKey) {
      openaiApiKey = maskApiKey(openaiApiKey);
    }
    // Get any flash messages
    const message = req.session.message || null;
    delete req.session.message;
    res.render('api-settings', {
      openaiApiKey,
      openaiModel,
      openaiStatus,
      redisStatus,
      ollamaStatus,
      ollamaModel,
      ollamaApiUrl,
      llmProvider,
      availableOllamaModels,
      rapid7ApiUrl,
      rapid7ApiKey,
      message
    });
  } catch (error) {
    console.error('Error loading API settings:', error);
    res.render('api-settings', {
      openaiApiKey: '',
      openaiModel: 'gpt-3.5-turbo',
      openaiStatus: false,
      redisStatus: false,
      ollamaStatus: false,
      ollamaModel: 'llama3.3',
      ollamaApiUrl: 'http://localhost:11434',
      llmProvider: 'openai',
      availableOllamaModels: [],
      rapid7Status: false,
      rapid7ApiUrl: 'http://localhost:3100',
      rapid7ApiKey: '',
      message: {
        type: 'danger',
        text: 'Error loading settings: ' + error.message
      }
    });
  }
});

// Debug endpoint for directly setting LLM provider in Redis
router.get('/force-provider/:provider', ensureAuthenticated, async (req, res) => {
  try {
    const provider = req.params.provider || 'openai';
    console.log(`Direct setting of LLM provider to ${provider}`);
    
    // Force direct Redis SET operation for the provider
    await redisClient.set(LLM_PROVIDER_REDIS_KEY, provider);
    
    // Verify it was set correctly
    const verifiedProvider = await redisClient.get(LLM_PROVIDER_REDIS_KEY);
    
    res.json({
      success: true,
      requested: provider,
      actual: verifiedProvider,
      redisKey: LLM_PROVIDER_REDIS_KEY
    });
  } catch (error) {
    console.error('Error in direct provider setting:', error);
    res.status(500).json({ error: error.message });
  }
});

// Test endpoint for directly setting OpenAI model
router.get('/set-model/:model', ensureAuthenticated, async (req, res) => {
  try {
    const model = req.params.model || 'gpt-4';
    console.log(`Direct setting of OpenAI model to ${model}`);
    
    // Save directly to Redis
    await redisClient.set(OPENAI_MODEL_REDIS_KEY, model);
    
    // Verify
    const verifiedModel = await redisClient.get(OPENAI_MODEL_REDIS_KEY);
    console.log(`Directly set model: ${model}, verified: ${verifiedModel}`);
    
    // Clean up old keys
    await redisClient.del('settings:openai:model');
    
    res.json({
      success: true,
      model: model,
      verifiedModel: verifiedModel,
      redisKey: OPENAI_MODEL_REDIS_KEY
    });
  } catch (error) {
    console.error('Error in direct model setting:', error);
    res.status(500).json({ error: error.message });
  }
});

// Save API settings
router.post('/', ensureAuthenticated, async (req, res) => {
  // --- Cascade: Save OpenAI API Key and Model if OpenAI is selected ---
  // Save OpenAI API key if provided and OpenAI is selected
  if (req.body.llmProvider === 'openai' && req.body.openaiApiKey) {
    try {
      await storeOpenAIKey(req.body.openaiApiKey);
      console.log('OpenAI API Key saved to Redis.');
    } catch (err) {
      console.error('Error saving OpenAI API Key:', err);
    }
  }
  // Save OpenAI model if provided and OpenAI is selected
  if (req.body.llmProvider === 'openai' && req.body.openaiModel) {
    try {
      await redisClient.set(OPENAI_MODEL_REDIS_KEY, req.body.openaiModel);
      console.log('OpenAI Model saved to Redis:', req.body.openaiModel);
    } catch (err) {
      console.error('Error saving OpenAI Model:', err);
    }
  }

  try {
    console.log('-------------------------------------------------');
    console.log('FORM SUBMISSION RECEIVED');
    // Robustly extract values from req.body
    let llmProvider = req.body.llmProvider;
    let openaiModel = req.body.openaiModel;
    let ollamaModel = req.body.ollamaModel;
    console.log('[DEBUG] Extracted from req.body:', { llmProvider, openaiModel, ollamaModel });
    console.log('-------------------------------------------------');
    console.log('POST /api-settings - Raw form data:', JSON.stringify(req.body, null, 2));
    
    // First, log all existing Redis values before making any changes
    console.log('CURRENT REDIS VALUES BEFORE CHANGES:');
    
    // Check if any values are undefined, null, or empty strings
    if (!openaiModel) console.log('WARNING: openaiModel is falsy:', openaiModel);
    if (!ollamaModel) console.log('WARNING: ollamaModel is falsy:', ollamaModel);
    if (!llmProvider) console.log('WARNING: llmProvider is falsy:', llmProvider);
    
    // Ensure we have values for all settings, using strict defaults only if completely missing
    const effectiveOpenAiModel = openaiModel || 'gpt-3.5-turbo';
    const effectiveOllamaModel = ollamaModel || 'llama3.3';
    const effectiveLlmProvider = llmProvider || 'openai';
    
    console.log('NORMALIZED VALUES TO SAVE:');
    console.log('- effectiveLlmProvider:', effectiveLlmProvider);
    console.log('- effectiveOpenAiModel:', effectiveOpenAiModel);
    console.log('- effectiveOllamaModel:', effectiveOllamaModel);
    
    // Save Rapid7 API settings (Redis)
    if (rapid7ApiUrl) await redisClient.set('settings:rapid7:api_url', rapid7ApiUrl);
    if (rapid7ApiKey) await redisClient.set('settings:rapid7:api_key', rapid7ApiKey);
    // TODO: Save to PostgreSQL as well (add/update a settings table with keys rapid7_api_url and rapid7_api_key)

    // For Ollama, make sure we're saving the exact model name
    // This handles cases where the model name might be different formats (e.g., llama3.3 vs llama3.3:latest)
    let normalizedOllamaModel = effectiveOllamaModel;
    if (effectiveLlmProvider === 'ollama') {
      try {
        // Get available models to verify against
        const availableModels = await ollamaUtil.getModels();
        console.log('Available models when saving:', JSON.stringify(availableModels));
        
        // Find exact match first
        const exactMatch = availableModels.find(model => model.name === ollamaModel);
        if (exactMatch) {
          normalizedOllamaModel = exactMatch.name;
        } else {
          // Look for partial match
          const partialMatch = availableModels.find(model => 
            model.name.startsWith(ollamaModel) || ollamaModel.startsWith(model.name)
          );
          if (partialMatch) {
            console.log(`Using full model name for save: ${ollamaModel} => ${partialMatch.name}`);
            normalizedOllamaModel = partialMatch.name;
          }
        }
      } catch (err) {
        console.error('Error normalizing Ollama model name:', err);
      }
    }
    
    // Always store the selected LLM provider with direct Redis operations for maximum reliability
    console.log('*****************************************************');
    console.log('* CRITICAL DEBUG: SAVING LLM PROVIDER TO REDIS     *');
    console.log('* Provider from form: ' + llmProvider + ' (' + typeof llmProvider + ')' + ' '.repeat(25 - llmProvider.length) + '*');
    console.log('* Effective provider: ' + effectiveLlmProvider + ' (' + typeof effectiveLlmProvider + ')' + ' '.repeat(23 - effectiveLlmProvider.length) + '*');
    console.log('* Redis key: ' + LLM_PROVIDER_REDIS_KEY + ' '.repeat(36 - LLM_PROVIDER_REDIS_KEY.length) + '*');
    console.log('*****************************************************');
    
    try {
      // IMPORTANT: First flush any existing Redis keys to ensure clean state
      await redisClient.del(LLM_PROVIDER_REDIS_KEY);
      console.log(`Deleted existing key ${LLM_PROVIDER_REDIS_KEY} to ensure clean state`);
      
      // Direct Redis operation to ensure it's saved correctly
      console.log(`About to execute: redisClient.set('${LLM_PROVIDER_REDIS_KEY}', '${effectiveLlmProvider}')`);
      await redisClient.set(LLM_PROVIDER_REDIS_KEY, effectiveLlmProvider);
      console.log('Direct Redis SET completed for LLM provider');
      
      // Verify the save worked with direct Redis GET
      console.log(`About to execute: redisClient.get('${LLM_PROVIDER_REDIS_KEY}')`);
      const verifiedLlmProvider = await redisClient.get(LLM_PROVIDER_REDIS_KEY);
      console.log('Verified Redis storage - raw value:', verifiedLlmProvider, 'type:', typeof verifiedLlmProvider);
      
      if (verifiedLlmProvider !== effectiveLlmProvider) {
        console.error('ERROR: LLM provider verification failed! Expected:', effectiveLlmProvider, 'Got:', verifiedLlmProvider);
        // Try again with a different approach if verification failed
        await redisUtil.setValue(LLM_PROVIDER_REDIS_KEY, effectiveLlmProvider);
        console.log('Attempted alternative save method using redisUtil.setValue');
      } else {
        console.log('SUCCESS: LLM provider saved successfully!');
      }
      
      // Force verification from Redis again with alternate method
      const doubleCheck = await redisUtil.getValue(LLM_PROVIDER_REDIS_KEY);
      console.log('Double check with redisUtil.getValue:', doubleCheck);
      
      // Also update the environment variable to ensure consistency
      process.env.LLM_PROVIDER = effectiveLlmProvider;
      console.log('Updated process.env.LLM_PROVIDER to:', process.env.LLM_PROVIDER);
    } catch (err) {
      console.error('Error in direct Redis operations for LLM provider:', err);
    }
    
    // Save OpenAI model with verification - direct Redis operations for maximum reliability
    console.log('Saving OpenAI model to Redis:', effectiveOpenAiModel, 'to key', OPENAI_MODEL_REDIS_KEY);
    
    try {
      // Direct Redis operation to ensure it's saved correctly
      await redisClient.set(OPENAI_MODEL_REDIS_KEY, effectiveOpenAiModel);
      console.log('Direct Redis SET completed for OpenAI model');
      
      // Also delete any old keys to clean up
      await redisClient.del('settings:openai:model');
      console.log('Cleaned up old openai model Redis key');
        
      // Verify the save worked with direct Redis GET
      const verifiedOpenAIModel = await redisClient.get(OPENAI_MODEL_REDIS_KEY);
      console.log('Verified Redis storage - openaiModel:', verifiedOpenAIModel, 'from key', OPENAI_MODEL_REDIS_KEY);

      if (verifiedOpenAIModel !== effectiveOpenAiModel) {
        console.error('ERROR: OpenAI model verification failed! Expected:', effectiveOpenAiModel, 'Got:', verifiedOpenAIModel);
      }
    } catch (err) {
      console.error('Error in direct Redis operations for OpenAI model:', err);
    }
    
    // Save Ollama model with verification
    console.log('Saving Ollama model to Redis:', normalizedOllamaModel);
    await storeRedisValue(OLLAMA_MODEL_REDIS_KEY, normalizedOllamaModel);
    const verifiedOllamaModel = await getRedisValue(OLLAMA_MODEL_REDIS_KEY);
    console.log('Verified Redis storage - ollamaModel:', verifiedOllamaModel);
    
    // Set the current values in the process environment
    process.env.LLM_PROVIDER = verifiedLlmProvider || effectiveLlmProvider; // Use verified value if available
    process.env.OPENAI_MODEL = verifiedOpenAIModel || effectiveOpenAiModel; // Use verified value if available
    process.env.OLLAMA_MODEL = verifiedOllamaModel || normalizedOllamaModel; // Use verified value if available
    
    console.log('Saved to env - LLM_PROVIDER:', process.env.LLM_PROVIDER);
    console.log('Saved to env - OPENAI_MODEL:', process.env.OPENAI_MODEL);
    console.log('Saved to env - OLLAMA_MODEL:', process.env.OLLAMA_MODEL);
    
    // Success message
    let successMessage = 'LLM settings saved successfully.';
    
    // Handle OpenAI-specific settings
    if (llmProvider === 'openai') {
      let currentApiKey = await getStoredOpenAIKey();
      let apiKeyMessage = null;
      
      // If API key field was provided in the form
      if (typeof openaiApiKey !== 'undefined') {
        console.log('API key provided in form, length:', openaiApiKey ? openaiApiKey.length : 0);
        // If non-empty API key provided, store it
        if (openaiApiKey && openaiApiKey.trim() !== '') {
          console.log('Storing non-empty API key to Redis, key starts with:', openaiApiKey.substring(0, 4));
          // Store the provided API key in Redis
          await storeOpenAIKey(openaiApiKey);
          
          // Set it as the current API key
          process.env.OPENAI_API_KEY = openaiApiKey;
          console.log('Set API key in process.env, key starts with:', process.env.OPENAI_API_KEY.substring(0, 4));
          
          // Update current API key reference
          currentApiKey = openaiApiKey;
        } else if (openaiApiKey.trim() === '') {
          // If empty key provided (user cleared the field), keep using .env 
          // but clear the stored Redis key
          await storeOpenAIKey('');
          delete process.env.OPENAI_API_KEY;
          currentApiKey = process.env.OPENAI_API_KEY || '';
          
          // Inform user we're fallback to .env
          apiKeyMessage = {
            type: 'info',
            text: 'API key cleared from settings. Using API key from .env file if available.'
          };
        }
      }
      
      // Test the connection regardless of where the key comes from
      const openaiStatus = await openaiUtil.checkStatus();
      
      if (openaiStatus) {
        successMessage += ' OpenAI connection verified.';
        
        // If we have a specific message about the API key, show that instead
        if (apiKeyMessage) {
          req.session.message = {
            type: apiKeyMessage.type,
            text: apiKeyMessage.text + ' Connection successful!'
          };
          res.redirect('/api-settings');
          return;
        }
      } else {
        // Connection failed
        if (!currentApiKey) {
          req.session.message = {
            type: 'warning',
            text: 'No OpenAI API key found in settings or environment variables. This is required for OpenAI provider.'
          };
        } else {
          req.session.message = {
            type: 'warning',
            text: 'Settings saved but OpenAI connection test failed. Check your API key.'
          };
        }
        res.redirect('/api-settings');
        return;
      }
    }
    
    // Handle Ollama-specific settings  
    if (effectiveLlmProvider === 'ollama') {
      // Test the Ollama connection
      const ollamaStatus = await ollamaUtil.checkStatus();
      
      if (ollamaStatus) {
        // Check if the specified model exists
        const models = await ollamaUtil.getModels();
        const modelExists = models.some(model => model.name === ollamaModel);
        
        if (!modelExists) {
          req.session.message = {
            type: 'warning',
            text: `Settings saved but model '${ollamaModel}' was not found in Ollama. You may need to pull it first.`
          };
          res.redirect('/api-settings');
          return;
        }
        
        successMessage += ' Ollama connection verified.';
      } else {
        req.session.message = {
          type: 'warning',
          text: 'Settings saved but Ollama connection failed. Is Ollama running?'
        };
        res.redirect('/api-settings');
        return;
      }
    }
    
    res.redirect('/api-settings');
  } catch (error) {
    console.error('Error saving API settings:', error);
    req.session.message = {
      type: 'danger',
      text: 'Error saving settings: ' + error.message
    };
    res.redirect('/api-settings');
    return;
  }
  
  // Note: Don't redirect here - we already have specific redirects in the code above
  // This section will only execute if none of the specific handlers have already redirected
});

// Helper function to check Redis status
async function checkRedisStatus() {
  try {
    await redisClient.ping();
    return true;
  } catch (error) {
    console.error('Redis status check failed:', error);
    return false;
  }
}

// Helper function to retrieve the stored OpenAI API key
async function getStoredOpenAIKey() {
  try {
    return await redisClient.get(OPENAI_API_KEY_REDIS_KEY);
  } catch (error) {
    console.error('Error retrieving OpenAI API key:', error);
    return null;
  }
}

// Helper function to store the OpenAI API key
async function storeOpenAIKey(apiKey) {
  try {
    await redisClient.set(OPENAI_API_KEY_REDIS_KEY, apiKey);
    return true;
  } catch (error) {
    console.error('Error storing OpenAI API key:', error);
    throw error;
  }
}

// Generic helper function to get a value from Redis
async function getRedisValue(key) {
  try {
    return await redisClient.get(key);
  } catch (error) {
    console.error(`Error retrieving value for ${key}:`, error);
    return null;
  }
}

// Generic helper function to store a value in Redis
async function storeRedisValue(key, value) {
  try {
    await redisClient.set(key, value);
    return true;
  } catch (error) {
    console.error(`Error storing value for ${key}:`, error);
    throw error;
  }
}

// Helper function to mask an API key for display
function maskApiKey(apiKey) {
  if (!apiKey || apiKey.length < 8) return '';
  
  // Show only first 4 and last 4 characters
  return `${apiKey.substring(0, 4)}${'*'.repeat(apiKey.length - 8)}${apiKey.substring(apiKey.length - 4)}`;
}

/**
 * GET /api-settings/openai-models
 * Returns available OpenAI models for selection
 */
router.get('/openai-models', ensureAuthenticated, async (req, res) => {
  try {
    const models = await openaiUtil.fetchAvailableModels();
    res.json({ success: true, models });
  } catch (error) {
    console.error('Error fetching OpenAI models:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Helper: Get preferred LLM provider, model, and API key (OpenAI)
 * Returns { provider, model, apiKey } for use by other modules
 */
async function getPreferredLLMConfig() {
  // Always check Redis for current provider
  const provider = await redisClient.get(LLM_PROVIDER_REDIS_KEY) || 'openai';
  if (provider === 'openai') {
    const apiKey = await redisClient.get(OPENAI_API_KEY_REDIS_KEY);
    const model = await redisClient.get(OPENAI_MODEL_REDIS_KEY) || 'gpt-3.5-turbo';
    return { provider, apiKey, model };
  } else if (provider === 'ollama') {
    const model = await redisClient.get(OLLAMA_MODEL_REDIS_KEY) || 'llama3.3';
    return { provider, apiKey: null, model };
  } else {
    return { provider: 'openai', apiKey: null, model: 'gpt-3.5-turbo' };
  }
}

module.exports = router;
module.exports.getPreferredLLMConfig = getPreferredLLMConfig;
