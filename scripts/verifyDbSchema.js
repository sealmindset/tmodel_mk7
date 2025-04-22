/**
 * Database Schema Verification Script
 * 
 * This script verifies that all necessary database tables, columns, and indexes exist.
 * It will add missing elements as needed to ensure database consistency.
 */
require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

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

/**
 * Comprehensive database schema validation and correction
 */
async function verifyDatabaseSchema() {
  let client;
  
  try {
    console.log('Connecting to database...');
    client = await pool.connect();
    
    // Step 1: Verify schema exists
    console.log('Verifying threat_model schema exists...');
    await client.query('CREATE SCHEMA IF NOT EXISTS threat_model;');
    
    // Step 2: Verify each table exists and has required columns
    await verifyProjectsTable(client);
    await verifyVulnerabilitiesTable(client);
    await verifyComponentsTable(client);
    await verifyProjectComponentsTable(client);
    await verifyScanHistoryTable(client);
    await verifyThreatModelsTable(client);
    await verifySafeguardsTable(client);
    await verifyThreatsTable(client);
    
    // Step 3: Verify indexes
    await verifyIndexes(client);
    
    // Step 4: If tables are empty, add default data
    await addDefaultDataIfNeeded(client);
    
    console.log('Database schema verification completed successfully!');
    return true;
  } catch (error) {
    console.error('Error verifying database schema:', error);
    return false;
  } finally {
    if (client) client.release();
    await pool.end();
  }
}

/**
 * Verify the projects table
 */
async function verifyProjectsTable(client) {
  console.log('Verifying projects table...');
  
  // Create table if it doesn't exist
  await client.query(`
    CREATE TABLE IF NOT EXISTS threat_model.projects (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      description TEXT,
      business_unit VARCHAR(100),
      criticality VARCHAR(50) DEFAULT 'Medium',
      data_classification VARCHAR(100) DEFAULT 'Internal Use Only',
      status VARCHAR(50) DEFAULT 'Active',
      external_id VARCHAR(100),
      created_by VARCHAR(100),
      last_updated_by VARCHAR(100),
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `);
  
  // Verify or add missing columns
  const columnChecks = [
    { name: 'business_unit', type: 'VARCHAR(100)', default: null },
    { name: 'criticality', type: 'VARCHAR(50)', default: "'Medium'" },
    { name: 'data_classification', type: 'VARCHAR(100)', default: "'Internal Use Only'" },
    { name: 'status', type: 'VARCHAR(50)', default: "'Active'" },
    { name: 'external_id', type: 'VARCHAR(100)', default: null },
    { name: 'created_by', type: 'VARCHAR(100)', default: null },
    { name: 'last_updated_by', type: 'VARCHAR(100)', default: null }
  ];
  
  for (const column of columnChecks) {
    const columnExists = await checkColumnExists(client, 'projects', column.name);
    if (!columnExists) {
      console.log(`Adding missing column ${column.name} to projects table...`);
      const defaultClause = column.default ? `DEFAULT ${column.default}` : '';
      await client.query(`
        ALTER TABLE threat_model.projects 
        ADD COLUMN ${column.name} ${column.type} ${defaultClause};
      `);
    }
  }
}

/**
 * Verify the vulnerabilities table
 */
async function verifyVulnerabilitiesTable(client) {
  console.log('Verifying vulnerabilities table...');
  
  // Create table if it doesn't exist
  await client.query(`
    CREATE TABLE IF NOT EXISTS threat_model.vulnerabilities (
      id SERIAL PRIMARY KEY,
      external_id VARCHAR(100) UNIQUE,
      title VARCHAR(255) NOT NULL,
      description TEXT,
      severity VARCHAR(50),
      cvss_score DECIMAL(3,1),
      status VARCHAR(50) NOT NULL DEFAULT 'Open',
      remediation TEXT,
      project_id INTEGER,
      asset_id VARCHAR(100),
      asset_name VARCHAR(255),
      first_found TIMESTAMP WITH TIME ZONE,
      last_found TIMESTAMP WITH TIME ZONE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `);
  
  // Create indexes if they don't exist
  await client.query(`
    CREATE INDEX IF NOT EXISTS vuln_project_idx ON threat_model.vulnerabilities(project_id);
    CREATE INDEX IF NOT EXISTS vuln_status_idx ON threat_model.vulnerabilities(status);
    CREATE INDEX IF NOT EXISTS vuln_severity_idx ON threat_model.vulnerabilities(severity);
  `);
}

/**
 * Verify the components table
 */
async function verifyComponentsTable(client) {
  console.log('Verifying components table...');
  
  // Create table if it doesn't exist
  await client.query(`
    CREATE TABLE IF NOT EXISTS threat_model.components (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      hostname VARCHAR(255),
      ip_address VARCHAR(50),
      type VARCHAR(50) NOT NULL,
      has_threat_model BOOLEAN DEFAULT false,
      threat_model_id INTEGER,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

/**
 * Verify the project_components table
 */
async function verifyProjectComponentsTable(client) {
  console.log('Verifying project_components table...');
  
  // First check if projects and components tables exist
  const projectTableExists = await checkTableExists(client, 'projects');
  const componentTableExists = await checkTableExists(client, 'components');
  
  if (projectTableExists && componentTableExists) {
    // Create table if it doesn't exist
    await client.query(`
      CREATE TABLE IF NOT EXISTS threat_model.project_components (
        id SERIAL PRIMARY KEY,
        project_id INTEGER NOT NULL REFERENCES threat_model.projects(id) ON DELETE CASCADE,
        component_id INTEGER NOT NULL REFERENCES threat_model.components(id) ON DELETE CASCADE,
        notes TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(project_id, component_id)
      );
    `);
    
    // Create indexes if they don't exist
    await client.query(`
      CREATE INDEX IF NOT EXISTS project_components_project_idx ON threat_model.project_components(project_id);
      CREATE INDEX IF NOT EXISTS project_components_component_idx ON threat_model.project_components(component_id);
    `);
  } else {
    console.log('Skipping project_components table creation - dependencies not yet available');
  }
}

/**
 * Verify the scan_history table
 */
async function verifyScanHistoryTable(client) {
  console.log('Verifying scan_history table...');
  
  // Create table if it doesn't exist
  await client.query(`
    CREATE TABLE IF NOT EXISTS threat_model.scan_history (
      id SERIAL PRIMARY KEY,
      scan_id VARCHAR(100) NOT NULL,
      project_id INTEGER REFERENCES threat_model.projects(id),
      status VARCHAR(50) NOT NULL,
      start_time TIMESTAMP WITH TIME ZONE,
      end_time TIMESTAMP WITH TIME ZONE,
      total_vulnerabilities INTEGER DEFAULT 0,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `);
  
  // Create index if it doesn't exist
  await client.query(`
    CREATE INDEX IF NOT EXISTS scan_history_scan_id_idx ON threat_model.scan_history(scan_id);
  `);
}

/**
 * Verify the threat_models table
 */
async function verifyThreatModelsTable(client) {
  console.log('Verifying threat_models table...');
  
  // Create table if it doesn't exist
  await client.query(`
    CREATE TABLE IF NOT EXISTS threat_model.threat_models (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      description TEXT,
      project_id INTEGER REFERENCES threat_model.projects(id) ON DELETE CASCADE,
      status VARCHAR(50) DEFAULT 'Draft',
      risk_score DECIMAL(4,2),
      created_by VARCHAR(100),
      approved_by VARCHAR(100),
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `);
  
  // Create index if it doesn't exist
  await client.query(`
    CREATE INDEX IF NOT EXISTS threat_models_project_idx ON threat_model.threat_models(project_id);
  `);
}

/**
 * Verify the safeguards table
 */
async function verifySafeguardsTable(client) {
  console.log('Verifying safeguards table...');
  
  // Check if table exists
  const tableExists = await checkTableExists(client, 'safeguards');
  
  if (!tableExists) {
    console.log('Creating safeguards table...');
    // Create table if it doesn't exist
    await client.query(`
      CREATE TABLE IF NOT EXISTS threat_model.safeguards (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        type VARCHAR(100) NOT NULL,
        description TEXT,
        effectiveness INTEGER DEFAULT 50,
        implementation_status VARCHAR(50) DEFAULT 'Planned',
        created_by VARCHAR(100),
        threat_model_id INTEGER REFERENCES threat_model.threat_models(id) ON DELETE CASCADE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    // Create index
    await client.query(`
      CREATE INDEX IF NOT EXISTS safeguards_threat_model_idx ON threat_model.safeguards(threat_model_id);
    `);
  }
}

/**
 * Verify the threats table
 */
async function verifyThreatsTable(client) {
  console.log('Verifying threats table...');
  
  // Check if table exists
  const tableExists = await checkTableExists(client, 'threats');
  
  if (!tableExists) {
    console.log('Creating threats table...');
    // Create table if it doesn't exist
    await client.query(`
      CREATE TABLE IF NOT EXISTS threat_model.threats (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        category VARCHAR(100) NOT NULL,
        description TEXT,
        likelihood INTEGER DEFAULT 50,
        impact INTEGER DEFAULT 50,
        risk_score DECIMAL(4,2),
        status VARCHAR(50) DEFAULT 'Open',
        created_by VARCHAR(100),
        threat_model_id INTEGER REFERENCES threat_model.threat_models(id) ON DELETE CASCADE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    // Create index
    await client.query(`
      CREATE INDEX IF NOT EXISTS threats_threat_model_idx ON threat_model.threats(threat_model_id);
      CREATE INDEX IF NOT EXISTS threats_category_idx ON threat_model.threats(category);
    `);
  }
}

/**
 * Verify all indexes
 */
async function verifyIndexes(client) {
  console.log('Verifying indexes...');
  
  // List of indexes to ensure exist
  const requiredIndexes = [
    { table: 'vulnerabilities', name: 'vuln_project_idx', columns: ['project_id'] },
    { table: 'vulnerabilities', name: 'vuln_status_idx', columns: ['status'] },
    { table: 'vulnerabilities', name: 'vuln_severity_idx', columns: ['severity'] },
    { table: 'project_components', name: 'project_components_project_idx', columns: ['project_id'] },
    { table: 'project_components', name: 'project_components_component_idx', columns: ['component_id'] },
    { table: 'scan_history', name: 'scan_history_scan_id_idx', columns: ['scan_id'] },
    { table: 'threat_models', name: 'threat_models_project_idx', columns: ['project_id'] }
  ];
  
  for (const index of requiredIndexes) {
    const tableExists = await checkTableExists(client, index.table);
    if (tableExists) {
      const indexExists = await checkIndexExists(client, index.table, index.name);
      if (!indexExists) {
        console.log(`Creating index ${index.name} on ${index.table}...`);
        const columnList = index.columns.join(', ');
        await client.query(`
          CREATE INDEX IF NOT EXISTS ${index.name} ON threat_model.${index.table}(${columnList});
        `);
      }
    }
  }
}

/**
 * Add default data if tables are empty
 */
async function addDefaultDataIfNeeded(client) {
  console.log('Checking for default data...');
  
  // Check if projects table is empty
  const projectsResult = await client.query('SELECT COUNT(*) FROM threat_model.projects');
  
  if (parseInt(projectsResult.rows[0].count) === 0) {
    console.log('Adding default project...');
    await client.query(`
      INSERT INTO threat_model.projects (name, description, business_unit, criticality, status)
      VALUES ('Default Project', 'Default project for vulnerabilities', 'Engineering', 'Medium', 'Active');
    `);
  }
  
  // Check if safeguards table exists and is empty
  const safeguardsExists = await checkTableExists(client, 'safeguards');
  if (safeguardsExists) {
    const safeguardsResult = await client.query('SELECT COUNT(*) FROM threat_model.safeguards WHERE threat_model_id IS NULL');
    
    if (parseInt(safeguardsResult.rows[0].count) === 0) {
      console.log('Adding default safeguard types...');
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
      
      for (const type of safeguardTypes) {
        await client.query(`
          INSERT INTO threat_model.safeguards 
            (name, type, description, effectiveness, implementation_status, created_by)
          VALUES 
            ($1, $1, $2, 80, 'Implemented', 'system')
        `, [type, `Default ${type} safeguard template`]);
      }
    }
  }
  
  // Check if threats table exists and is empty
  const threatsExists = await checkTableExists(client, 'threats');
  if (threatsExists) {
    const threatsResult = await client.query('SELECT COUNT(*) FROM threat_model.threats WHERE threat_model_id IS NULL');
    
    if (parseInt(threatsResult.rows[0].count) === 0) {
      console.log('Adding default threat categories...');
      const threatCategories = [
        'Spoofing', 
        'Tampering', 
        'Repudiation', 
        'Information Disclosure', 
        'Denial of Service', 
        'Elevation of Privilege'
      ];
      
      for (const category of threatCategories) {
        await client.query(`
          INSERT INTO threat_model.threats 
            (name, category, description, created_by)
          VALUES 
            ($1, $1, $2, 'system')
        `, [category, `Default ${category} threat template`]);
      }
    }
  }
}

/**
 * Helper function to check if a table exists
 */
async function checkTableExists(client, tableName) {
  const result = await client.query(`
    SELECT EXISTS (
      SELECT FROM information_schema.tables 
      WHERE table_schema = 'threat_model' AND table_name = $1
    );
  `, [tableName]);
  
  return result.rows[0].exists;
}

/**
 * Helper function to check if a column exists
 */
async function checkColumnExists(client, tableName, columnName) {
  const result = await client.query(`
    SELECT EXISTS (
      SELECT FROM information_schema.columns 
      WHERE table_schema = 'threat_model' AND table_name = $1 AND column_name = $2
    );
  `, [tableName, columnName]);
  
  return result.rows[0].exists;
}

/**
 * Helper function to check if an index exists
 */
async function checkIndexExists(client, tableName, indexName) {
  const result = await client.query(`
    SELECT EXISTS (
      SELECT FROM pg_indexes
      WHERE schemaname = 'threat_model' AND tablename = $1 AND indexname = $2
    );
  `, [tableName, indexName]);
  
  return result.rows[0].exists;
}

// Run the verification
if (require.main === module) {
  verifyDatabaseSchema()
    .then(success => {
      if (success) {
        console.log('✅ Database schema verification completed successfully');
        process.exit(0);
      } else {
        console.error('❌ Database schema verification failed');
        process.exit(1);
      }
    })
    .catch(error => {
      console.error('❌ Unexpected error during database verification:', error);
      process.exit(1);
    });
} else {
  module.exports = { verifyDatabaseSchema };
}
