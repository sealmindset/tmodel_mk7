/**
 * Improved Database Setup Script for Threat Model Generator
 * 
 * This script handles the complete setup of the database schema and tables
 * with proper error handling and environment awareness.
 */
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Environment-aware configuration
const NODE_ENV = process.env.NODE_ENV || 'development';
console.log(`Running in ${NODE_ENV} environment`);

// Database connection configuration with environment fallbacks
const config = {
  user: process.env.POSTGRES_USER || 'postgres',
  password: process.env.POSTGRES_PASSWORD || 'postgres',
  host: process.env.POSTGRES_HOST || 'localhost',
  port: process.env.POSTGRES_PORT || 5432,
  database: 'postgres' // Connect to default postgres database
};

/**
 * Execute SQL file against the database
 * @param {Pool} pool - Database connection pool
 * @param {string} filePath - Path to SQL file
 * @returns {Promise<void>}
 */
async function executeSqlFile(pool, filePath) {
  // Validate input
  if (!pool || !filePath) {
    throw new Error('Pool and filePath are required');
  }

  console.log(`Reading SQL file: ${filePath}`);
  
  try {
    // Read the SQL file
    const sql = fs.readFileSync(filePath, 'utf8');
    
    // Split into statements (respecting functions/triggers with semicolons inside)
    const statements = [];
    let currentStatement = '';
    let inFunction = false;
    
    sql.split('\n').forEach(line => {
      // Skip pure comment lines
      if (line.trim().startsWith('--')) return;
      
      // Check if we're entering a function/trigger definition
      if (line.includes('FUNCTION') || line.includes('TRIGGER') || line.includes('$$')) {
        inFunction = true;
      }
      
      // Add line to current statement
      currentStatement += line + '\n';
      
      // Check if we're exiting a function/trigger definition
      if (inFunction && line.includes('$$;')) {
        inFunction = false;
        statements.push(currentStatement);
        currentStatement = '';
        return;
      }
      
      // If not in function and line ends with semicolon, end statement
      if (!inFunction && line.trim().endsWith(';')) {
        statements.push(currentStatement);
        currentStatement = '';
      }
    });
    
    // Execute each statement
    console.log(`Executing ${statements.length} SQL statements...`);
    
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i].trim();
      if (!statement) continue;
      
      try {
        await pool.query(statement);
      } catch (error) {
        console.error(`Error executing statement ${i + 1}/${statements.length}:`);
        console.error(statement.substring(0, 100) + (statement.length > 100 ? '...' : ''));
        throw error;
      }
    }
    
    console.log('SQL execution completed successfully');
  } catch (error) {
    console.error('Error reading or executing SQL file:', error);
    throw error;
  }
}

/**
 * Verify database setup by checking tables
 * @param {Pool} pool - Database connection pool
 * @returns {Promise<string[]>} - List of created tables
 */
async function verifyDatabaseSetup(pool) {
  const tableResult = await pool.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'threat_model'
    ORDER BY table_name;
  `);
  
  return tableResult.rows.map(row => row.table_name);
}

/**
 * Main database setup function
 */
async function setupDatabase() {
  console.log('=== DATABASE SETUP STARTED ===');
  console.log('Connection configuration:', {
    user: config.user,
    host: config.host,
    port: config.port,
    database: config.database,
    environment: NODE_ENV
  });
  
  const pool = new Pool(config);
  let client = null;
  
  try {
    // Test connection
    client = await pool.connect();
    console.log('Successfully connected to PostgreSQL');
    client.release();
    
    // Execute the clean init SQL
    const initSqlPath = path.join(__dirname, 'database', 'clean-init.sql');
    await executeSqlFile(pool, initSqlPath);
    
    // Verify tables were created
    const tables = await verifyDatabaseSetup(pool);
    
    console.log('\n=== CREATED DATABASE OBJECTS ===');
    if (tables.length === 0) {
      console.warn('No tables were created in the threat_model schema!');
    } else {
      console.log(`Created ${tables.length} tables in threat_model schema:`);
      tables.forEach((table, index) => {
        console.log(`  ${index + 1}. ${table}`);
      });
    }
    
    // Basic data seeding for testing
    if (NODE_ENV === 'development' || NODE_ENV === 'test') {
      console.log('\n=== SEEDING TEST DATA ===');
      // Create a test project
      const projectResult = await pool.query(`
        INSERT INTO threat_model.projects 
        (name, description, business_unit, criticality, data_classification, status, created_by)
        VALUES 
        ('Test Application', 'A test project for development', 'Engineering', 'Medium', 'Internal', 'Active', 'system')
        RETURNING id;
      `);
      
      const projectId = projectResult.rows[0].id;
      console.log(`Created test project with ID: ${projectId}`);
      
      // Create a test component
      const componentResult = await pool.query(`
        INSERT INTO threat_model.components 
        (name, hostname, ip_address, type, description)
        VALUES 
        ('Web Server', 'webserver.example.com', '10.0.0.10', 'Web Application', 'Main web server component')
        RETURNING id;
      `);
      
      const componentId = componentResult.rows[0].id;
      console.log(`Created test component with ID: ${componentId}`);
      
      // Link project and component
      await pool.query(`
        INSERT INTO threat_model.project_components 
        (project_id, component_id)
        VALUES 
        ($1, $2);
      `, [projectId, componentId]);
      
      console.log('Linked test project and component');
    }
    
    console.log('\n=== DATABASE SETUP COMPLETED SUCCESSFULLY ===');
    
  } catch (error) {
    console.error('\n=== DATABASE SETUP FAILED ===');
    console.error('Error:', error.message);
    if (error.hint) console.error('Hint:', error.hint);
    if (error.detail) console.error('Detail:', error.detail);
    
    // Provide troubleshooting advice
    console.log('\n=== TROUBLESHOOTING SUGGESTIONS ===');
    console.log('1. Check that PostgreSQL is running and accessible');
    console.log('2. Verify your database credentials in .env file');
    console.log('3. Ensure you have permission to create schemas and tables');
    console.log('4. If this is a syntax error, check the SQL in clean-init.sql');
    
    process.exit(1);
  } finally {
    try {
      await pool.end();
      console.log('Database connection pool closed');
    } catch (err) {
      console.error('Error closing database connection:', err);
    }
  }
}

// Run setup if this is the main module
if (require.main === module) {
  setupDatabase().catch(err => {
    console.error('Unhandled error in setup process:', err);
    process.exit(1);
  });
}

module.exports = { setupDatabase };
