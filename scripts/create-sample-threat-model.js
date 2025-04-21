/**
 * Script to create a sample threat model for testing
 */
const db = require('../database');

async function createSampleThreatModel() {
  try {
    console.log('Creating sample threat model...');
    
    // First, check if we already have threat models
    const checkQuery = 'SELECT COUNT(*) FROM threat_model.threat_models';
    const checkResult = await db.query(checkQuery);
    const count = parseInt(checkResult.rows[0].count);
    
    console.log(`Current threat model count: ${count}`);
    
    if (count > 0) {
      console.log('Threat models already exist. No need to create a sample.');
      
      // List existing threat models
      const listQuery = 'SELECT id, name, project_id, status FROM threat_model.threat_models';
      const listResult = await db.query(listQuery);
      console.log('Existing threat models:');
      console.table(listResult.rows);
      
      process.exit(0);
    }
    
    // Get the first project ID to use
    const projectQuery = 'SELECT id FROM threat_model.projects LIMIT 1';
    const projectResult = await db.query(projectQuery);
    
    if (projectResult.rows.length === 0) {
      console.error('No projects found. Please create a project first.');
      process.exit(1);
    }
    
    const projectId = projectResult.rows[0].id;
    console.log(`Using project ID: ${projectId}`);
    
    // Create sample threat models
    const sampleModels = [
      {
        title: 'OWASP Top 10 Web Application',
        description: 'Standard threat model based on OWASP Top 10 for web applications',
        risk_score: 75,
        model_data: JSON.stringify({
          version: '1.0',
          status: 'Active',
          framework: 'OWASP Top 10'
        })
      },
      {
        title: 'Cloud Infrastructure Security',
        description: 'Comprehensive threat model for cloud infrastructure deployments',
        risk_score: 65,
        model_data: JSON.stringify({
          version: '1.0',
          status: 'Draft',
          framework: 'Cloud Security Alliance'
        })
      },
      {
        title: 'Mobile Application Security',
        description: 'Threat model for mobile applications covering iOS and Android',
        risk_score: 70,
        model_data: JSON.stringify({
          version: '1.0',
          status: 'In Review',
          framework: 'OWASP Mobile Top 10'
        })
      }
    ];
    
    for (const model of sampleModels) {
      const query = `
        INSERT INTO threat_model.threat_models 
          (project_id, title, description, risk_score, model_data, created_by)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
      `;
      
      const values = [
        projectId,
        model.title,
        model.description,
        model.risk_score,
        model.model_data,
        null // created_by
      ];
      
      const result = await db.query(query, values);
      console.log(`Created threat model: ${model.title} (ID: ${result.rows[0].id})`);
    }
    
    console.log('Sample threat models created successfully!');
  } catch (err) {
    console.error('Error creating sample threat models:', err);
  } finally {
    process.exit(0);
  }
}

// Run the function
createSampleThreatModel();
