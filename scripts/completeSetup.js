/**
 * Complete Setup Script for Threat Model Generator MK7
 * 
 * This script runs the following setup tasks in order:
 * 1. Verifies/creates the .env file if it doesn't exist
 * 2. Verifies the PostgreSQL database schema and creates missing tables/columns
 * 3. Verifies Redis setup and initializes required keys
 * 4. Creates a default project if none exists
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { verifyDatabaseSchema } = require('./verifyDbSchema');
const { verifyRedisSetup } = require('./verifyRedisSetup');

// Define the stages of setup
const setupStages = [
  { 
    name: 'Environment Variables', 
    check: () => fs.existsSync(path.join(__dirname, '..', '.env')),
    run: () => runScript('./scripts/setupDotEnv.js')
  },
  {
    name: 'Directory Structure',
    check: () => true, // Always verify directories
    run: () => ensureDirectories()
  },
  { 
    name: 'Database Schema', 
    check: () => true, // Always verify database schema
    run: () => verifyDatabaseSchema()
  },
  { 
    name: 'Redis Settings', 
    check: () => true, // Always verify Redis settings
    run: () => verifyRedisSetup()
  }
];

/**
 * Ensure required directories exist
 */
async function ensureDirectories() {
  console.log('Ensuring required directories exist...');
  
  // Define required directories
  const requiredDirs = [
    path.join(__dirname, '..', 'database'),
    path.join(__dirname, '..', 'database', 'migrations'),
    path.join(__dirname, '..', 'logs'),
    path.join(__dirname, '..', 'uploads')
  ];
  
  // Create each directory if it doesn't exist
  for (const dir of requiredDirs) {
    if (!fs.existsSync(dir)) {
      console.log(`Creating directory: ${dir}`);
      fs.mkdirSync(dir, { recursive: true });
    }
  }
  
  return true;
}

/**
 * Run a Node.js script
 */
function runScript(scriptPath) {
  return new Promise((resolve, reject) => {
    const fullPath = path.join(__dirname, '..', scriptPath);
    console.log(`Running script: ${fullPath}`);
    
    const child = spawn('node', [fullPath], {
      stdio: 'inherit',
      shell: true
    });
    
    child.on('close', (code) => {
      if (code === 0) {
        resolve(true);
      } else {
        reject(new Error(`Script exited with code ${code}`));
      }
    });
    
    child.on('error', (err) => {
      reject(err);
    });
  });
}

/**
 * Run the complete setup process
 */
async function runCompleteSetup() {
  console.log('=================================================');
  console.log('Threat Model Generator MK7 - Complete Setup');
  console.log('=================================================');
  
  try {
    for (const stage of setupStages) {
      console.log(`\nStage: ${stage.name}`);
      console.log('-------------------------------------------------');
      
      const shouldRun = await stage.check();
      
      if (shouldRun) {
        await stage.run();
        console.log(`✅ ${stage.name} setup completed`);
      } else {
        console.log(`✓ ${stage.name} already set up, skipping...`);
      }
    }
    
    console.log('\n=================================================');
    console.log('✅ All setup stages completed successfully!');
    console.log('=================================================');
    console.log('\nYou can now start the application with:');
    console.log('npm start');
    
    return true;
  } catch (error) {
    console.error('\n=================================================');
    console.error('❌ Setup failed!', error);
    console.error('=================================================');
    return false;
  }
}

// Run the setup if this script is called directly
if (require.main === module) {
  runCompleteSetup()
    .then(success => {
      if (success) {
        process.exit(0);
      } else {
        process.exit(1);
      }
    })
    .catch(error => {
      console.error('Unexpected error during setup:', error);
      process.exit(1);
    });
} else {
  module.exports = { runCompleteSetup };
}
