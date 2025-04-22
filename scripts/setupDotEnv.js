/**
 * Setup Environment Variables Script
 * 
 * This script helps set up the .env file with necessary environment variables
 * for database connections and API integrations.
 */
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Default values for different environments
const defaultValues = {
  development: {
    POSTGRES_USER: 'postgres',
    POSTGRES_PASSWORD: 'postgres',
    POSTGRES_HOST: 'localhost',
    POSTGRES_PORT: '5432',
    POSTGRES_DB: 'threat_model_dev',
    REDIS_URL: 'redis://localhost:6379',
    REDIS_PASSWORD: '',
    PORT: '3000'
  },
  test: {
    POSTGRES_USER: 'postgres',
    POSTGRES_PASSWORD: 'postgres',
    POSTGRES_HOST: 'localhost',
    POSTGRES_PORT: '5432',
    POSTGRES_DB: 'threat_model_test',
    REDIS_URL: 'redis://localhost:6379',
    REDIS_PASSWORD: '',
    PORT: '3001'
  },
  production: {
    POSTGRES_USER: 'postgres',
    POSTGRES_PASSWORD: '',  // No default for production password
    POSTGRES_HOST: '',      // No default for production host
    POSTGRES_PORT: '5432',
    POSTGRES_DB: 'threat_model_prod',
    REDIS_URL: 'redis://localhost:6379',
    REDIS_PASSWORD: '',     // No default for production Redis password
    PORT: '3000'
  }
};

// Questions for LLM Provider settings
const llmProviderQuestions = [
  {
    name: 'LLM_PROVIDER',
    message: 'Which LLM provider would you like to use? (openai/ollama):',
    default: 'ollama'
  },
  {
    name: 'OPENAI_API_KEY',
    message: 'Enter your OpenAI API Key (required if using OpenAI):',
    default: ''
  },
  {
    name: 'OPENAI_MODEL',
    message: 'Enter the OpenAI model to use:',
    default: 'gpt-4'
  },
  {
    name: 'OLLAMA_MODEL',
    message: 'Enter the Ollama model to use:',
    default: 'llama3.3:latest'
  }
];

// Questions for Rapid7 integration
const rapid7Questions = [
  {
    name: 'RAPID7_API_KEY',
    message: 'Enter your Rapid7 API Key (leave blank to skip Rapid7 integration):',
    default: ''
  },
  {
    name: 'RAPID7_API_URL',
    message: 'Enter your Rapid7 API URL (leave blank for default):',
    default: 'https://us.api.insight.rapid7.com/vm'
  }
];

// Function to ask questions
async function askQuestions() {
  console.log('=========================================');
  console.log('Threat Model Generator MK7 - Environment Setup');
  console.log('=========================================');
  
  // Ask for environment
  const env = await new Promise(resolve => {
    rl.question('Which environment are you setting up? (development/test/production) [development]: ', answer => {
      const environment = (answer || 'development').toLowerCase();
      if (!['development', 'test', 'production'].includes(environment)) {
        console.log('Invalid environment. Using development.');
        resolve('development');
      } else {
        resolve(environment);
      }
    });
  });
  
  console.log(`\nSetting up ${env} environment...\n`);
  
  // Use the default values for the selected environment
  const defaults = defaultValues[env];
  const envVars = { NODE_ENV: env };
  
  // Ask for database connection details
  for (const [key, defaultValue] of Object.entries(defaults)) {
    const value = await new Promise(resolve => {
      rl.question(`${key} [${defaultValue}]: `, answer => {
        resolve(answer || defaultValue);
      });
    });
    
    envVars[key] = value;
  }
  
  // Ask for LLM Provider settings
  console.log('\nLLM Provider Configuration:');
  for (const question of llmProviderQuestions) {
    const value = await new Promise(resolve => {
      rl.question(`${question.name} [${question.default}]: `, answer => {
        resolve(answer || question.default);
      });
    });
    
    // Always include LLM provider settings
    envVars[question.name] = value;
  }

  // Ask for Rapid7 integration details
  console.log('\nRapid7 Integration (Optional):');
  for (const question of rapid7Questions) {
    const value = await new Promise(resolve => {
      rl.question(`${question.name} [${question.default}]: `, answer => {
        resolve(answer || question.default);
      });
    });
    
    if (value) {
      envVars[question.name] = value;
    }
  }
  
  // Generate the .env file content
  let envContent = '# Threat Model Generator MK7 Environment Variables\n';
  envContent += `# Environment: ${env}\n`;
  envContent += '# Generated: ' + new Date().toISOString() + '\n\n';
  
  for (const [key, value] of Object.entries(envVars)) {
    envContent += `${key}=${value}\n`;
  }
  
  // Write the .env file
  const envPath = path.join(__dirname, '..', '.env');
  fs.writeFileSync(envPath, envContent);
  
  console.log('\n=========================================');
  console.log(`.env file created at ${envPath}`);
  console.log('=========================================');
  console.log('\nNext steps:');
  console.log('1. Run "npm install" to install dependencies');
  console.log('2. Run "npm run db:init" to initialize the database');
  console.log('3. Run "npm start" to start the application');
  
  rl.close();
}

// Run the script
askQuestions().catch(error => {
  console.error('Error setting up environment:', error);
  process.exit(1);
});
