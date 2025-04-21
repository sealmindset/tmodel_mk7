/**
 * Project Assignments API Routes
 * Handles the assignment of threat models to projects
 */
const express = require('express');
const router = express.Router();
const { ensureAuthenticated } = require('../../middleware/auth');
const projectAssignmentService = require('../../services/projectAssignmentService');

/**
 * @route   GET /api/projects/:id/threat-models
 * @desc    Get threat models assigned to a project
 * @access  Private
 */
router.get('/projects/:id/threat-models', ensureAuthenticated, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.query;
    
    const threatModels = await projectAssignmentService.getThreatModelsForProject(id, { status });
    
    res.json({ success: true, data: threatModels });
  } catch (error) {
    console.error('Error fetching project threat models:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

/**
 * @route   GET /api/threat-models/:id/projects
 * @desc    Get projects assigned to a threat model
 * @access  Private
 */
router.get('/threat-models/:id/projects', ensureAuthenticated, async (req, res) => {
  try {
    const { id } = req.params;
    
    // This endpoint is no longer supported as we removed the getProjectsForThreatModel function
    // Return an empty array to avoid breaking existing clients
    console.warn(`Deprecated endpoint called: GET /api/threat-models/${id}/projects`);
    
    res.json({ 
      success: true, 
      data: [],
      message: 'This endpoint is deprecated. Please use the project-centric endpoints instead.'
    });
  } catch (error) {
    console.error('Error handling deprecated endpoint:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

/**
 * @route   POST /api/projects/:id/threat-models
 * @desc    Assign threat models to a project
 * @access  Private
 */
router.post('/projects/:id/threat-models', ensureAuthenticated, async (req, res) => {
  try {
    const { id } = req.params;
    const { threatModelIds } = req.body;
    
    if (!Array.isArray(threatModelIds) || threatModelIds.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid threat model IDs. Please provide an array of UUIDs.' 
      });
    }
    
    // Get username from session or use 'system' as fallback
    const username = req.session?.username || 'system';
    
    // Log the start of the assignment process
    console.log(`Starting assignment of ${threatModelIds.length} threat models to project ${id}`);
    
    // Start the assignment process but don't wait for it to complete
    // This allows us to respond to the client immediately
    const assignmentPromise = projectAssignmentService.assignThreatModelsToProject(id, threatModelIds, username);
    
    // Respond immediately to prevent UI hanging
    res.status(202).json({ 
      success: true, 
      message: `Assignment of ${threatModelIds.length} threat model(s) to project started.`
    });
    
    // Continue processing in the background
    assignmentPromise
      .then(assignedIds => {
        console.log(`Successfully assigned ${assignedIds.length} threat models to project ${id}`);
      })
      .catch(error => {
        console.error(`Error in background assignment for project ${id}:`, error);
      });
      
  } catch (error) {
    console.error('Error starting threat model assignment:', error);
    
    // Handle specific errors with appropriate status codes
    if (error.message.includes('not found')) {
      return res.status(404).json({ success: false, error: error.message });
    }
    
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

/**
 * @route   DELETE /api/projects/:projectId/threat-models/:threatModelId
 * @desc    Remove a threat model assignment from a project
 * @access  Private
 */
router.delete('/projects/:projectId/threat-models/:threatModelId', ensureAuthenticated, async (req, res) => {
  try {
    const { projectId, threatModelId } = req.params;
    
    await projectAssignmentService.removeThreatModelFromProject(projectId, threatModelId);
    
    res.json({ 
      success: true, 
      message: 'Threat model assignment removed successfully' 
    });
  } catch (error) {
    console.error('Error removing threat model assignment:', error);
    
    // Handle specific errors with appropriate status codes
    if (error.message.includes('not found')) {
      return res.status(404).json({ success: false, error: error.message });
    }
    
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

/**
 * @route   POST /api/projects/:id/clear-cache
 * @desc    Clear the cache for a project's threat models
 * @access  Private
 */
router.post('/projects/:id/clear-cache', ensureAuthenticated, async (req, res) => {
  try {
    const { id } = req.params;
    const redisClient = require('../../utils/redis').client;
    
    // Clear cache for this project
    const cachePattern = `project:${id}:threat_models*`;
    const keys = await redisClient.keys(cachePattern);
    
    if (keys.length > 0) {
      await redisClient.del(keys);
      console.log(`Cleared cache for pattern ${cachePattern}, ${keys.length} keys removed`);
    } else {
      console.log(`No cache keys found for pattern ${cachePattern}`);
    }
    
    res.json({ 
      success: true, 
      message: 'Cache cleared successfully' 
    });
  } catch (error) {
    console.error('Error clearing cache:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

module.exports = router;
