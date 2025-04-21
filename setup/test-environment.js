/**
 * TModel MK7 Environment Test Script
 * 
 * This script tests the environment and dependencies required for TModel MK7
 * without actually installing anything. It checks for the presence of required
 * software, validates configurations, and reports any issues.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

// ANSI color codes for formatting output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

// Print header
console.log(`${colors.blue}============================================================`);
console.log(`  TModel MK7 Environment Test`);
console.log(`  Enterprise Security Architecture Management Platform`);
console.log(`============================================================${colors.reset}`);
console.log('');

// Track test results
const results = {
  pass: 0,
  warn: 0,
  fail: 0
};

// Helper function to execute shell commands safely
function safeExec(command) {
  try {
    return execSync(command, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch (error) {
    return null;
  }
}

// Helper function to print test results
function printResult(name, status, message) {
  const icon = status === 'pass' ? '✅' : status === 'warn' ? '⚠️' : '❌';
  const color = status === 'pass' ? colors.green : status === 'warn' ? colors.yellow : colors.red;
  console.log(`${icon} ${color}${name}:${colors.reset} ${message}`);
  results[status]++;
}

// Test system requirements
function testSystemRequirements() {
  console.log(`${colors.cyan}Testing System Requirements:${colors.reset}`);
  
  // Test OS
  const platform = os.platform();
  if (platform === 'darwin') {
    const macOSVersion = safeExec('sw_vers -productVersion');
    printResult('Operating System', 'pass', `macOS ${macOSVersion}`);
  } else {
    printResult('Operating System', 'warn', `${platform} - Not macOS, but may work with modifications`);
  }
  
  // Test CPU
  const cpuInfo = os.cpus();
  const cpuModel = cpuInfo[0].model;
  const cpuCount = cpuInfo.length;
  const isAppleSilicon = cpuModel.includes('Apple');
  
  if (isAppleSilicon) {
    printResult('CPU', 'pass', `${cpuModel} (${cpuCount} cores) - Apple Silicon detected`);
  } else {
    printResult('CPU', 'warn', `${cpuModel} (${cpuCount} cores) - Not Apple Silicon, but should work`);
  }
  
  // Test memory
  const totalMemory = os.totalmem();
  const totalMemoryGB = Math.round(totalMemory / 1024 / 1024 / 1024);
  
  if (totalMemoryGB >= 16) {
    printResult('Memory', 'pass', `${totalMemoryGB} GB - Excellent`);
  } else if (totalMemoryGB >= 8) {
    printResult('Memory', 'pass', `${totalMemoryGB} GB - Adequate`);
  } else {
    printResult('Memory', 'fail', `${totalMemoryGB} GB - Insufficient (8GB+ recommended)`);
  }
  
  // Test disk space
  const currentDir = process.cwd();
  let availableDiskSpace;
  
  if (os.platform() === 'darwin' || os.platform() === 'linux') {
    availableDiskSpace = safeExec(`df -h "${currentDir}" | awk 'NR==2 {print $4}'`);
  } else {
    availableDiskSpace = 'Unknown';
  }
  
  // Parse disk space value
  let diskSpaceGB = 0;
  if (availableDiskSpace && availableDiskSpace !== 'Unknown') {
    if (availableDiskSpace.endsWith('G')) {
      diskSpaceGB = parseFloat(availableDiskSpace.replace('G', ''));
    } else if (availableDiskSpace.endsWith('T')) {
      diskSpaceGB = parseFloat(availableDiskSpace.replace('T', '')) * 1024;
    } else if (availableDiskSpace.endsWith('M')) {
      diskSpaceGB = parseFloat(availableDiskSpace.replace('M', '')) / 1024;
    }
  }
  
  if (diskSpaceGB >= 5) {
    printResult('Disk Space', 'pass', `${availableDiskSpace} available - Excellent`);
  } else if (diskSpaceGB >= 2) {
    printResult('Disk Space', 'pass', `${availableDiskSpace} available - Adequate`);
  } else {
    printResult('Disk Space', 'warn', `${availableDiskSpace} available - Low (2GB+ recommended)`);
  }
}

// Test required software
function testRequiredSoftware() {
  console.log(`\n${colors.cyan}Testing Required Software:${colors.reset}`);
  
  // Test Homebrew
  const brewVersion = safeExec('brew --version');
  if (brewVersion) {
    printResult('Homebrew', 'pass', brewVersion.split('\n')[0]);
  } else {
    printResult('Homebrew', 'fail', 'Not installed or not in PATH');
  }
  
  // Test Node.js
  const nodeVersion = safeExec('node --version');
  if (nodeVersion) {
    const majorVersion = parseInt(nodeVersion.substring(1).split('.')[0], 10);
    if (majorVersion >= 18) {
      printResult('Node.js', 'pass', `${nodeVersion} - Compatible`);
    } else if (majorVersion >= 16) {
      printResult('Node.js', 'warn', `${nodeVersion} - Compatible but upgrade recommended`);
    } else {
      printResult('Node.js', 'fail', `${nodeVersion} - Incompatible (v18+ required)`);
    }
  } else {
    printResult('Node.js', 'fail', 'Not installed or not in PATH');
  }
  
  // Test npm
  const npmVersion = safeExec('npm --version');
  if (npmVersion) {
    const majorVersion = parseInt(npmVersion.split('.')[0], 10);
    if (majorVersion >= 8) {
      printResult('npm', 'pass', `${npmVersion} - Compatible`);
    } else if (majorVersion >= 6) {
      printResult('npm', 'warn', `${npmVersion} - Compatible but upgrade recommended`);
    } else {
      printResult('npm', 'fail', `${npmVersion} - Incompatible (v6+ required)`);
    }
  } else {
    printResult('npm', 'fail', 'Not installed or not in PATH');
  }
  
  // Test PostgreSQL
  const postgresVersion = safeExec('psql --version');
  if (postgresVersion) {
    const versionMatch = postgresVersion.match(/\d+\.\d+/);
    const version = versionMatch ? versionMatch[0] : 'unknown';
    const versionNumber = parseFloat(version);
    
    if (versionNumber >= 12) {
      printResult('PostgreSQL', 'pass', `${version} - Compatible`);
    } else if (versionNumber >= 10) {
      printResult('PostgreSQL', 'warn', `${version} - Compatible but upgrade recommended`);
    } else {
      printResult('PostgreSQL', 'fail', `${version} - Incompatible (v12+ recommended)`);
    }
    
    // Check if PostgreSQL service is running
    const isRunning = safeExec('pg_isready');
    if (isRunning && isRunning.includes('accepting connections')) {
      printResult('PostgreSQL Service', 'pass', 'Running and accepting connections');
    } else {
      printResult('PostgreSQL Service', 'fail', 'Not running');
    }
  } else {
    printResult('PostgreSQL', 'fail', 'Not installed or not in PATH');
  }
  
  // Test Redis
  const redisVersion = safeExec('redis-server --version');
  if (redisVersion) {
    const versionMatch = redisVersion.match(/v=(\d+\.\d+\.\d+)/);
    const version = versionMatch ? versionMatch[1] : 'unknown';
    const majorVersion = parseInt(version.split('.')[0], 10);
    
    if (majorVersion >= 6) {
      printResult('Redis', 'pass', `${version} - Compatible`);
    } else if (majorVersion >= 5) {
      printResult('Redis', 'warn', `${version} - Compatible but upgrade recommended`);
    } else {
      printResult('Redis', 'fail', `${version} - Incompatible (v6+ recommended)`);
    }
    
    // Check if Redis service is running
    const isRunning = safeExec('redis-cli ping');
    if (isRunning && isRunning === 'PONG') {
      printResult('Redis Service', 'pass', 'Running and responding to ping');
    } else {
      printResult('Redis Service', 'fail', 'Not running');
    }
  } else {
    printResult('Redis', 'fail', 'Not installed or not in PATH');
  }
}

// Test port availability
function testPortAvailability() {
  console.log(`\n${colors.cyan}Testing Port Availability:${colors.reset}`);
  
  const requiredPorts = [
    { port: 3000, description: 'Web Server' },
    { port: 5432, description: 'PostgreSQL' },
    { port: 6379, description: 'Redis' },
    { port: 3100, description: 'Mock Rapid7 API' }
  ];
  
  for (const { port, description } of requiredPorts) {
    const isInUse = safeExec(`lsof -i:${port} | grep LISTEN`);
    
    if (isInUse) {
      printResult(`Port ${port} (${description})`, 'warn', 'In use - would need to be freed before installation');
    } else {
      printResult(`Port ${port} (${description})`, 'pass', 'Available');
    }
  }
}

// Test project structure
function testProjectStructure() {
  console.log(`\n${colors.cyan}Testing Project Structure:${colors.reset}`);
  
  // Check for key directories and files
  const requiredPaths = [
    { path: 'package.json', type: 'file', description: 'Node.js package configuration' },
    { path: 'app.js', type: 'file', description: 'Main application file' },
    { path: 'database', type: 'directory', description: 'Database scripts and migrations' },
    { path: 'routes', type: 'directory', description: 'Application routes' },
    { path: 'views', type: 'directory', description: 'EJS view templates' },
    { path: 'public', type: 'directory', description: 'Static assets' },
    { path: 'setup', type: 'directory', description: 'Installation scripts' }
  ];
  
  for (const { path: itemPath, type, description } of requiredPaths) {
    const fullPath = path.join(process.cwd(), itemPath);
    
    if (fs.existsSync(fullPath)) {
      const stats = fs.statSync(fullPath);
      const isCorrectType = (type === 'file' && stats.isFile()) || (type === 'directory' && stats.isDirectory());
      
      if (isCorrectType) {
        printResult(itemPath, 'pass', `${description} - Found`);
      } else {
        printResult(itemPath, 'fail', `${description} - Found but is a ${stats.isFile() ? 'file' : 'directory'}, expected a ${type}`);
      }
    } else {
      printResult(itemPath, 'fail', `${description} - Not found`);
    }
  }
  
  // Check for database migration files
  const migrationPath = path.join(process.cwd(), 'database', 'migrations');
  if (fs.existsSync(migrationPath)) {
    const migrationFiles = fs.readdirSync(migrationPath);
    if (migrationFiles.length > 0) {
      printResult('Database Migrations', 'pass', `Found ${migrationFiles.length} migration files`);
    } else {
      printResult('Database Migrations', 'warn', 'Migration directory exists but contains no files');
    }
  } else {
    printResult('Database Migrations', 'warn', 'Migration directory not found');
  }
}

// Test environment configuration
function testEnvironmentConfig() {
  console.log(`\n${colors.cyan}Testing Environment Configuration:${colors.reset}`);
  
  // Check for .env file
  const envPath = path.join(process.cwd(), '.env');
  const envTemplatePath = path.join(process.cwd(), '.env.template');
  
  if (fs.existsSync(envPath)) {
    printResult('.env', 'pass', 'Environment file exists');
    
    // Check for required environment variables
    const envContent = fs.readFileSync(envPath, 'utf8');
    const requiredVars = [
      'POSTGRES_USER',
      'POSTGRES_PASSWORD',
      'POSTGRES_HOST',
      'POSTGRES_PORT',
      'POSTGRES_DB',
      'REDIS_HOST',
      'REDIS_PORT',
      'PORT',
      'SESSION_SECRET'
    ];
    
    const missingVars = [];
    for (const varName of requiredVars) {
      if (!envContent.includes(`${varName}=`)) {
        missingVars.push(varName);
      }
    }
    
    if (missingVars.length === 0) {
      printResult('Environment Variables', 'pass', 'All required variables are defined');
    } else {
      printResult('Environment Variables', 'warn', `Missing variables: ${missingVars.join(', ')}`);
    }
  } else if (fs.existsSync(envTemplatePath)) {
    printResult('.env', 'warn', 'Environment file not found, but template exists');
  } else {
    printResult('.env', 'fail', 'Environment file not found');
  }
}

// Run all tests and print summary
function runTests() {
  testSystemRequirements();
  testRequiredSoftware();
  testPortAvailability();
  testProjectStructure();
  testEnvironmentConfig();
  
  // Print summary
  console.log(`\n${colors.blue}Test Summary:${colors.reset}`);
  console.log(`${colors.green}✅ Passed: ${results.pass}${colors.reset}`);
  console.log(`${colors.yellow}⚠️ Warnings: ${results.warn}${colors.reset}`);
  console.log(`${colors.red}❌ Failed: ${results.fail}${colors.reset}`);
  
  if (results.fail > 0) {
    console.log(`\n${colors.red}Some tests failed. Please address the issues before proceeding with installation.${colors.reset}`);
    console.log(`To install the required dependencies, run: ./setup/install.sh`);
  } else if (results.warn > 0) {
    console.log(`\n${colors.yellow}All critical tests passed, but there are some warnings to consider.${colors.reset}`);
    console.log(`You can proceed with installation, but may want to address the warnings first.`);
    console.log(`To install the application, run: ./setup/install.sh`);
  } else {
    console.log(`\n${colors.green}All tests passed! Your system is ready for TModel MK7 installation.${colors.reset}`);
    console.log(`To install the application, run: ./setup/install.sh`);
  }
}

// Run all tests
runTests();
