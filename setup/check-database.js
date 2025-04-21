/**
 * Database Schema Consistency Checker
 * 
 * This script checks the database schema for consistency and ensures all required
 * tables and columns exist. It will automatically fix any issues found.
 */

const { Pool } = require('pg');
require('dotenv').config({ override: true });

// Ensure pg default env vars match our .env settings
process.env.PGUSER = process.env.POSTGRES_USER;
process.env.PGPASSWORD = process.env.POSTGRES_PASSWORD;
process.env.PGHOST = process.env.POSTGRES_HOST;
process.env.PGPORT = process.env.POSTGRES_PORT;
process.env.PGDATABASE = process.env.POSTGRES_DB;

console.log('Loaded environment variables from .env file');

// Create a new pool
const pool = new Pool({
  host: process.env.PGHOST || 'localhost',
  port: process.env.PGPORT || 5432,
  database: process.env.PGDATABASE || 'postgres',
  user: process.env.PGUSER || 'postgres',
  password: process.env.PGPASSWORD || 'postgres'
});

// Required tables and their columns
const requiredSchema = {
  'projects': [
    { name: 'id', type: 'uuid' },
    { name: 'name', type: 'character varying' },
    { name: 'description', type: 'text' },
    { name: 'created_at', type: 'timestamp with time zone' },
    { name: 'updated_at', type: 'timestamp with time zone' },
    { name: 'business_unit', type: 'character varying' },
    { name: 'criticality', type: 'character varying' },
    { name: 'security_posture_score', type: 'numeric' },
    { name: 'last_vulnerability_sync', type: 'timestamp with time zone' }
  ],
  'vulnerabilities': [
    { name: 'id', type: 'uuid' },
    { name: 'title', type: 'character varying' },
    { name: 'description', type: 'text' },
    { name: 'severity', type: 'character varying' },
    { name: 'status', type: 'character varying' },
    { name: 'created_at', type: 'timestamp with time zone' },
    { name: 'updated_at', type: 'timestamp with time zone' },
    { name: 'project_id', type: 'uuid' },
    { name: 'cvss_score', type: 'numeric' },
    { name: 'asset_id', type: 'character varying' },
    { name: 'technical_details', type: 'text' },
    { name: 'remediation_steps', type: 'text' }
  ],
  'scan_history': [
    { name: 'id', type: 'uuid' },
    { name: 'project_id', type: 'uuid' },
    { name: 'scan_type', type: 'character varying' },
    { name: 'scan_result', type: 'jsonb' },
    { name: 'created_at', type: 'timestamp with time zone' },
    { name: 'updated_at', type: 'timestamp with time zone' }
  ],
  'vulnerability_history': [
    { name: 'id', type: 'uuid' },
    { name: 'vulnerability_id', type: 'uuid' },
    { name: 'status', type: 'character varying' },
    { name: 'notes', type: 'text' },
    { name: 'created_at', type: 'timestamp with time zone' },
    { name: 'created_by', type: 'character varying' }
  ],
  'safeguards': [
    { name: 'id', type: 'uuid' },
    { name: 'name', type: 'character varying' },
    { name: 'description', type: 'text' },
    { name: 'type', type: 'character varying' },
    { name: 'status', type: 'character varying' },
    { name: 'created_at', type: 'timestamp with time zone' },
    { name: 'updated_at', type: 'timestamp with time zone' },
    { name: 'created_by', type: 'character varying' }
  ]
};

// Function to check if schema exists
async function checkSchema() {
  const client = await pool.connect();
  try {
    // Check if threat_model schema exists
    const schemaResult = await client.query(`
      SELECT schema_name 
      FROM information_schema.schemata 
      WHERE schema_name = 'threat_model'
    `);
    
    if (schemaResult.rows.length === 0) {
      console.log('Creating threat_model schema...');
      await client.query('CREATE SCHEMA threat_model');
      console.log('threat_model schema created successfully');
    } else {
      console.log('threat_model schema already exists');
    }
  } catch (error) {
    console.error('Error checking/creating schema:', error);
  } finally {
    client.release();
  }
}

// Function to check if a table exists
async function checkTable(tableName) {
  const client = await pool.connect();
  try {
    const result = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'threat_model' 
      AND table_name = $1
    `, [tableName]);
    
    return result.rows.length > 0;
  } catch (error) {
    console.error(`Error checking if table ${tableName} exists:`, error);
    return false;
  } finally {
    client.release();
  }
}

// Function to create a table
async function createTable(tableName) {
  const client = await pool.connect();
  try {
    console.log(`Creating table threat_model.${tableName}...`);
    
    let createTableSQL = `CREATE TABLE threat_model.${tableName} (`;
    
    // Add columns based on the required schema
    const columns = requiredSchema[tableName];
    const columnDefinitions = columns.map(column => {
      return `${column.name} ${column.type}`;
    });
    
    createTableSQL += columnDefinitions.join(', ');
    
    // Add primary key for id column
    if (columns.find(col => col.name === 'id')) {
      createTableSQL += ', PRIMARY KEY (id)';
    }
    
    createTableSQL += ')';
    
    await client.query(createTableSQL);
    console.log(`Table threat_model.${tableName} created successfully`);
  } catch (error) {
    console.error(`Error creating table ${tableName}:`, error);
  } finally {
    client.release();
  }
}

// Function to check if a column exists in a table
async function checkColumn(tableName, columnName) {
  const client = await pool.connect();
  try {
    const result = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_schema = 'threat_model' 
      AND table_name = $1 
      AND column_name = $2
    `, [tableName, columnName]);
    
    return result.rows.length > 0;
  } catch (error) {
    console.error(`Error checking if column ${columnName} exists in table ${tableName}:`, error);
    return false;
  } finally {
    client.release();
  }
}

// Function to add a column to a table
async function addColumn(tableName, columnName, columnType) {
  const client = await pool.connect();
  try {
    console.log(`Adding column ${columnName} to table threat_model.${tableName}...`);
    await client.query(`
      ALTER TABLE threat_model.${tableName}
      ADD COLUMN ${columnName} ${columnType}
    `);
    console.log(`Column ${columnName} added to table threat_model.${tableName} successfully`);
  } catch (error) {
    console.error(`Error adding column ${columnName} to table ${tableName}:`, error);
  } finally {
    client.release();
  }
}

// Function to check and fix database schema
async function checkAndFixSchema() {
  try {
    // Check if schema exists
    await checkSchema();
    
    // Check if tables exist and create them if they don't
    for (const tableName in requiredSchema) {
      const tableExists = await checkTable(tableName);
      if (!tableExists) {
        await createTable(tableName);
      } else {
        console.log(`Table threat_model.${tableName} already exists`);
        
        // Check if all required columns exist
        for (const column of requiredSchema[tableName]) {
          const columnExists = await checkColumn(tableName, column.name);
          if (!columnExists) {
            await addColumn(tableName, column.name, column.type);
          }
        }
      }
    }
    
    console.log('Database schema check completed successfully');
  } catch (error) {
    console.error('Error checking and fixing database schema:', error);
  } finally {
    pool.end();
  }
}

// Run the check and fix function
checkAndFixSchema();
