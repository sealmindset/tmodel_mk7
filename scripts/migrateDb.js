/**
 * Database Migration Script
 * 
 * This script migrates the database schema by applying incremental migration files.
 * It tracks applied migrations in a migrations table to ensure migrations are only applied once.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const ora = require('ora');

// Determine environment
const env = process.env.NODE_ENV || 'development';
console.log(`Migrating database for ${env} environment`);

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

// Path to migration files
const migrationsDir = path.join(__dirname, '..', 'database', 'migrations');

// Ensure migrations table exists
async function ensureMigrationsTable(client) {
  try {
    // Check if threat_model schema exists (should be created by init script)
    await client.query(`
      CREATE SCHEMA IF NOT EXISTS threat_model;
    `);
    
    // Create migrations table if it doesn't exist
    await client.query(`
      CREATE TABLE IF NOT EXISTS threat_model.migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    return true;
  } catch (error) {
    console.error('Error ensuring migrations table exists:', error);
    return false;
  }
}

// Get list of applied migrations
async function getAppliedMigrations(client) {
  try {
    const result = await client.query('SELECT name FROM threat_model.migrations ORDER BY id');
    return result.rows.map(row => row.name);
  } catch (error) {
    console.error('Error getting applied migrations:', error);
    return [];
  }
}

// Get list of pending migrations
async function getPendingMigrations(appliedMigrations) {
  // Ensure migrations directory exists
  if (!fs.existsSync(migrationsDir)) {
    console.log('Creating migrations directory...');
    fs.mkdirSync(migrationsDir, { recursive: true });
    return [];
  }
  
  // Get all migration files
  const files = fs.readdirSync(migrationsDir)
    .filter(file => file.endsWith('.sql'))
    .sort(); // Sort to ensure correct order
  
  // Filter out already applied migrations
  return files.filter(file => !appliedMigrations.includes(file));
}

// Apply a migration
async function applyMigration(client, migrationFile) {
  const spinner = ora(`Applying migration: ${migrationFile}`).start();
  const filePath = path.join(migrationsDir, migrationFile);
  
  try {
    // Read and execute migration SQL
    const sql = fs.readFileSync(filePath, 'utf8');
    
    // Split SQL into separate statements
    const statements = sql
      .replace(/\/\*[\s\S]*?\*\/|--.*$/gm, '') // Remove comments
      .split(';')
      .filter(statement => statement.trim() !== '');
    
    // Execute each statement within a transaction
    await client.query('BEGIN');
    
    for (const statement of statements) {
      if (statement.trim()) {
        await client.query(statement);
      }
    }
    
    // Record the migration
    await client.query(
      'INSERT INTO threat_model.migrations (name) VALUES ($1)',
      [migrationFile]
    );
    
    await client.query('COMMIT');
    spinner.succeed(`Applied migration: ${migrationFile}`);
    return true;
  } catch (error) {
    await client.query('ROLLBACK');
    spinner.fail(`Failed to apply migration ${migrationFile}: ${error.message}`);
    console.error('Error details:', error);
    return false;
  }
}

// Main migration function
async function migrateDatabase() {
  let client;
  
  try {
    client = await pool.connect();
    
    // Ensure migrations table exists
    const tableCreated = await ensureMigrationsTable(client);
    if (!tableCreated) {
      throw new Error('Failed to create migrations table');
    }
    
    // Get applied migrations
    const appliedMigrations = await getAppliedMigrations(client);
    console.log(`Found ${appliedMigrations.length} previously applied migrations`);
    
    // Get pending migrations
    const pendingMigrations = await getPendingMigrations(appliedMigrations);
    console.log(`Found ${pendingMigrations.length} pending migrations`);
    
    if (pendingMigrations.length === 0) {
      console.log('No pending migrations to apply');
      return true;
    }
    
    // Apply pending migrations
    for (const migration of pendingMigrations) {
      const success = await applyMigration(client, migration);
      if (!success) {
        throw new Error(`Migration failed: ${migration}`);
      }
    }
    
    console.log(`Successfully applied ${pendingMigrations.length} migrations`);
    return true;
  } catch (error) {
    console.error('Error during database migration:', error);
    return false;
  } finally {
    if (client) client.release();
    await pool.end();
  }
}

// Create a sample migration file if migrations directory is empty
function createSampleMigration() {
  if (!fs.existsSync(migrationsDir)) {
    fs.mkdirSync(migrationsDir, { recursive: true });
  }
  
  const files = fs.readdirSync(migrationsDir).filter(file => file.endsWith('.sql'));
  
  if (files.length === 0) {
    console.log('Creating sample migration file...');
    const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
    const samplePath = path.join(migrationsDir, `${timestamp}_sample_migration.sql`);
    
    const sampleContent = `-- Sample migration file
-- This is a sample migration that doesn't actually change anything
-- Replace this with your actual schema changes

-- Example of adding a new column:
-- ALTER TABLE threat_model.threats ADD COLUMN IF NOT EXISTS new_column TEXT;

-- Example of creating a new index:
-- CREATE INDEX IF NOT EXISTS idx_threats_category ON threat_model.threats(category);

-- Your migrations can include any valid PostgreSQL statements
`;
    
    fs.writeFileSync(samplePath, sampleContent);
    console.log(`Created sample migration file: ${samplePath}`);
  }
}

// Run migrations
console.log('Starting database migration...');
createSampleMigration();

migrateDatabase()
  .then(success => {
    if (success) {
      console.log('✅ Database migration completed successfully');
    } else {
      console.error('❌ Database migration failed');
      process.exit(1);
    }
  })
  .catch(error => {
    console.error('❌ Unexpected error during database migration:', error);
    process.exit(1);
  });
