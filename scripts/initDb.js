/**
 * Database Initialization Script
 * 
 * This script initializes the PostgreSQL database by running the init.sql file.
 * It creates all necessary tables, extensions, and schemas.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const ora = require('ora');  // You might need to install this: npm install ora

// Determine if we're in dev, test or prod environment
const env = process.env.NODE_ENV || 'development';
console.log(`Initializing database for ${env} environment`);

// Get database config from environment variables
const dbConfig = {
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  host: process.env.POSTGRES_HOST,
  port: process.env.POSTGRES_PORT,
  database: process.env.POSTGRES_DB
};

// Create a PostgreSQL pool
const pool = new Pool(dbConfig);

// Read the SQL file
const sqlPath = path.join(__dirname, '..', 'database', 'init.sql');
const sql = fs.readFileSync(sqlPath, 'utf8');

// Split SQL into separate statements (simple approach)
// Note: This doesn't handle all edge cases. For complex SQL, consider using a proper SQL parser.
const statements = sql
  .replace(/\/\*[\s\S]*?\*\/|--.*$/gm, '') // Remove comments
  .split(';')
  .filter(statement => statement.trim() !== '');

async function initializeDatabase() {
  const spinner = ora('Initializing database...').start();
  let client;
  
  try {
    client = await pool.connect();
    
    // Execute each statement
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      spinner.text = `Executing statement ${i + 1} of ${statements.length}`;
      await client.query(statement);
    }
    
    spinner.succeed('Database initialized successfully');
    
    // Add initial data if needed
    await addInitialData(client);
    
    return true;
  } catch (error) {
    spinner.fail(`Failed to initialize database: ${error.message}`);
    console.error('Error details:', error);
    return false;
  } finally {
    if (client) client.release();
    await pool.end();
  }
}

async function addInitialData(client) {
  console.log('Adding initial data...');
  
  // Add default safeguard types
  const safeguardTypes = [
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
  ];
  
  try {
    for (const type of safeguardTypes) {
      // Check if safeguard already exists
      const checkQuery = `
        SELECT COUNT(*) FROM threat_model.safeguards 
        WHERE name = $1 AND type = $1
      `;
      const checkResult = await client.query(checkQuery, [type]);
      
      if (parseInt(checkResult.rows[0].count) === 0) {
        const insertQuery = `
          INSERT INTO threat_model.safeguards 
            (name, type, description, effectiveness, implementation_status, created_by)
          VALUES 
            ($1, $1, $2, 80, 'Implemented', 'system')
        `;
        
        await client.query(insertQuery, [
          type, 
          `Default ${type} safeguard template`
        ]);
        
        console.log(`Added default safeguard: ${type}`);
      }
    }
    
    // Add default threat categories
    const threatCategories = [
      'Spoofing', 
      'Tampering', 
      'Repudiation', 
      'Information Disclosure', 
      'Denial of Service', 
      'Elevation of Privilege'
    ];
    
    for (const category of threatCategories) {
      // Create a default entry in the threats table for each category
      // This will be used as a template for new threats
      const checkQuery = `
        SELECT COUNT(*) FROM threat_model.threats 
        WHERE name = $1 AND category = $1 AND threat_model_id IS NULL
      `;
      const checkResult = await client.query(checkQuery, [category]);
      
      if (parseInt(checkResult.rows[0].count) === 0) {
        const insertQuery = `
          INSERT INTO threat_model.threats 
            (name, category, description, created_by)
          VALUES 
            ($1, $1, $2, 'system')
        `;
        
        await client.query(insertQuery, [
          category, 
          `Default ${category} threat template`
        ]);
        
        console.log(`Added default threat category: ${category}`);
      }
    }
    
    console.log('Initial data added successfully');
  } catch (error) {
    console.error('Error adding initial data:', error);
    throw error;
  }
}

// Run the initialization
initializeDatabase()
  .then(success => {
    if (success) {
      console.log('✅ Database initialization completed successfully');
    } else {
      console.error('❌ Database initialization failed');
      process.exit(1);
    }
  })
  .catch(error => {
    console.error('❌ Unexpected error during database initialization:', error);
    process.exit(1);
  });
