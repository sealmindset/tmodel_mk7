/**
 * Redis Verification and Setup Script
 * 
 * This script verifies that all necessary Redis keys exist and sets default values
 * for those that don't. It ensures that a new installation has all required settings.
 */
require('dotenv').config();
const redisUtil = require('../utils/redis');

/**
 * Verify and initialize all required Redis keys
 */
async function verifyRedisSetup() {
  try {
    console.log('Connecting to Redis...');
    await redisUtil.connect();
    
    console.log('Verifying Redis settings...');
    
    // Define all required Redis keys with their default values
    const requiredKeys = {
      // LLM Provider settings
      'settings:llm:provider': process.env.LLM_PROVIDER || 'ollama',
      
      // OpenAI settings
      'settings:openai:api_key': process.env.OPENAI_API_KEY || '',
      'settings:openai:api_model': process.env.OPENAI_MODEL || 'gpt-4',
      'settings:openai:api_url': 'https://api.openai.com/v1',
      
      // Ollama settings
      'settings:ollama:api_url': 'http://localhost:11434',
      'settings:ollama:model': process.env.OLLAMA_MODEL || 'llama3.3:latest',
      
      // Rapid7 settings
      'settings:rapid7:api_key': process.env.RAPID7_API_KEY || '',
      'settings:rapid7:api_url': process.env.RAPID7_API_URL || 'https://us.api.insight.rapid7.com',
      
      // Application settings
      'settings:app:project_template': JSON.stringify({
        name: 'New Project',
        description: 'Project description',
        business_unit: 'Engineering',
        criticality: 'Medium',
        data_classification: 'Internal Use Only',
        status: 'Planning'
      }),
      
      // Threat Model templates
      'settings:templates:threat_model': JSON.stringify({
        name: 'New Threat Model',
        description: 'Comprehensive threat analysis',
        status: 'Draft'
      }),
      
      // Default threat types (STRIDE)
      'settings:templates:threats': JSON.stringify([
        'Spoofing', 
        'Tampering', 
        'Repudiation', 
        'Information Disclosure', 
        'Denial of Service', 
        'Elevation of Privilege'
      ]),
      
      // Default safeguard types
      'settings:templates:safeguards': JSON.stringify([
        'Authentication', 
        'Authorization', 
        'Input Validation', 
        'Encryption', 
        'Logging', 
        'Error Handling',
        'Configuration', 
        'Session Management', 
        'Network Security', 
        'Physical Security'
      ])
    };
    
    // Check each key and set default if missing
    for (const [key, defaultValue] of Object.entries(requiredKeys)) {
      const value = await redisUtil.client.get(key);
      
      if (value === null) {
        console.log(`Setting default value for ${key}`);
        await redisUtil.client.set(key, defaultValue);
      } else {
        console.log(`Verified existing setting: ${key}`);
      }
    }
    
    console.log('Redis verification and setup completed successfully!');
    return true;
  } catch (error) {
    console.error('Error verifying Redis setup:', error);
    return false;
  } finally {
    // We don't disconnect since other processes might use the connection
  }
}

// Run the verification if called directly
if (require.main === module) {
  verifyRedisSetup()
    .then(success => {
      if (success) {
        console.log('✅ Redis setup completed successfully');
        process.exit(0);
      } else {
        console.error('❌ Redis setup failed');
        process.exit(1);
      }
    })
    .catch(error => {
      console.error('❌ Unexpected error during Redis setup:', error);
      process.exit(1);
    });
} else {
  module.exports = { verifyRedisSetup };
}
