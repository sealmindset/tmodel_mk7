/**
 * Script to add additional required tables to the database
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

async function addTables() {
  console.log('Adding missing tables to the database...');
  console.log('Using configuration:', {
    user: config.user,
    host: config.host,
    port: config.port,
    database: config.database
  });
  
  const pool = new Pool(config);
  
  try {
    // Read the SQL file
    const sqlFilePath = path.join(__dirname, 'database', 'additional-tables.sql');
    console.log(`Reading SQL from: ${sqlFilePath}`);
    
    const sql = fs.readFileSync(sqlFilePath, 'utf8');
    console.log('Successfully read SQL file');
    
    // Execute the SQL statements
    console.log('Executing SQL to add tables...');
    await pool.query(sql);
    
    console.log('Additional tables created successfully!');
    
    // Verify new tables were created
    const tablesResult = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'threat_model'
      ORDER BY table_name;
    `);
    
    console.log('\nAll tables now available:');
    tablesResult.rows.forEach((row, index) => {
      console.log(`${index + 1}. ${row.table_name}`);
    });
    
  } catch (error) {
    console.error('Error adding tables:', error);
  } finally {
    await pool.end();
    console.log('Database connection closed');
  }
}

// Run the script
addTables();
