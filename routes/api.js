/**
 * API Routes for internal functionality
 */
const express = require('express');
const router = express.Router();

// Import dependencies
const redisUtil = require('../utils/redis');
const openaiUtil = require('../utils/openai');
const ollamaUtil = require('../utils/ollama');
const scheduler = require('../utils/scheduler');
const redisClient = redisUtil.client;

// Get auth middleware - try both possible locations
let ensureAuthenticated;
try {
  // First try to import from the root auth module
  ensureAuthenticated = require('../auth')(express()).ensureAuthenticated;
} catch (error) {
  console.log('Using direct middleware import for auth');
  // Fall back to middleware folder
  ensureAuthenticated = require('../middleware/auth').ensureAuthenticated;
}

// Get the current LLM provider from Redis directly - no auth required
router.get('/settings/provider', async (req, res) => {
  try {
    // Get the current LLM provider from Redis
    const provider = await redisClient.get('settings:llm:provider') || 'openai';
    console.log(`GET /api/settings/provider - Current provider: ${provider}`);
    
    // Return the provider setting
    res.json({ provider });
  } catch (error) {
    console.error('Error getting current LLM provider:', error);
    res.status(500).json({ error: 'Failed to get provider setting' });
  }
});

// Get status of core services - no auth required for this route
router.get('/status', async (req, res) => {
  try {
    // Check which provider to test based on query parameter
    const provider = req.query.provider || 'all';
    const response = {
      timestamp: new Date().toISOString()
    };

    // Check Redis status (always check)
    let redisStatus = false;
    try {
      // Simple ping to check if Redis is alive
      await redisClient.ping();
      redisStatus = true;
    } catch (redisError) {
      console.error('Redis connection error:', redisError);
    }
    response.redis = redisStatus;
    
    // Check PostgreSQL status if requested or checking all
    if (provider === 'all' || provider === 'postgres') {
      let postgresStatus = false;
      try {
        // Start timing the connection attempt
        const startTime = Date.now();
        
        // Create a connection pool with a short timeout
        const { Pool } = require('pg');
        const pool = new Pool({
          connectionTimeoutMillis: 3000, // 3 second connection timeout
          idleTimeoutMillis: 1000       // 1 second idle timeout
        });
        
        // Try to connect and run a simple query
        const client = await pool.connect();
        await client.query('SELECT 1');
        client.release();
        
        // Calculate latency
        const endTime = Date.now();
        const latency = endTime - startTime;
        
        // Mark PostgreSQL as connected
        postgresStatus = true;
        console.log(`PostgreSQL connection successful, latency: ${latency}ms`);
        
        // Make sure to end the pool
        await pool.end();
      } catch (pgError) {
        console.error('PostgreSQL connection error:', pgError.message);
      }
      response.postgres = postgresStatus;
    }

    // Check Rapid7 API status if requested or checking all
    if (provider === 'all' || provider === 'rapid7') {
      let rapid7Status = false;
      try {
        // Get Rapid7 API URL and key from Redis
        const rapid7ApiUrl = await redisClient.get('settings:rapid7:api_url') || process.env.RAPID7_API_URL || 'http://localhost:3100';
        const rapid7ApiKey = await redisClient.get('settings:rapid7:api_key') || process.env.RAPID7_API_KEY || 'test-api-key';
        
        console.log(`Checking Rapid7 API at ${rapid7ApiUrl}`);
        
        // Try different endpoints to check if Rapid7 API is accessible
        const axios = require('axios');
        try {
          // First try the /vulnerabilities endpoint which we know exists on the mock server
          const rapid7Response = await axios.get(`${rapid7ApiUrl}/vulnerabilities`, {
            headers: {
              'X-Api-Key': rapid7ApiKey  // Use the correct header for the mock server
            },
            timeout: 3000 // 3 second timeout
          });
          
          rapid7Status = rapid7Response.status === 200;
          console.log('Rapid7 check successful via /vulnerabilities endpoint');
        } catch (vulnError) {
          // If vulnerabilities endpoint fails, try the health endpoint as fallback
          try {
            const healthResponse = await axios.get(`${rapid7ApiUrl}/health`, {
              headers: {
                'X-Api-Key': rapid7ApiKey  // Use the correct header for the mock server
              },
              timeout: 3000
            });
            
            rapid7Status = healthResponse.status === 200;
            console.log('Rapid7 check successful via /health endpoint');
          } catch (healthError) {
            // If both fail, try a simpler GET request to the root
            try {
              const rootResponse = await axios.get(`${rapid7ApiUrl}`, {
                headers: {
                  'X-Api-Key': rapid7ApiKey  // Use the correct header for the mock server
                },
                timeout: 3000
              });
              
              rapid7Status = rootResponse.status === 200;
              console.log('Rapid7 check successful via root endpoint');
            } catch (rootError) {
              console.error('All Rapid7 API connection attempts failed');
              rapid7Status = false;
            }
          }
        }
      } catch (rapid7Error) {
        console.error('Rapid7 API connection error:', rapid7Error.message);
      }
      
      console.log('Final Rapid7 status:', rapid7Status);
      response.rapid7 = rapid7Status;
    } 

    // Get status info for all LLM providers
    const llmStatusInfo = await scheduler.getLlmStatusInfo();
    response.currentProvider = llmStatusInfo.currentProvider;
    
    // Check OpenAI status if requested or checking all
    if (provider === 'all' || provider === 'openai') {
      // Force a check if explicitly requested by query param
      if (req.query.forceCheck === 'true') {
        try {
          await scheduler.checkOpenAiStatus();
          // Get updated status after the check
          const updatedLlmStatusInfo = await scheduler.getLlmStatusInfo();
          llmStatusInfo.openai = updatedLlmStatusInfo.openai;
        } catch (checkError) {
          console.error('Error during forced OpenAI status check:', checkError);
        }
      }

      response.openai = llmStatusInfo.openai.accessible;
      response.openaiLastChecked = llmStatusInfo.openai.lastChecked;
    }

    // Check Ollama status if requested or checking all
    if (provider === 'all' || provider === 'ollama') {
      // Force a check if explicitly requested by query param
      if (req.query.forceCheck === 'true') {
        try {
          await scheduler.checkOllamaStatus();
          // Get updated status after the check
          const updatedLlmStatusInfo = await scheduler.getLlmStatusInfo();
          llmStatusInfo.ollama = updatedLlmStatusInfo.ollama;
        } catch (checkError) {
          console.error('Error during forced Ollama status check:', checkError);
        }
      } else if (!llmStatusInfo.ollama.lastChecked) {
        // If we don't have a cached status, check now
        try {
          await scheduler.checkOllamaStatus();
          const updatedLlmStatusInfo = await scheduler.getLlmStatusInfo();
          llmStatusInfo.ollama = updatedLlmStatusInfo.ollama;
        } catch (ollamaError) {
          console.error('Ollama connection error:', ollamaError);
        }
      }
      
      response.ollama = llmStatusInfo.ollama.accessible;
      response.ollamaLastChecked = llmStatusInfo.ollama.lastChecked;

      // If checking Ollama specifically, also include available models
      if (provider === 'ollama' && llmStatusInfo.ollama.accessible) {
        try {
          const ollamaModels = await ollamaUtil.getModels();
          response.ollamaModels = ollamaModels;
        } catch (modelError) {
          console.error('Error fetching Ollama models:', modelError);
        }
      }
    }
    
    // Return the combined status
    res.json(response);
  } catch (error) {
    console.error('Error checking service status:', error);
    res.status(500).json({ error: 'Failed to check service status' });
  }
});

// Example protected route
router.get('/protected-example', ensureAuthenticated, async (req, res) => {
  // This is a protected route example that requires authentication
  res.json({
    message: 'You have access to this protected route',
    user: req.session.user || 'Anonymous' 
  });
});

/**
 * @route GET /api/llm/events
 * @desc Get recent LLM API events for monitoring (OpenAI or Ollama)
 */
router.get('/llm/events', async (req, res) => {
  try {
    const provider = req.query.provider || 'openai';
    let events = [];
    
    if (provider === 'openai') {
      events = openaiUtil.getApiEvents();
    } else if (provider === 'ollama') {
      events = ollamaUtil.getApiEvents();
    } else {
      // If invalid provider, return error
      return res.status(400).json({ error: 'Invalid provider specified' });
    }
    
    res.json(events);
  } catch (error) {
    console.error(`Error retrieving ${req.query.provider || 'LLM'} API events:`, error);
    res.status(500).json({ error: `Error retrieving ${req.query.provider || 'LLM'} API events` });
  }
});

/**
 * @route GET /api/ollama/models
 * @desc Get list of available Ollama models
 */
router.get('/ollama/models', async (req, res) => {
  try {
    const models = await ollamaUtil.getModels();
    res.json(models);
  } catch (error) {
    console.error('Error retrieving Ollama models:', error);
    res.status(500).json({ error: 'Error retrieving Ollama models' });
  }
});

/**
 * @route GET /api/openai/events
 * @desc Get recent OpenAI API events for monitoring (legacy route)
 */
router.get('/openai/events', async (req, res) => {
  try {
    const events = openaiUtil.getApiEvents();
    res.json(events);
  } catch (error) {
    console.error('Error retrieving OpenAI API events:', error);
    res.status(500).json({ error: 'Error retrieving OpenAI API events' });
  }
});

/**
 * @route GET /api/postgres/status
 * @desc Check PostgreSQL connection status (similar to pg_isready)
 */
router.get('/postgres/status', async (req, res) => {
  try {
    let postgresStatus = false;
    let details = {
      host: process.env.PGHOST || 'localhost',
      port: process.env.PGPORT || 5432,
      database: process.env.PGDATABASE || 'postgres',
      user: process.env.PGUSER || 'postgres',
      status: 'unknown',
      latency_ms: null,
      error: null
    };
    
    try {
      // Start timing the connection attempt
      const startTime = Date.now();
      
      // Create a connection pool with a short timeout
      const { Pool } = require('pg');
      const pool = new Pool({
        // Use default environment variables for connection settings
        // Add a short connection timeout
        connectionTimeoutMillis: 3000, // 3 second connection timeout
        idleTimeoutMillis: 1000       // 1 second idle timeout
      });
      
      // Try to establish a connection and run a simple query
      const client = await pool.connect();
      const result = await client.query('SELECT NOW() as time, current_database() as db, version() as version');
      client.release();
      
      // Calculate latency
      const endTime = Date.now();
      details.latency_ms = endTime - startTime;
      
      // Mark as successful and get additional details
      postgresStatus = true;
      details.status = 'accepting connections';
      
      if (result.rows && result.rows.length > 0) {
        details.server_time = result.rows[0].time;
        details.connected_to = result.rows[0].db;
        details.version = result.rows[0].version.split(' on ')[0]; // Just get the PostgreSQL version
      }
      
      // Make sure to end the pool
      await pool.end();
      
      console.log('PostgreSQL connection successful, latency:', details.latency_ms, 'ms');
    } catch (pgError) {
      // Connection failed
      details.status = 'rejecting connections';
      details.error = pgError.message;
      console.error('PostgreSQL connection error:', pgError.message);
    }
    
    // Send the detailed response, including postgres status for backward compatibility
    res.json({ 
      postgres: postgresStatus, 
      details: details,
      timestamp: new Date().toISOString() 
    });
  } catch (error) {
    console.error('Error checking PostgreSQL status:', error);
    res.status(500).json({ error: 'Failed to check PostgreSQL status' });
  }
});

// Endpoint to get Rapid7 API URL and key for client-side checking
router.get('/rapid7-url', ensureAuthenticated, async (req, res) => {
  try {
    // Get Rapid7 API URL and key from Redis
    const url = await redisClient.get('settings:rapid7:api_url') || process.env.RAPID7_API_URL || 'http://localhost:3100';
    const apiKey = await redisClient.get('settings:rapid7:api_key') || process.env.RAPID7_API_KEY || 'test-api-key';
    
    // Only return the necessary information, not the full API key
    res.json({
      url,
      apiKey: apiKey.substring(0, 4) + '...' // Only return a hint of the API key for security
    });
  } catch (error) {
    console.error('Error retrieving Rapid7 URL:', error);
    res.status(500).json({ error: 'Failed to retrieve Rapid7 URL' });
  }
});

module.exports = router;
