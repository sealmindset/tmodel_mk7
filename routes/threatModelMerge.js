/**
 * Threat Model Merge Routes
 * 
 * Provides routes for the threat model merge UI
 */
const express = require('express');
const router = express.Router();
const { ensureAuthenticated } = require('../middleware/auth');
const pool = require('../db/db');
const redisClient = require('../utils/redis').client;

/**
 * @route GET /merge-threat-models
 * @desc Render the threat model merge page
 * @access Private
 */
router.get('/merge-threat-models', ensureAuthenticated, async (req, res) => {
  try {
    // Get PostgreSQL threat models
    const pgModelsQuery = `
      SELECT tm.*, 
        COUNT(t.id)::integer as threat_count,
        COALESCE(AVG(t.risk_score), 0)::integer as avg_risk_score
      FROM threat_model.threat_models tm
      LEFT JOIN threat_model.threats t ON tm.id = t.threat_model_id
      GROUP BY tm.id
      ORDER BY tm.created_at DESC
    `;
    
    const pgModelsResult = await pool.query(pgModelsQuery);
    const pgModels = pgModelsResult.rows;
    
    // Get Redis-based threat models
    const subjectKeys = await redisClient.keys('subject:*:title');
    const redisModels = [];
    
    for (const key of subjectKeys) {
      const subjectid = key.split(':')[1];
      const title = await redisClient.get(key);
      
      // Get threat count
      let threatCount = 0;
      const cachedThreatCount = await redisClient.get(`subject:${subjectid}:threatCount`);
      
      if (cachedThreatCount !== null) {
        threatCount = parseInt(cachedThreatCount, 10) || 0;
      } else {
        // If no cached count, get response text and count threats
        const responseText = await redisClient.get(`subject:${subjectid}:response`);
        if (responseText) {
          // Count threats using pattern matching
          const threatPattern = /## Threat:([^#]+)/g;
          let match;
          let matches = [];
          
          while ((match = threatPattern.exec(responseText)) !== null) {
            matches.push(match[1]);
          }
          
          threatCount = matches.length;
          
          // Cache the count for future use
          await redisClient.set(`subject:${subjectid}:threatCount`, threatCount.toString());
        }
      }
      
      redisModels.push({
        subjectid,
        title,
        threatCount,
        createdAt: await redisClient.get(`subject:${subjectid}:createdAt`) || new Date().toISOString()
      });
    }
    
    // Sort Redis models by creation date (newest first)
    redisModels.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    res.render('threat-model-merge', {
      pgModels,
      redisModels,
      pageTitle: 'Merge Threat Models',
      active: 'threat-models'
    });
  } catch (error) {
    console.error('Error loading threat model merge page:', error);
    res.status(500).render('error', {
      errorCode: 500,
      errorMessage: 'Error loading threat model merge page',
      errorDetails: error.message
    });
  }
});

module.exports = router;
