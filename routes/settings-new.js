/**
 * Settings Routes - Clean implementation for LLM Provider settings
 */
const express = require('express');
const router = express.Router();
const redisUtil = require('../utils/redis');
const openaiUtil = require('../utils/openai');
const ollamaUtil = require('../utils/ollama');
const { Pool } = require('pg');
const redisClient = redisUtil.client;
const multer = require('multer');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

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
const OPENAI_MODEL_REDIS_KEY = 'settings:openai:api_model';
const LLM_PROVIDER_REDIS_KEY = 'settings:llm:provider';
const OLLAMA_MODEL_REDIS_KEY = 'settings:ollama:model';
const OLLAMA_API_URL_REDIS_KEY = 'settings:ollama:api_url';
const RAPID7_API_KEY_REDIS_KEY = 'settings:rapid7:api_key';
const RAPID7_API_URL_REDIS_KEY = 'settings:rapid7:api_url';
const RAPID7_API_VALIDATION_URL_REDIS_KEY = 'settings:rapid7:api_validation_url';
const RAPID7_USE_SPEC_SERVER_REDIS_KEY = 'settings:rapid7:use_spec_server';

// Logger for better debugging
const logger = require('../utils/logger').forModule('settings-new');

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: function(req, file, cb) {
    // Accept only JSON and YAML files
    if (file.mimetype === 'application/json' || 
        file.originalname.endsWith('.json') ||
        file.mimetype === 'text/yaml' ||
        file.mimetype === 'application/yaml' ||
        file.originalname.endsWith('.yaml') ||
        file.originalname.endsWith('.yml')) {
      cb(null, true);
    } else {
      cb(new Error('Only JSON and YAML files are allowed'), false);
    }
  }
});

/**
 * GET /settings - Render the settings page
 */
router.get('/', ensureAuthenticated, async (req, res) => {
  try {
    logger.info('Loading settings page');
    
    // Check connectivity status for each service
    const redisStatus = await checkRedisStatus();
    const openaiStatus = await openaiUtil.checkStatus();
    const ollamaStatus = await ollamaUtil.checkStatus();
    
    // Get stored settings from Redis
    logger.debug('Retrieving settings from Redis');
    const openaiApiKey = await redisClient.get(OPENAI_API_KEY_REDIS_KEY) || '';
    const openaiModel = await redisClient.get(OPENAI_MODEL_REDIS_KEY) || 'gpt-3.5-turbo';
    const llmProvider = await redisClient.get(LLM_PROVIDER_REDIS_KEY) || 'openai';
    const ollamaModel = await redisClient.get(OLLAMA_MODEL_REDIS_KEY) || 'llama3';
    const ollamaApiUrl = await redisClient.get(OLLAMA_API_URL_REDIS_KEY) || 'http://localhost:11434';
    
    // Get Rapid7 settings
    const rapid7ApiKey = await redisClient.get(RAPID7_API_KEY_REDIS_KEY) || '';
    const rapid7ApiUrl = await redisClient.get(RAPID7_API_URL_REDIS_KEY) || 'https://us.api.insight.rapid7.com';
    const rapid7ApiValidationUrl = await redisClient.get(RAPID7_API_VALIDATION_URL_REDIS_KEY) || 'https://us.api.insight.rapid7.com/validate';
    const rapid7UseSpecServerUrl = await redisClient.get(RAPID7_USE_SPEC_SERVER_REDIS_KEY) === 'true';
    
    // Check if Rapid7 OpenAPI spec exists in PostgreSQL
    let rapid7SpecAvailable = false;
    try {
      const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
      });
      const result = await pool.query(
        'SELECT COUNT(*) FROM openapi_specs WHERE name = $1',
        ['rapid7']
      );
      rapid7SpecAvailable = result.rows[0].count > 0;
      await pool.end();
    } catch (error) {
      logger.error('Error checking for Rapid7 OpenAPI spec', error);
      // Default to false if query fails
      rapid7SpecAvailable = false;
    }
    
    // Check Rapid7 API status
    let rapid7Status = false;
    if (rapid7ApiKey) {
      try {
        const response = await axios.get(rapid7ApiValidationUrl, {
          headers: {
            'X-Api-Key': rapid7ApiKey,
            'Content-Type': 'application/json'
          },
          timeout: 5000, // 5 second timeout
          validateStatus: () => true // Don't throw on any status code
        });
        rapid7Status = response.status === 200;
        logger.info(`Rapid7 API status check: ${rapid7Status ? 'Connected' : 'Disconnected'}`);
      } catch (error) {
        logger.error('Error checking Rapid7 API status', error);
        rapid7Status = false;
      }
    }
    
    // Get available Ollama models if Ollama is available
    let availableOllamaModels = [];
    if (ollamaStatus) {
      try {
        availableOllamaModels = await ollamaUtil.getModels();
        logger.info(`Retrieved ${availableOllamaModels.length} Ollama models`);
      } catch (error) {
        logger.error('Failed to retrieve Ollama models', error);
      }
    }
    
    // Get PostgreSQL status
    const postgresStatus = await checkPostgresStatus();
    
    logger.info('Rendering settings page with data', {
      llmProvider,
      openaiStatus, 
      ollamaStatus,
      rapid7Status,
      openaiModelName: openaiModel,
      ollamaModelName: ollamaModel
    });
    
    // Render the settings page with all the data
    res.render('settings', {
      openaiApiKey,
      openaiModel,
      openaiStatus,
      redisStatus,
      ollamaStatus,
      ollamaModel,
      ollamaApiUrl,
      llmProvider,
      availableOllamaModels,
      rapid7ApiKey,
      rapid7ApiUrl,
      rapid7ApiValidationUrl,
      rapid7UseSpecServerUrl,
      rapid7Status,
      rapid7SpecAvailable,
      postgresStatus,
      message: req.session.message || null
    });
    
    // Clear the message from session after displaying it
    if (req.session.message) {
      delete req.session.message;
    }
  } catch (error) {
    logger.error('Error loading settings page', error);
    res.render('settings', {
      openaiApiKey: '',
      openaiModel: 'gpt-3.5-turbo',
      openaiStatus: false,
      redisStatus: false,
      ollamaStatus: false,
      ollamaModel: 'llama3',
      ollamaApiUrl: 'http://localhost:11434',
      llmProvider: 'openai',
      availableOllamaModels: [],
      postgresStatus: false,
      message: {
        type: 'danger',
        text: 'Error loading settings: ' + error.message
      }
    });
  }
});

/**
 * Create the OpenAPI specs table if it doesn't exist
 */
async function ensureOpenApiSpecsTable() {
  try {
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });

    await pool.query(`
      CREATE TABLE IF NOT EXISTS openapi_specs (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        spec_data BYTEA NOT NULL,
        content_type VARCHAR(50) NOT NULL,
        filename VARCHAR(255) NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.end();
    logger.info('OpenAPI specs table ensured');
  } catch (error) {
    logger.error('Error ensuring OpenAPI specs table', error);
    throw error;
  }
}

/**
 * POST /settings - Save settings form submissions
 */
router.post('/', ensureAuthenticated, upload.single('rapid7OpenApiFile'), async (req, res) => {
  try {
    const settingsType = req.body.settingsType;
    const savedSettings = [];
    
    logger.info(`Processing ${settingsType} settings form submission`);
    
    // Handle different settings forms
    switch (settingsType) {
      case 'llm':
        await handleLlmProviderSettings(req, savedSettings);
        break;
        
      case 'openai':
        await handleOpenaiSettings(req, savedSettings);
        break;
        
      case 'ollama':
        await handleOllamaSettings(req, savedSettings);
        break;
        
      case 'rapid7':
        await handleRapid7Settings(req, savedSettings);
        break;
        
      default:
        throw new Error(`Unknown settings type: ${settingsType}`);
    }
    
    // Create success message
    const successMessage = savedSettings.length > 0
      ? `Settings saved successfully. Updated: ${savedSettings.join(', ')}.`
      : 'Settings saved successfully.';
    
    // For AJAX requests, return JSON response
    if (isAjaxRequest(req)) {
      return res.json({
        success: true,
        message: successMessage,
        savedSettings
      });
    }
    
    // For regular form submissions, set flash message and redirect
    req.session.message = {
      type: 'success',
      text: successMessage
    };
    
    return res.redirect('/settings');
  } catch (error) {
    logger.error('Error saving settings', error);
    
    // For AJAX requests, return JSON error
    if (isAjaxRequest(req)) {
      return res.status(500).json({
        success: false,
        message: error.message || 'An error occurred while saving settings.'
      });
    }
    
    // For regular form submissions, set flash message and redirect
    req.session.message = {
      type: 'danger',
      text: error.message || 'An error occurred while saving settings.'
    };
    
    return res.redirect('/settings');
  }
});

/**
 * POST /api/test-openai - Test OpenAI connectivity
 */
router.post('/api/test-openai', ensureAuthenticated, async (req, res) => {
  try {
    const { apiKey } = req.body;
    
    if (!apiKey) {
      return res.status(400).json({
        success: false,
        error: 'API key is required'
      });
    }
    
    logger.info('Testing OpenAI connection');
    const result = await openaiUtil.testConnection(apiKey);
    
    if (result.success) {
      logger.info('OpenAI connection test successful');
      return res.json({
        success: true,
        models: result.models || []
      });
    } else {
      logger.error('OpenAI connection test failed', result.error);
      return res.status(400).json({
        success: false,
        error: result.error || 'Failed to connect to OpenAI API'
      });
    }
  } catch (error) {
    logger.error('Error testing OpenAI connection', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'An error occurred while testing OpenAI connection'
    });
  }
});

/**
 * POST /api/test-ollama - Test Ollama connectivity
 */
router.post('/api/test-ollama', ensureAuthenticated, async (req, res) => {
  try {
    const { apiUrl } = req.body;
    
    if (!apiUrl) {
      return res.status(400).json({
        success: false,
        error: 'API URL is required'
      });
    }
    
    logger.info('Testing Ollama connection', { apiUrl });
    const result = await ollamaUtil.testConnection(apiUrl);
    
    if (result.success) {
      logger.info('Ollama connection test successful', { 
        modelCount: result.models ? result.models.length : 0 
      });
      
      return res.json({
        success: true,
        models: result.models || []
      });
    } else {
      logger.error('Ollama connection test failed', result.error);
      return res.status(400).json({
        success: false,
        error: result.error || 'Failed to connect to Ollama API'
      });
    }
  } catch (error) {
    logger.error('Error testing Ollama connection', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'An error occurred while testing Ollama connection'
    });
  }
});

/**
 * POST /api/ollama/models - Get available Ollama models
 */
router.post('/api/ollama/models', ensureAuthenticated, async (req, res) => {
  try {
    const { apiUrl } = req.body;
    
    if (!apiUrl) {
      return res.status(400).json({
        success: false,
        error: 'API URL is required'
      });
    }
    
    logger.info('Fetching Ollama models', { apiUrl });
    const models = await ollamaUtil.getModels(apiUrl);
    
    return res.json({
      success: true,
      models
    });
  } catch (error) {
    logger.error('Error fetching Ollama models', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'An error occurred while fetching Ollama models'
    });
  }
});

/**
 * POST /api/test-rapid7 - Test Rapid7 API connectivity
 */
router.post('/api/test-rapid7', ensureAuthenticated, async (req, res) => {
  try {
    const { apiKey } = req.body;
    
    if (!apiKey) {
      return res.status(400).json({
        success: false,
        error: 'API key is required'
      });
    }
    
    // Get validation URL from Redis or use default
    const validationUrl = await redisClient.get(RAPID7_API_VALIDATION_URL_REDIS_KEY) || 
                         'https://us.api.insight.rapid7.com/validate';
    
    logger.info('Testing Rapid7 connection', { validationUrl });
    
    try {
      // Make a simple request to validate the API key
      const response = await axios.get(validationUrl, {
        headers: {
          'X-Api-Key': apiKey,
          'Content-Type': 'application/json'
        },
        timeout: 5000 // 5 second timeout
      });
      
      if (response.status === 200) {
        logger.info('Rapid7 connection test successful');
        
        // Cache API key in Redis for future use
        await redisClient.set(RAPID7_API_KEY_REDIS_KEY, apiKey);
        
        return res.json({
          success: true,
          message: 'Successfully connected to Rapid7 API'
        });
      } else {
        logger.error('Rapid7 connection test failed', { statusCode: response.status });
        return res.status(400).json({
          success: false,
          error: `API returned unexpected status: ${response.status}`
        });
      }
    } catch (error) {
      let errorMessage = error.message;
      
      // Provide more friendly error messages
      if (error.response) {
        if (error.response.status === 401 || error.response.status === 403) {
          errorMessage = 'Invalid API key or insufficient permissions';
        } else {
          errorMessage = `API error: ${error.response.statusText} (${error.response.status})`;
        }
      } else if (error.code === 'ECONNREFUSED') {
        errorMessage = 'Connection refused. Check your network or if the API is available.';
      } else if (error.code === 'ETIMEDOUT' || error.code === 'TIMEOUT') {
        errorMessage = 'Connection timed out. Check your network or if the API is available.';
      }
      
      logger.error('Rapid7 connection test error', { error: errorMessage });
      return res.status(400).json({
        success: false,
        error: errorMessage
      });
    }
  } catch (error) {
    logger.error('Error in Rapid7 test route', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'An error occurred while testing Rapid7 connection'
    });
  }
});

/**
 * GET /api/rapid7/openapi-spec - Get stored Rapid7 OpenAPI specification
 */
router.get('/api/rapid7/openapi-spec', ensureAuthenticated, async (req, res) => {
  try {
    // Retrieve OpenAPI spec from PostgreSQL
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });
    
    try {
      // Ensure the table exists
      await ensureOpenApiSpecsTable();
      
      // Get the spec
      const result = await pool.query(
        'SELECT spec_data, content_type, filename FROM openapi_specs WHERE name = $1',
        ['rapid7']
      );
      
      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'OpenAPI specification not found'
        });
      }
      
      const specRow = result.rows[0];
      let specData = specRow.spec_data;
      
      // If it's a Buffer, convert to string
      if (Buffer.isBuffer(specData)) {
        specData = specData.toString();
      }
      
      // Determine format based on content type or filename
      let format = 'json';
      if (specRow.content_type === 'application/yaml' || 
          specRow.filename.endsWith('.yaml') || 
          specRow.filename.endsWith('.yml')) {
        format = 'yaml';
      }
      
      return res.json({
        success: true,
        spec: specData,
        format,
        filename: specRow.filename
      });
    } finally {
      await pool.end();
    }
  } catch (error) {
    logger.error('Error retrieving Rapid7 OpenAPI spec', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'An error occurred while retrieving OpenAPI specification'
    });
  }
});

// Helper function handlers for different settings types
async function handleLlmProviderSettings(req, savedSettings) {
  const { llmProvider } = req.body;
  
  if (!llmProvider) {
    throw new Error('LLM Provider selection is required');
  }
  
  if (!['openai', 'ollama'].includes(llmProvider)) {
    throw new Error(`Invalid LLM Provider: ${llmProvider}`);
  }
  
  logger.info(`Saving LLM Provider setting: ${llmProvider}`);
  
  // Store in Redis
  await redisClient.set(LLM_PROVIDER_REDIS_KEY, llmProvider);
  
  // Also update environment variable for the current process
  process.env.LLM_PROVIDER = llmProvider;
  
  // Store in PostgreSQL for persistence
  await storeSettingInPostgres('llm_provider', llmProvider);
  
  savedSettings.push('LLM Provider');
}

async function handleOpenaiSettings(req, savedSettings) {
  const { openaiApiKey, openaiModel } = req.body;
  
  // Save API key if provided
  if (openaiApiKey) {
    logger.info('Saving OpenAI API key');
    await redisClient.set(OPENAI_API_KEY_REDIS_KEY, openaiApiKey);
    
    // Update environment variable for the current process
    process.env.OPENAI_API_KEY = openaiApiKey;
    
    // Store in PostgreSQL for persistence (securely)
    await storeSettingInPostgres('openai_api_key', openaiApiKey);
    
    savedSettings.push('OpenAI API Key');
  }
  
  // Save model if provided
  if (openaiModel) {
    logger.info(`Saving OpenAI model: ${openaiModel}`);
    await redisClient.set(OPENAI_MODEL_REDIS_KEY, openaiModel);
    
    // Update environment variable for the current process
    process.env.OPENAI_MODEL = openaiModel;
    
    // Store in PostgreSQL for persistence
    await storeSettingInPostgres('openai_model', openaiModel);
    
    savedSettings.push('OpenAI Model');
  }
  
  // Test the connection to verify settings
  await openaiUtil.checkStatus();
}

async function handleOllamaSettings(req, savedSettings) {
  const { ollamaApiUrl, ollamaModel } = req.body;
  
  // Save API URL if provided
  if (ollamaApiUrl) {
    logger.info(`Saving Ollama API URL: ${ollamaApiUrl}`);
    await redisClient.set(OLLAMA_API_URL_REDIS_KEY, ollamaApiUrl);
    
    // Store in PostgreSQL for persistence
    await storeSettingInPostgres('ollama_api_url', ollamaApiUrl);
    
    savedSettings.push('Ollama API URL');
  }
  
  // Save model if provided
  if (ollamaModel) {
    logger.info(`Saving Ollama model: ${ollamaModel}`);
    await redisClient.set(OLLAMA_MODEL_REDIS_KEY, ollamaModel);
    
    // Update environment variable for the current process
    process.env.OLLAMA_MODEL = ollamaModel;
    
    // Store in PostgreSQL for persistence
    await storeSettingInPostgres('ollama_model', ollamaModel);
    
    savedSettings.push('Ollama Model');
  }
  
  // Test the connection to verify settings
  await ollamaUtil.checkStatus();
}

async function handleRapid7Settings(req, savedSettings) {
  try {
    // Ensure the OpenAPI specs table exists
    await ensureOpenApiSpecsTable();
    
    const { rapid7ApiKey, rapid7UseSpecServerUrl } = req.body;
    const file = req.file; // From multer middleware
    
    // Save API key if provided
    if (rapid7ApiKey) {
      logger.info('Saving Rapid7 API key');
      await redisClient.set(RAPID7_API_KEY_REDIS_KEY, rapid7ApiKey);
      
      // Update environment variable for the current process
      process.env.RAPID7_API_KEY = rapid7ApiKey;
      
      // Store in PostgreSQL for persistence
      await storeSettingInPostgres('rapid7_api_key', rapid7ApiKey);
      
      savedSettings.push('Rapid7 API Key');
    }
    
    // Save use spec server URL preference
    const useSpecServer = rapid7UseSpecServerUrl === 'on' || rapid7UseSpecServerUrl === true;
    await redisClient.set(RAPID7_USE_SPEC_SERVER_REDIS_KEY, useSpecServer.toString());
    await storeSettingInPostgres('rapid7_use_spec_server', useSpecServer.toString());
    
    logger.info(`Setting Rapid7 use spec server URL: ${useSpecServer}`);
    savedSettings.push('Rapid7 Server URL Preference');
    
    // Process and store the OpenAPI spec file if provided
    if (file) {
      logger.info(`Processing Rapid7 OpenAPI spec file: ${file.originalname}`);
      
      // Determine content type based on file extension
      const contentType = file.originalname.endsWith('.json') 
        ? 'application/json'
        : 'application/yaml';
      
      // Store the file in PostgreSQL
      const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
      });
      
      try {
        // Upsert the file
        await pool.query(`
          INSERT INTO openapi_specs (name, spec_data, content_type, filename, updated_at)
          VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
          ON CONFLICT (name)
          DO UPDATE SET
            spec_data = EXCLUDED.spec_data,
            content_type = EXCLUDED.content_type,
            filename = EXCLUDED.filename,
            updated_at = CURRENT_TIMESTAMP
        `, ['rapid7', file.buffer, contentType, file.originalname]);
        
        logger.info('Rapid7 OpenAPI spec saved to PostgreSQL');
        savedSettings.push('Rapid7 OpenAPI Specification');
        
        // If spec defines servers and user wants to use them, extract and save the URL
        if (useSpecServer) {
          try {
            let specData;
            if (contentType === 'application/json') {
              specData = JSON.parse(file.buffer.toString());
            } else {
              // For YAML, we'd need a YAML parser
              // This is a simplified placeholder assuming JSON
              try {
                specData = JSON.parse(file.buffer.toString());
              } catch (e) {
                logger.warn('Could not parse YAML spec, skipping server URL extraction');
                specData = null;
              }
            }
            
            if (specData && specData.servers && specData.servers.length > 0) {
              const serverUrl = specData.servers[0].url;
              logger.info(`Extracted server URL from spec: ${serverUrl}`);
              await redisClient.set(RAPID7_API_URL_REDIS_KEY, serverUrl);
              await storeSettingInPostgres('rapid7_api_url', serverUrl);
              savedSettings.push('Rapid7 API URL (from spec)');
            }
          } catch (parseError) {
            logger.error('Error parsing OpenAPI spec for server URL', parseError);
          }
        }
      } finally {
        await pool.end();
      }
    }
    
    return savedSettings;
  } catch (error) {
    logger.error('Error handling Rapid7 settings', error);
    throw error;
  }
}

// Utility functions
async function checkRedisStatus() {
  try {
    await redisClient.ping();
    return true;
  } catch (error) {
    logger.error('Redis connection check failed', error);
    return false;
  }
}

async function checkPostgresStatus() {
  try {
    // Get connection details from environment or Redis
    const host = process.env.POSTGRES_HOST || await redisClient.get('settings:postgresql:host') || 'localhost';
    const port = process.env.POSTGRES_PORT || await redisClient.get('settings:postgresql:port') || '5432';
    const database = process.env.POSTGRES_DB || await redisClient.get('settings:postgresql:database') || 'postgres';
    const user = process.env.POSTGRES_USER || await redisClient.get('settings:postgresql:user') || 'postgres';
    const password = process.env.POSTGRES_PASSWORD || await redisClient.get('settings:postgresql:password') || '';
    
    // Create a connection pool
    const pool = new Pool({
      host,
      port,
      database,
      user,
      password,
      connectionTimeoutMillis: 3000
    });
    
    // Test the connection
    const client = await pool.connect();
    client.release();
    await pool.end();
    
    return true;
  } catch (error) {
    logger.error('PostgreSQL connection check failed', error);
    return false;
  }
}

async function storeSettingInPostgres(key, value) {
  try {
    // Get connection details from environment or Redis
    const host = process.env.POSTGRES_HOST || await redisClient.get('settings:postgresql:host') || 'localhost';
    const port = process.env.POSTGRES_PORT || await redisClient.get('settings:postgresql:port') || '5432';
    const database = process.env.POSTGRES_DB || await redisClient.get('settings:postgresql:database') || 'postgres';
    const user = process.env.POSTGRES_USER || await redisClient.get('settings:postgresql:user') || 'postgres';
    const password = process.env.POSTGRES_PASSWORD || await redisClient.get('settings:postgresql:password') || '';
    
    // Create a connection pool
    const pool = new Pool({
      host,
      port,
      database,
      user,
      password
    });
    
    // Check if settings table exists, create if not
    const client = await pool.connect();
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS app_settings (
          key VARCHAR(255) PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      
      // Upsert the setting
      await client.query(`
        INSERT INTO app_settings (key, value, updated_at)
        VALUES ($1, $2, CURRENT_TIMESTAMP)
        ON CONFLICT (key)
        DO UPDATE SET
          value = $2,
          updated_at = CURRENT_TIMESTAMP
      `, [key, value]);
      
      logger.debug(`Stored setting in PostgreSQL: ${key}`);
    } finally {
      client.release();
    }
    
    await pool.end();
  } catch (error) {
    logger.error(`Error storing setting in PostgreSQL: ${key}`, error);
    // Don't throw, as Redis is our primary store
  }
}

function isAjaxRequest(req) {
  return req.xhr || 
    (req.headers.accept && req.headers.accept.indexOf('json') > -1) || 
    req.get('Content-Type') === 'application/json';
}

// Helper function to validate strings
function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim() !== '';
}

module.exports = router;
