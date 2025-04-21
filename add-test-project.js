/**
 * Script to add a test project to the database
 */
const { Pool } = require('pg');
require('dotenv').config();

// Database connection configuration
const config = {
  user: process.env.POSTGRES_USER || 'postgres',
  password: process.env.POSTGRES_PASSWORD || 'postgres',
  host: process.env.POSTGRES_HOST || 'localhost',
  port: process.env.POSTGRES_PORT || 5432,
  database: 'postgres' // Connect to default postgres database
};

async function addTestProject() {
  console.log('Checking for existing projects and adding test project if needed...');
  console.log('Using configuration:', {
    user: config.user,
    host: config.host,
    port: config.port,
    database: config.database
  });
  
  const pool = new Pool(config);
  
  try {
    // Check if there are any existing projects
    const projectsResult = await pool.query(`
      SELECT COUNT(*) FROM threat_model.projects
    `);
    
    const projectCount = parseInt(projectsResult.rows[0].count);
    console.log(`Found ${projectCount} existing projects`);
    
    if (projectCount === 0) {
      console.log('No projects found. Adding a test project...');
      
      // Add a test project
      const projectResult = await pool.query(`
        INSERT INTO threat_model.projects (
          name, 
          description, 
          business_unit, 
          criticality, 
          data_classification, 
          status
        ) VALUES (
          'Test Application', 
          'A test application for demonstration purposes', 
          'Development', 
          'Medium', 
          'Internal', 
          'Active'
        ) RETURNING id
      `);
      
      const projectId = projectResult.rows[0].id;
      console.log(`Created test project with ID: ${projectId}`);
      
      // Add a test component
      const componentResult = await pool.query(`
        INSERT INTO threat_model.components (
          name, 
          description, 
          type, 
          technology_stack
        ) VALUES (
          'Web Frontend', 
          'User interface for the application', 
          'Frontend', 
          'React, Bootstrap'
        ) RETURNING id
      `);
      
      const componentId = componentResult.rows[0].id;
      console.log(`Created test component with ID: ${componentId}`);
      
      // Link the component to the project
      await pool.query(`
        INSERT INTO threat_model.project_components (
          project_id, 
          component_id
        ) VALUES ($1, $2)
      `, [projectId, componentId]);
      
      console.log('Linked component to project');
      
      // Add a test threat model
      const threatModelResult = await pool.query(`
        INSERT INTO threat_model.threat_models (
          name,
          component_id,
          description,
          status
        ) VALUES (
          'Web Frontend Threat Model',
          $1,
          'Threat model for the web frontend component',
          'Draft'
        ) RETURNING id
      `, [componentId]);
      
      console.log(`Created test threat model with ID: ${threatModelResult.rows[0].id}`);
      
      // Add some test vulnerabilities
      await pool.query(`
        INSERT INTO threat_model.vulnerabilities (
          component_id,
          title,
          description,
          severity,
          status
        ) VALUES 
        ($1, 'Cross-Site Scripting (XSS)', 'Unsanitized user input could allow XSS attacks', 'High', 'Open'),
        ($1, 'Insecure Authentication', 'Weak password requirements', 'Medium', 'In Progress'),
        ($1, 'Missing Rate Limiting', 'No rate limiting on login attempts', 'Medium', 'Open')
      `, [componentId]);
      
      console.log('Added test vulnerabilities');
      
      console.log('Test project setup completed successfully!');
    } else {
      console.log('Projects already exist, no test data needed.');
      
      // Fetch and display existing projects
      const projectsList = await pool.query(`
        SELECT id, name, business_unit, criticality, status 
        FROM threat_model.projects
      `);
      
      console.log('\nExisting projects:');
      projectsList.rows.forEach((project, index) => {
        console.log(`${index + 1}. ${project.name} (${project.id}) - ${project.business_unit}, ${project.criticality}, ${project.status}`);
      });
    }
    
  } catch (error) {
    console.error('Error setting up test project:', error);
  } finally {
    await pool.end();
    console.log('Database connection closed');
  }
}

// Run the script
addTestProject();
