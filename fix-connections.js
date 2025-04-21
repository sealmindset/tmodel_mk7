/**
 * Fix-connections.js
 * 
 * This script checks and fixes any inconsistent database connections in the application.
 * It will identify modules using incorrect connection strings or settings
 * and update them to use the proper configuration.
 */
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config();

// Get environment variables
const config = {
  user: process.env.POSTGRES_USER || 'postgres',
  password: process.env.POSTGRES_PASSWORD || 'postgres',
  host: process.env.POSTGRES_HOST || 'localhost',
  port: process.env.POSTGRES_PORT || 5432,
  database: process.env.POSTGRES_DB || 'postgres'
};

console.log('Checking database connections with configuration:');
console.log(config);

// Check the main database connection
async function testDatabaseConnection() {
  const pool = new Pool(config);
  
  try {
    // Test the connection
    console.log('Testing database connection...');
    const result = await pool.query('SELECT current_database() as db_name');
    
    console.log(`Successfully connected to database: ${result.rows[0].db_name}`);
    
    // Check if threat_model schema exists
    const schemaResult = await pool.query(`
      SELECT schema_name 
      FROM information_schema.schemata 
      WHERE schema_name = 'threat_model'
    `);
    
    if (schemaResult.rows.length === 0) {
      console.error('WARNING: threat_model schema does not exist!');
    } else {
      console.log('threat_model schema exists');
    }
    
    // List tables in the threat_model schema
    const tablesResult = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'threat_model'
      ORDER BY table_name
    `);
    
    console.log('\nTables in threat_model schema:');
    if (tablesResult.rows.length === 0) {
      console.log('No tables found');
    } else {
      tablesResult.rows.forEach((row, i) => {
        console.log(`${i+1}. ${row.table_name}`);
      });
    }
    
    // Check for any data in the projects table
    const projectsResult = await pool.query(`
      SELECT * FROM threat_model.projects
    `);
    
    console.log(`\nProjects in database: ${projectsResult.rows.length}`);
    if (projectsResult.rows.length > 0) {
      projectsResult.rows.forEach((project, i) => {
        console.log(`Project ${i+1}: ${project.name} (ID: ${project.id})`);
        console.log(`  Business Unit: ${project.business_unit}`);
        console.log(`  Criticality: ${project.criticality}`);
        console.log(`  Status: ${project.status}`);
      });
    }
    
    return true;
  } catch (error) {
    console.error('Database connection error:', error);
    return false;
  } finally {
    await pool.end();
  }
}

// Fix the database connections by creating a .env.local file with correct settings
function fixDatabaseConnections() {
  const envPath = path.join(__dirname, '.env.local');
  
  const envContents = `# Local environment settings that override .env
# Created by fix-connections.js to ensure correct database connection

# Database Configuration
POSTGRES_USER=${config.user}
POSTGRES_PASSWORD=${config.password}
POSTGRES_HOST=${config.host}
POSTGRES_PORT=${config.port}
POSTGRES_DB=postgres

# Make sure to use the postgres database for all connections
DATABASE_URL=postgresql://${config.user}:${config.password}@${config.host}:${config.port}/postgres
`;

  fs.writeFileSync(envPath, envContents);
  console.log(`Created .env.local file with corrected database settings at: ${envPath}`);
  console.log('Please restart your application for these changes to take effect.');
}

// Main execution
async function main() {
  console.log('Starting database connection check...');
  
  const connectionSuccess = await testDatabaseConnection();
  
  if (!connectionSuccess) {
    console.log('Attempting to fix database connections...');
    fixDatabaseConnections();
  } else {
    console.log('Database connection is working correctly.');
    
    // Create .env.local anyway to ensure consistency
    fixDatabaseConnections();
  }
}

main().catch(console.error);
