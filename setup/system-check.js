/**
 * TModel MK7 System Check Utility
 * 
 * This script performs a comprehensive check of the system to ensure all
 * requirements are met for running the TModel MK7 application.
 */

const { execSync } = require('child_process');
const os = require('os');
const fs = require('fs');
const path = require('path');

// ANSI color codes for formatting output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m'
};

// Print header
console.log(`${colors.blue}============================================================`);
console.log(`  TModel MK7 System Check Utility`);
console.log(`  Enterprise Security Architecture Management Platform`);
console.log(`============================================================${colors.reset}`);
console.log('');

// Create results object to track all checks
const results = {
  os: { status: 'pending', message: '' },
  cpu: { status: 'pending', message: '' },
  memory: { status: 'pending', message: '' },
  disk: { status: 'pending', message: '' },
  node: { status: 'pending', message: '' },
  npm: { status: 'pending', message: '' },
  postgres: { status: 'pending', message: '' },
  redis: { status: 'pending', message: '' },
  ports: { status: 'pending', message: '' }
};

// Helper function to execute shell commands safely
function safeExec(command) {
  try {
    return execSync(command, { encoding: 'utf8' }).trim();
  } catch (error) {
    return null;
  }
}

// Helper function to format result output
function formatResult(category, result) {
  const icon = result.status === 'pass' ? '✅' : result.status === 'warn' ? '⚠️' : '❌';
  const color = result.status === 'pass' ? colors.green : result.status === 'warn' ? colors.yellow : colors.red;
  console.log(`${icon} ${color}${category}:${colors.reset} ${result.message}`);
}

// Check operating system
function checkOS() {
  const platform = os.platform();
  const release = os.release();
  
  if (platform === 'darwin') {
    // Get macOS version
    const macOSVersion = safeExec('sw_vers -productVersion');
    results.os.message = `macOS ${macOSVersion} (Darwin ${release})`;
    results.os.status = 'pass';
  } else {
    results.os.message = `${platform} ${release} - Warning: TModel MK7 is optimized for macOS`;
    results.os.status = 'warn';
  }
  
  formatResult('Operating System', results.os);
}

// Check CPU
function checkCPU() {
  const cpuInfo = os.cpus();
  const cpuModel = cpuInfo[0].model;
  const cpuCount = cpuInfo.length;
  
  // Check if Apple Silicon
  const isAppleSilicon = cpuModel.includes('Apple');
  
  if (isAppleSilicon) {
    results.cpu.message = `${cpuModel} (${cpuCount} cores) - Apple Silicon detected`;
    results.cpu.status = 'pass';
  } else {
    results.cpu.message = `${cpuModel} (${cpuCount} cores) - Not Apple Silicon, but should work`;
    results.cpu.status = 'warn';
  }
  
  formatResult('CPU', results.cpu);
}

// Check memory
function checkMemory() {
  const totalMemory = os.totalmem();
  const totalMemoryGB = Math.round(totalMemory / 1024 / 1024 / 1024);
  
  if (totalMemoryGB >= 16) {
    results.memory.message = `${totalMemoryGB} GB - Excellent`;
    results.memory.status = 'pass';
  } else if (totalMemoryGB >= 8) {
    results.memory.message = `${totalMemoryGB} GB - Adequate`;
    results.memory.status = 'pass';
  } else {
    results.memory.message = `${totalMemoryGB} GB - Insufficient (8GB+ recommended)`;
    results.memory.status = 'fail';
  }
  
  formatResult('Memory', results.memory);
}

// Check disk space
function checkDisk() {
  // Get available disk space
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
    results.disk.message = `${availableDiskSpace} available - Excellent`;
    results.disk.status = 'pass';
  } else if (diskSpaceGB >= 2) {
    results.disk.message = `${availableDiskSpace} available - Adequate`;
    results.disk.status = 'pass';
  } else {
    results.disk.message = `${availableDiskSpace} available - Low (2GB+ recommended)`;
    results.disk.status = 'warn';
  }
  
  formatResult('Disk Space', results.disk);
}

// Check Node.js
function checkNode() {
  const nodeVersion = safeExec('node --version');
  
  if (nodeVersion) {
    const majorVersion = parseInt(nodeVersion.substring(1).split('.')[0], 10);
    
    if (majorVersion >= 18) {
      results.node.message = `${nodeVersion} - Compatible`;
      results.node.status = 'pass';
    } else if (majorVersion >= 16) {
      results.node.message = `${nodeVersion} - Compatible but upgrade recommended`;
      results.node.status = 'warn';
    } else {
      results.node.message = `${nodeVersion} - Incompatible (v18+ required)`;
      results.node.status = 'fail';
    }
  } else {
    results.node.message = 'Not installed or not in PATH';
    results.node.status = 'fail';
  }
  
  formatResult('Node.js', results.node);
}

// Check npm
function checkNPM() {
  const npmVersion = safeExec('npm --version');
  
  if (npmVersion) {
    const majorVersion = parseInt(npmVersion.split('.')[0], 10);
    
    if (majorVersion >= 8) {
      results.npm.message = `${npmVersion} - Compatible`;
      results.npm.status = 'pass';
    } else if (majorVersion >= 6) {
      results.npm.message = `${npmVersion} - Compatible but upgrade recommended`;
      results.npm.status = 'warn';
    } else {
      results.npm.message = `${npmVersion} - Incompatible (v6+ required)`;
      results.npm.status = 'fail';
    }
  } else {
    results.npm.message = 'Not installed or not in PATH';
    results.npm.status = 'fail';
  }
  
  formatResult('npm', results.npm);
}

// Check PostgreSQL
function checkPostgres() {
  const postgresVersion = safeExec('psql --version');
  
  if (postgresVersion) {
    // Extract version number
    const versionMatch = postgresVersion.match(/\d+\.\d+/);
    const version = versionMatch ? versionMatch[0] : 'unknown';
    const versionNumber = parseFloat(version);
    
    if (versionNumber >= 12) {
      results.postgres.message = `${version} - Compatible`;
      results.postgres.status = 'pass';
    } else if (versionNumber >= 10) {
      results.postgres.message = `${version} - Compatible but upgrade recommended`;
      results.postgres.status = 'warn';
    } else {
      results.postgres.message = `${version} - Incompatible (v12+ recommended)`;
      results.postgres.status = 'fail';
    }
    
    // Check if PostgreSQL service is running
    const isRunning = safeExec('pg_isready');
    if (isRunning && isRunning.includes('accepting connections')) {
      results.postgres.message += ' (Service is running)';
    } else {
      results.postgres.message += ' (Service is not running)';
      if (results.postgres.status === 'pass') {
        results.postgres.status = 'warn';
      }
    }
  } else {
    results.postgres.message = 'Not installed or not in PATH';
    results.postgres.status = 'fail';
  }
  
  formatResult('PostgreSQL', results.postgres);
}

// Check Redis
function checkRedis() {
  const redisVersion = safeExec('redis-server --version');
  
  if (redisVersion) {
    // Extract version number
    const versionMatch = redisVersion.match(/v=(\d+\.\d+\.\d+)/);
    const version = versionMatch ? versionMatch[1] : 'unknown';
    const majorVersion = parseInt(version.split('.')[0], 10);
    
    if (majorVersion >= 6) {
      results.redis.message = `${version} - Compatible`;
      results.redis.status = 'pass';
    } else if (majorVersion >= 5) {
      results.redis.message = `${version} - Compatible but upgrade recommended`;
      results.redis.status = 'warn';
    } else {
      results.redis.message = `${version} - Incompatible (v6+ recommended)`;
      results.redis.status = 'fail';
    }
    
    // Check if Redis service is running
    const isRunning = safeExec('redis-cli ping');
    if (isRunning && isRunning === 'PONG') {
      results.redis.message += ' (Service is running)';
    } else {
      results.redis.message += ' (Service is not running)';
      if (results.redis.status === 'pass') {
        results.redis.status = 'warn';
      }
    }
  } else {
    results.redis.message = 'Not installed or not in PATH';
    results.redis.status = 'fail';
  }
  
  formatResult('Redis', results.redis);
}

// Check if required ports are available
function checkPorts() {
  const requiredPorts = [3000, 5432, 6379, 3100];
  const unavailablePorts = [];
  
  for (const port of requiredPorts) {
    // Check if port is in use
    const isInUse = safeExec(`lsof -i:${port} | grep LISTEN`);
    
    if (isInUse) {
      unavailablePorts.push(port);
    }
  }
  
  if (unavailablePorts.length === 0) {
    results.ports.message = 'All required ports are available';
    results.ports.status = 'pass';
  } else {
    results.ports.message = `Ports in use: ${unavailablePorts.join(', ')}`;
    results.ports.status = 'warn';
  }
  
  formatResult('Port Availability', results.ports);
}

// Run all checks
function runChecks() {
  console.log(`${colors.cyan}Running system checks...${colors.reset}\n`);
  
  checkOS();
  checkCPU();
  checkMemory();
  checkDisk();
  checkNode();
  checkNPM();
  checkPostgres();
  checkRedis();
  checkPorts();
  
  // Print summary
  console.log('\n');
  const passCount = Object.values(results).filter(r => r.status === 'pass').length;
  const warnCount = Object.values(results).filter(r => r.status === 'warn').length;
  const failCount = Object.values(results).filter(r => r.status === 'fail').length;
  
  console.log(`${colors.blue}Summary:${colors.reset}`);
  console.log(`${colors.green}✅ Passed: ${passCount}${colors.reset}`);
  console.log(`${colors.yellow}⚠️ Warnings: ${warnCount}${colors.reset}`);
  console.log(`${colors.red}❌ Failed: ${failCount}${colors.reset}`);
  
  if (failCount > 0) {
    console.log(`\n${colors.red}System does not meet all requirements. Please fix the issues above before proceeding.${colors.reset}`);
    process.exit(1);
  } else if (warnCount > 0) {
    console.log(`\n${colors.yellow}System meets minimum requirements but has some warnings. Consider addressing them for optimal performance.${colors.reset}`);
    process.exit(0);
  } else {
    console.log(`\n${colors.green}System meets all requirements! You're ready to install and run TModel MK7.${colors.reset}`);
    process.exit(0);
  }
}

// Run all checks
runChecks();
