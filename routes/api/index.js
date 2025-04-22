/**
 * API Routes Index
 * 
 * Main router file that combines all API routes
 */
const express = require('express');
const router = express.Router();

// Import route modules
const projectsRoutes = require('./projects');
const safeguardsRoutes = require('./safeguards');
const vulnerabilitiesRoutes = require('./vulnerabilities');
const threatsRoutes = require('./threats');
const threatModelsRoutes = require('./threatModels');
const threatModelMergeRoutes = require('./threatModelMerge');
const redisMergeRoutes = require('./redisMerge');
const rapid7Routes = require('./rapid7');
const rapid7TestRoutes = require('./rapid7-test');
const rapid7SyncRoutes = require('./rapid7-sync');
const llmRoutes = require('./llm');
const projectAssignmentsRoutes = require('./projectAssignments');
const openaiKeyController = require('./openaiKeyController');
const subjectsRoutes = require('./subjects');
const componentsRoutes = require('./components');

// Register routes
router.use('/projects', projectsRoutes);
router.use('/safeguards', safeguardsRoutes);
router.use('/vulnerabilities', vulnerabilitiesRoutes);
router.use('/threats', threatsRoutes);
router.use('/threat-models', threatModelsRoutes);
router.use('/', threatModelMergeRoutes); // Mounted at root level for cross-resource operations
router.use('/', redisMergeRoutes); // Redis-specific merge endpoint
router.use('/rapid7', rapid7Routes);
router.use('/rapid7-test', rapid7TestRoutes); // Routes for testing Rapid7 API connection
router.use('/rapid7-sync', rapid7SyncRoutes); // Routes for syncing Rapid7 vulnerability data
router.use('/llm', llmRoutes);
router.use('/settings', openaiKeyController);
router.use('/subjects', subjectsRoutes);
router.use('/components', componentsRoutes);

// Register assignment routes - these are mounted at the root level
// because they span across multiple resource types
router.use('/', projectAssignmentsRoutes);

/**
 * @route   GET /api/status
 * @desc    API status check
 * @access  Public
 */
router.get('/status', (req, res) => {
  res.json({
    success: true,
    message: 'Threat Modeling API is operational',
    version: '2.0.0',
    timestamp: new Date().toISOString()
  });
});

/**
 * @route   GET /api/rapid7-url
 * @desc    Get Rapid7 API URL and key for client-side status checks
 * @access  Public
 */
router.get('/rapid7-url', async (req, res) => {
  try {
    // Get Redis client from utils
    const redisUtil = require('../../utils/redis');
    const redisClient = redisUtil.client;
    
    // Get Rapid7 API URL and key from Redis
    const url = await redisClient.get('settings:rapid7:api_url') || 'http://localhost:3100';
    const apiKey = await redisClient.get('settings:rapid7:api_key') || '';
    
    res.json({ url, apiKey });
  } catch (error) {
    console.error('Error retrieving Rapid7 API URL:', error);
    res.status(500).json({ error: 'Error retrieving Rapid7 API URL' });
  }
});

module.exports = router;
