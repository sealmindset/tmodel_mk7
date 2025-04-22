/**
 * Centralized Logging Utility
 * 
 * Provides standardized logging functionality across the application with:
 * - Timestamps
 * - Log levels (debug, info, warn, error)
 * - Module/component identification
 * - Redis logging for persistence and viewing in the UI
 * - Truncation of sensitive or large data
 */
const redis = require('redis');
const util = require('util');
const path = require('path');

// Get Redis client from our existing utility
const redisUtil = require('./redis');

// Maximum length for truncated values (e.g. API keys, large responses)
const MAX_VALUE_LENGTH = 1000;
// Maximum number of log entries to keep in Redis
const MAX_LOG_ENTRIES = 1000;
// Redis key prefix for logs
const LOG_KEY_PREFIX = 'logs:';
// Redis key for the log index
const LOG_INDEX_KEY = 'logs:index';

// Log levels and their numeric values for filtering
const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3
};

// Current log level from environment or default to INFO
const currentLogLevel = (process.env.LOG_LEVEL || 'INFO').toUpperCase();
const CURRENT_LOG_LEVEL = LOG_LEVELS[currentLogLevel] || LOG_LEVELS.INFO;

/**
 * Truncate a string or object to a maximum length
 * @param {any} value - The value to truncate
 * @param {number} maxLength - Maximum length
 * @returns {string} - Truncated string
 */
function truncate(value, maxLength = MAX_VALUE_LENGTH) {
  if (value === null || value === undefined) return String(value);
  
  let stringValue;
  if (typeof value === 'object') {
    try {
      stringValue = JSON.stringify(value);
    } catch (e) {
      stringValue = util.inspect(value);
    }
  } else {
    stringValue = String(value);
  }
  
  if (stringValue.length <= maxLength) return stringValue;
  return `${stringValue.substring(0, maxLength)}... [truncated, ${stringValue.length} chars total]`;
}

/**
 * Get the calling module name from the stack trace
 * @returns {string} - Module name
 */
function getCallerInfo() {
  const stack = new Error().stack.split('\n');
  // Skip this function and the log function in the stack
  const callerLine = stack[3] || '';
  
  // Try to extract filename
  const match = callerLine.match(/at\s+(?:\w+\s+\()?([^:)]+):/);
  if (match && match[1]) {
    // Get just the filename without the path
    return path.basename(match[1]);
  }
  return 'unknown';
}

/**
 * Store a log entry in Redis
 * @param {Object} logEntry - The log entry to store
 */
async function storeLogInRedis(logEntry) {
  try {
    const client = redisUtil.getClient();
    
    // Generate a unique key for this log entry
    const timestamp = new Date().getTime();
    const logKey = `${LOG_KEY_PREFIX}${timestamp}`;
    
    // Store the log entry as JSON
    await client.set(logKey, JSON.stringify(logEntry));
    
    // Add the key to the index list
    await client.lPush(LOG_INDEX_KEY, logKey);
    
    // Trim the list to keep only the most recent logs
    await client.lTrim(LOG_INDEX_KEY, 0, MAX_LOG_ENTRIES - 1);
  } catch (error) {
    // Don't use the logger here to avoid infinite recursion
    console.error('Error storing log in Redis:', error);
  }
}

/**
 * Format and log a message
 * @param {string} level - Log level (debug, info, warn, error)
 * @param {string} module - Module name
 * @param {string} message - Log message
 * @param {Object} [data] - Additional data to log
 * @param {Error} [error] - Error object if applicable
 */
function log(level, module, message, data = null, error = null) {
  const levelUpper = level.toUpperCase();
  const levelValue = LOG_LEVELS[levelUpper] || 0;
  
  // Skip logging if below current log level
  if (levelValue < CURRENT_LOG_LEVEL) return;
  
  const timestamp = new Date().toISOString();
  const moduleInfo = module || getCallerInfo();
  
  // Format the log message
  let logMessage = `[${timestamp}] [${levelUpper}] [${moduleInfo}] ${message}`;
  
  // Process data if present
  let logData = null;
  if (data) {
    // Handle sensitive data
    if (data.apiKey || data.api_key) {
      const apiKey = data.apiKey || data.api_key;
      if (typeof apiKey === 'string' && apiKey.length > 8) {
        const masked = `${apiKey.substring(0, 4)}...${apiKey.substring(apiKey.length - 4)}`;
        if (data.apiKey) data.apiKey = masked;
        if (data.api_key) data.api_key = masked;
      }
    }
    
    // Truncate large data
    logData = truncate(data);
  }
  
  // Process error if present
  let errorInfo = null;
  if (error) {
    errorInfo = {
      message: error.message,
      stack: error.stack,
      code: error.code || error.statusCode
    };
  }
  
  // Log to console
  const consoleLogData = [];
  if (logData) consoleLogData.push(logData);
  if (errorInfo) consoleLogData.push(errorInfo);
  
  switch (levelUpper) {
    case 'DEBUG':
      console.debug(logMessage, ...consoleLogData);
      break;
    case 'INFO':
      console.log(logMessage, ...consoleLogData);
      break;
    case 'WARN':
      console.warn(logMessage, ...consoleLogData);
      break;
    case 'ERROR':
      console.error(logMessage, ...consoleLogData);
      break;
    default:
      console.log(logMessage, ...consoleLogData);
  }
  
  // Store in Redis for persistence and UI access
  const logEntry = {
    timestamp,
    level: levelUpper,
    module: moduleInfo,
    message,
    data: logData,
    error: errorInfo
  };
  
  storeLogInRedis(logEntry).catch(err => {
    console.error('Failed to store log in Redis:', err);
  });
}

/**
 * Get logs from Redis
 * @param {Object} options - Options for retrieving logs
 * @param {string} [options.level] - Filter by log level
 * @param {string} [options.module] - Filter by module
 * @param {number} [options.limit=100] - Maximum number of logs to retrieve
 * @param {number} [options.offset=0] - Offset for pagination
 * @returns {Promise<Array>} - Array of log entries
 */
async function getLogs(options = {}) {
  try {
    const { level, module, limit = 100, offset = 0 } = options;
    const client = redisUtil.getClient();
    
    // Get the log keys from the index
    const logKeys = await client.lRange(LOG_INDEX_KEY, offset, offset + limit - 1);
    
    if (!logKeys || logKeys.length === 0) {
      return [];
    }
    
    // Get the log entries
    const logPromises = logKeys.map(key => client.get(key));
    const logEntries = await Promise.all(logPromises);
    
    // Parse and filter the log entries
    const logs = logEntries
      .filter(entry => entry !== null)
      .map(entry => {
        try {
          return JSON.parse(entry);
        } catch (e) {
          return null;
        }
      })
      .filter(entry => {
        if (!entry) return false;
        if (level && entry.level !== level.toUpperCase()) return false;
        if (module && entry.module !== module) return false;
        return true;
      });
    
    return logs;
  } catch (error) {
    console.error('Error retrieving logs from Redis:', error);
    return [];
  }
}

// Export convenience methods for each log level
module.exports = {
  debug: (message, data, error) => log('debug', null, message, data, error),
  info: (message, data, error) => log('info', null, message, data, error),
  warn: (message, data, error) => log('warn', null, message, data, error),
  error: (message, data, error) => log('error', null, message, data, error),
  
  // Module-specific logging
  forModule: (module) => ({
    debug: (message, data, error) => log('debug', module, message, data, error),
    info: (message, data, error) => log('info', module, message, data, error),
    warn: (message, data, error) => log('warn', module, message, data, error),
    error: (message, data, error) => log('error', module, message, data, error),
  }),
  
  // Utility functions
  getLogs,
  LOG_LEVELS
};
