/**
 * Projects route handler
 * Displays the projects list page and handles filtering
 */
const express = require('express');
const router = express.Router();
const db = require('../db/db');
const redisClient = require('../utils/redis').client;
const { ensureAuthenticated } = require('../middleware/auth');

// Helper function to get criticality class for badge styling
function getCriticalityClass(criticality) {
  switch (criticality) {
    case 'Critical': return 'danger';
    case 'High': return 'warning';
    case 'Medium': return 'info';
    case 'Low': return 'secondary';
    default: return 'secondary';
  }
}

// Helper function to get status class for badge styling
function getStatusClass(status) {
  switch (status) {
    case 'Active': return 'success';
    case 'Planning': return 'info';
    case 'Development': return 'primary';
    case 'Maintenance': return 'warning';
    case 'Archived': return 'secondary';
    default: return 'secondary';
  }
}

// Helper function to get risk score class
function getRiskClass(score) {
  if (score >= 7.5) return 'bg-danger';
  if (score >= 5) return 'bg-warning';
  if (score >= 2.5) return 'bg-info';
  return 'bg-success';
}

// GET /projects - Show projects list
router.get('/', ensureAuthenticated, async (req, res) => {
  try {
    // Get filter parameters from query string
    const { business_unit, criticality, status } = req.query;
    
    // Build SQL query with optional filters
    let query = `
      SELECT 
        p.id, 
        p.name, 
        p.description, 
        p.business_unit, 
        p.criticality, 
        p.data_classification, 
        p.status,
        p.created_at,
        p.updated_at,
        COUNT(DISTINCT ptm.threat_model_id) as threat_model_count,
        COALESCE(AVG(tm.risk_score), 0) as avg_risk_score
      FROM 
        threat_model.projects p
      LEFT JOIN 
        threat_model.project_threat_models ptm ON p.id = ptm.project_id
      LEFT JOIN 
        threat_model.threat_models tm ON ptm.threat_model_id = tm.id
    `;
    
    // Add WHERE clauses for filters
    const whereConditions = [];
    // Exclude archived projects by default
    if (!status) {
      whereConditions.push("p.status != 'Archived'");
    }
    const params = [];
    
    if (business_unit) {
      whereConditions.push('p.business_unit = $' + (params.length + 1));
      params.push(business_unit);
    }
    
    if (criticality) {
      whereConditions.push('p.criticality = $' + (params.length + 1));
      params.push(criticality);
    }
    
    if (status) {
      whereConditions.push('p.status = $' + (params.length + 1));
      params.push(status);
    }
    
    if (whereConditions.length > 0) {
      query += ' WHERE ' + whereConditions.join(' AND ');
    }
    
    // Add GROUP BY and ORDER BY
    query += `
      GROUP BY 
        p.id, p.name, p.description, p.business_unit, 
        p.criticality, p.data_classification, p.status,
        p.created_at, p.updated_at
      ORDER BY
        p.name ASC
    `;
    
    // Execute query
    const result = await db.query(query, params);
    const projects = result.rows;
    
    // Update threat model counts to include Redis-based threat models
    for (const project of projects) {
      // Check if we have a cached total count
      const cachedCount = await redisClient.get(`project:${project.id}:total_threat_model_count`);
      
      if (cachedCount !== null) {
        // Use cached count
        project.threat_model_count = parseInt(cachedCount);
      } else {
        // Get Redis subject count for this project (these are the Redis-based threat models)
        const redisSubjectCount = await redisClient.sCard(`project:${project.id}:subjects`) || 0;
        
        // Get PostgreSQL threat model count from the query result
        // This is the count of threat models, not individual threats
        const pgThreatModelCount = parseInt(project.threat_model_count) || 0;
        
        // Add Redis count to PostgreSQL count to get total threat model count
        project.threat_model_count = pgThreatModelCount + redisSubjectCount;
        
        // Cache the result with a 1-hour TTL
        await redisClient.set(
          `project:${project.id}:total_threat_model_count`, 
          project.threat_model_count.toString(),
          'EX', 3600
        );
      }
    }
    
    // Get list of unique business units for filter dropdown
    const businessUnitsResult = await db.query(`
      SELECT DISTINCT business_unit 
      FROM threat_model.projects 
      WHERE business_unit IS NOT NULL AND business_unit != ''
      ORDER BY business_unit ASC
    `);
    const businessUnits = businessUnitsResult.rows.map(row => row.business_unit);
    
    // If no business units found, provide some default options
    if (businessUnits.length === 0) {
      businessUnits.push('Engineering', 'Finance', 'HR', 'Marketing', 'Operations', 'Sales');
    }
    
    // Get statistics for criticality pie chart
    const criticalityResult = await db.query(`
      SELECT criticality, COUNT(*) as count
      FROM threat_model.projects
      GROUP BY criticality
    `);
    
    // Initialize stats with zero counts
    const criticalityStats = {
      Critical: 0,
      High: 0,
      Medium: 0,
      Low: 0
    };
    
    // Fill in actual counts from database
    criticalityResult.rows.forEach(row => {
      if (row.criticality in criticalityStats) {
        criticalityStats[row.criticality] = parseInt(row.count);
      }
    });
    
    // Get statistics for business unit chart
    const businessUnitResult = await db.query(`
      SELECT business_unit, COUNT(*) as count
      FROM threat_model.projects
      WHERE business_unit IS NOT NULL AND business_unit != ''
      GROUP BY business_unit
    `);
    
    // Initialize business unit stats
    const businessUnitStats = {};
    
    // Add default values for common business units if none exist
    if (businessUnitResult.rows.length === 0) {
      businessUnitStats['Engineering'] = 0;
      businessUnitStats['Finance'] = 0;
      businessUnitStats['HR'] = 0;
      businessUnitStats['Marketing'] = 0;
      businessUnitStats['Operations'] = 0;
      businessUnitStats['Sales'] = 0;
    } else {
      // Fill in actual counts from database
      businessUnitResult.rows.forEach(row => {
        if (row.business_unit) {
          businessUnitStats[row.business_unit] = parseInt(row.count);
        }
      });
    }
    
    // Render the projects page
    res.render('projects', {
      projects,
      businessUnits,
      getStatusClass,
      getCriticalityClass,
      getRiskClass,
      criticalityStats,
      businessUnitStats,
      filters: {
        business_unit,
        criticality,
        status
      }
    });
  } catch (error) {
    console.error('Error fetching projects:', error);
    res.status(500).render('projects', {
      projects: [],
      businessUnits: ['Engineering', 'Finance', 'HR', 'Marketing', 'Operations', 'Sales'],
      getStatusClass,
      getCriticalityClass,
      getRiskClass,
      criticalityStats: { Critical: 0, High: 0, Medium: 0, Low: 0 },
      businessUnitStats: { Engineering: 0, Finance: 0, HR: 0, Marketing: 0, Operations: 0, Sales: 0 },
      filters: {},
      message: { type: 'danger', text: 'Error loading projects: ' + error.message }
    });
  }
});

module.exports = router;
