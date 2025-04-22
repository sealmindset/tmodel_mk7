/**
 * Installation Verification Script
 * 
 * This script tests the installation process without making changes,
 * to verify that all dependencies are present and required services
 * are accessible.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Define tests to run
const tests = [
  {
    name: 'Node.js Version',
    test: () => {
      const version = process.version;
      const major = parseInt(version.slice(1).split('.')[0]);
      if (major < 14) {
        throw new Error(`Node.js version ${version} is too old. Please install Node.js 14 or newer.`);
      }
      return { success: true, message: `Node.js ${version} is compatible` };
    }
  },
  {
    name: 'Required Dependencies',
    test: () => {
      // Check package.json
      const packagePath = path.join(__dirname, '..', 'package.json');
      if (!fs.existsSync(packagePath)) {
        throw new Error('package.json not found');
      }
      
      const pkg = require(packagePath);
      
      // Check for critical dependencies
      const requiredDeps = [
        'express', 'pg', 'redis', 'ejs', 'axios', 'dotenv', 
        'express-session', 'connect-redis', 'ora'
      ];
      
      const missing = requiredDeps.filter(dep => !pkg.dependencies[dep]);
      if (missing.length > 0) {
        throw new Error(`Missing dependencies: ${missing.join(', ')}`);
      }
      
      return { 
        success: true, 
        message: `All ${requiredDeps.length} critical dependencies found in package.json`
      };
    }
  },
  {
    name: 'Required Files',
    test: () => {
      // Check for critical files
      const criticalFiles = [
        { path: 'app.js', desc: 'Application entry point' },
        { path: 'db/db.js', desc: 'Database connection module' },
        { path: 'db/schema.sql', desc: 'Database schema' },
        { path: 'utils/redis.js', desc: 'Redis client utility' },
        { path: 'scripts/setupDotEnv.js', desc: 'Environment setup script' },
        { path: 'scripts/verifyDbSchema.js', desc: 'Database verification script' },
        { path: 'scripts/verifyRedisSetup.js', desc: 'Redis verification script' },
      ];
      
      const missing = [];
      for (const file of criticalFiles) {
        const fullPath = path.join(__dirname, '..', file.path);
        if (!fs.existsSync(fullPath)) {
          missing.push(`${file.path} (${file.desc})`);
        }
      }
      
      if (missing.length > 0) {
        throw new Error(`Missing critical files: ${missing.join(', ')}`);
      }
      
      return { 
        success: true, 
        message: `All ${criticalFiles.length} critical files found`
      };
    }
  },
  {
    name: 'PostgreSQL Connection',
    test: async () => {
      try {
        // Try to require the pg module
        const { Pool } = require('pg');
        
        // Check if database details are available
        const host = process.env.POSTGRES_HOST || 'localhost';
        const port = process.env.POSTGRES_PORT || 5432;
        const user = process.env.POSTGRES_USER || 'postgres';
        
        // Create a connection pool with a timeout
        const pool = new Pool({
          host,
          port,
          user,
          password: process.env.POSTGRES_PASSWORD || '',
          database: 'postgres', // Connect to default database
          connectionTimeoutMillis: 5000
        });
        
        // Attempt to connect
        const client = await pool.connect();
        client.release();
        await pool.end();
        
        return { 
          success: true, 
          message: `Successfully connected to PostgreSQL at ${host}:${port}`
        };
      } catch (error) {
        return { 
          success: false, 
          message: `Failed to connect to PostgreSQL: ${error.message}`,
          error
        };
      }
    }
  },
  {
    name: 'Redis Connection',
    test: async () => {
      try {
        // Try to require the redis module
        const redis = require('redis');
        
        // Check if Redis details are available
        const host = process.env.REDIS_HOST || 'localhost';
        const port = process.env.REDIS_PORT || 6379;
        
        // Create a Redis client
        const client = redis.createClient({
          socket: {
            host,
            port,
            connectTimeout: 5000
          },
          password: process.env.REDIS_PASSWORD || ''
        });
        
        // Attempt to connect with a timeout
        client.on('error', (err) => {
          throw err;
        });
        
        await client.connect();
        await client.disconnect();
        
        return { 
          success: true, 
          message: `Successfully connected to Redis at ${host}:${port}`
        };
      } catch (error) {
        return { 
          success: false, 
          message: `Failed to connect to Redis: ${error.message}`,
          error
        };
      }
    }
  },
  {
    name: 'Directory Structure',
    test: () => {
      // Check for required directories
      const requiredDirs = [
        { path: 'database', create: true },
        { path: 'database/migrations', create: true },
        { path: 'logs', create: true },
        { path: 'uploads', create: true },
        { path: 'views', create: false },
        { path: 'public', create: false },
        { path: 'routes', create: false },
        { path: 'utils', create: false }
      ];
      
      const missing = [];
      for (const dir of requiredDirs) {
        const fullPath = path.join(__dirname, '..', dir.path);
        if (!fs.existsSync(fullPath)) {
          if (dir.create) {
            missing.push(`${dir.path} (will be created during installation)`);
          } else {
            missing.push(`${dir.path} (required but missing)`);
          }
        }
      }
      
      if (missing.some(dir => !dir.includes('will be created'))) {
        throw new Error(`Missing required directories: ${missing.join(', ')}`);
      }
      
      return { 
        success: true, 
        message: missing.length > 0 
          ? `Some directories will be created during installation: ${missing.join(', ')}`
          : 'All required directories found'
      };
    }
  }
];

/**
 * Run all verification tests
 */
async function verifyInstallation() {
  console.log('=================================================');
  console.log('Threat Model Generator MK7 - Installation Check');
  console.log('=================================================');
  console.log('This script will check if your system is ready for installation.');
  console.log('');
  
  let allPassed = true;
  const results = [];
  
  for (const test of tests) {
    process.stdout.write(`Checking ${test.name}... `);
    
    try {
      const result = await test.test();
      
      if (result.success) {
        console.log('✅ PASS');
        console.log(`   ${result.message}`);
        results.push({ name: test.name, status: 'PASS', message: result.message });
      } else {
        console.log('⚠️ WARNING');
        console.log(`   ${result.message}`);
        results.push({ name: test.name, status: 'WARNING', message: result.message });
        // Warnings don't fail the overall check
      }
    } catch (error) {
      console.log('❌ FAIL');
      console.log(`   ${error.message}`);
      results.push({ name: test.name, status: 'FAIL', message: error.message });
      allPassed = false;
    }
    
    console.log('');
  }
  
  // Display summary
  console.log('=================================================');
  console.log('Installation Check Summary:');
  console.log('=================================================');
  
  for (const result of results) {
    const icon = result.status === 'PASS' ? '✅' : result.status === 'WARNING' ? '⚠️' : '❌';
    console.log(`${icon} ${result.name}: ${result.status}`);
  }
  
  console.log('');
  
  if (allPassed) {
    console.log('✅ All checks passed! Your system is ready for installation.');
    console.log('');
    console.log('To install, run:');
    console.log('  ./install.sh');
    console.log('');
    console.log('Or to install manually:');
    console.log('  npm install');
    console.log('  npm run setup');
    return true;
  } else {
    console.log('❌ Some checks failed. Please fix the issues before proceeding with installation.');
    return false;
  }
}

// Run the verification if this script is called directly
if (require.main === module) {
  verifyInstallation()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('Unexpected error during verification:', error);
      process.exit(1);
    });
} else {
  module.exports = { verifyInstallation };
}
