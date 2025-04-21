/**
 * Database Initialization Script for Threat Model Generator
 * 
 * This script will:
 * 1. Connect to the default postgres database
 * 2. Create the threat_model schema if it doesn't exist
 * 3. Run all the table creation scripts from init.sql
 */
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Database connection configuration
const config = {
  user: process.env.POSTGRES_USER || 'postgres',
  password: process.env.POSTGRES_PASSWORD || 'postgres',
  host: process.env.POSTGRES_HOST || 'localhost',
  port: process.env.POSTGRES_PORT || 5432,
  database: 'postgres' // Connect to default postgres database
};

async function setupDatabase() {
  console.log('Starting database setup...');
  console.log('Using configuration:', {
    user: config.user,
    host: config.host,
    port: config.port,
    database: config.database
  });
  
  const pool = new Pool(config);
  
  try {
    // Read the SQL initialization file
    const initSqlPath = path.join(__dirname, 'database', 'init.sql');
    console.log(`Reading initialization SQL from: ${initSqlPath}`);
    
    const initSql = fs.readFileSync(initSqlPath, 'utf8');
    console.log('Successfully read init.sql file');
    
    // Split the SQL into individual statements
    const statements = initSql
      .split(';')
      .map(statement => statement.trim())
      .filter(statement => statement.length > 0);
    
    console.log(`Found ${statements.length} SQL statements to execute`);
    
    // Execute each statement
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      console.log(`Executing statement ${i + 1}/${statements.length}:`);
      console.log(statement.substring(0, 100) + (statement.length > 100 ? '...' : ''));
      
      await pool.query(statement);
      console.log(`Statement ${i + 1} executed successfully`);
    }
    
    console.log('Database setup completed successfully!');
    console.log('Schema "threat_model" and all required tables have been created.');
    
    // Verify tables were created
    const tablesResult = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'threat_model'
      ORDER BY table_name;
    `);
    
    console.log('\nCreated tables:');
    tablesResult.rows.forEach((row, index) => {
      console.log(`${index + 1}. ${row.table_name}`);
    });
    
  } catch (error) {
    console.error('Error setting up database:', error);
  } finally {
    await pool.end();
    console.log('Database connection closed');
  }
}

// Run the setup function
setupDatabase();
