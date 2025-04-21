/**
 * Threat Models API Routes
 */
const express = require('express');
const router = express.Router();
const ThreatModel = require('../../database/models/threatModel');
const { ensureAuthenticated } = require('../../middleware/auth');

/**
 * @route   GET /api/threat-models
 * @desc    Get all threat models with optional filtering
 * @access  Private
 */
router.get('/', ensureAuthenticated, async (req, res) => {
  try {
    const { project_id, status } = req.query;
    const filters = {};
    
    if (project_id) filters.project_id = project_id;
    if (status) filters.status = status;
    
    const threatModels = await ThreatModel.getAll(filters);
    res.json({ success: true, data: threatModels });
  } catch (error) {
    console.error('Error fetching threat models:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

/**
 * @route   GET /api/threat-models/:id
 * @desc    Get threat model by ID with threats
 * @access  Private
 */
router.get('/:id', ensureAuthenticated, async (req, res) => {
  try {
    const threatModel = await ThreatModel.getById(req.params.id);
    
    if (!threatModel) {
      return res.status(404).json({ success: false, error: 'Threat model not found' });
    }
    
    res.json({ success: true, data: threatModel });
  } catch (error) {
    console.error('Error fetching threat model:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

/**
 * @route   POST /api/threat-models
 * @desc    Create a new threat model
 * @access  Private
 */
router.post('/', ensureAuthenticated, async (req, res) => {
  try {
    const {
      project_id,
      name,
      description,
      model_version,
      status
    } = req.body;
    
    // Validation
    if (!project_id || !name) {
      return res.status(400).json({
        success: false,
        error: 'Please provide project_id and name'
      });
    }
    
    const modelData = {
      project_id,
      name,
      description,
      model_version: model_version || '1.0',
      status: status || 'Draft',
      created_by: req.user.id
    };
    
    const threatModel = await ThreatModel.create(modelData);
    res.status(201).json({ success: true, data: threatModel });
  } catch (error) {
    console.error('Error creating threat model:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

/**
 * @route   PUT /api/threat-models/:id
 * @desc    Update a threat model
 * @access  Private
 */
router.put('/:id', ensureAuthenticated, async (req, res) => {
  try {
    const threatModel = await ThreatModel.getById(req.params.id);
    
    if (!threatModel) {
      return res.status(404).json({ success: false, error: 'Threat model not found' });
    }
    
    const {
      name,
      description,
      model_version,
      status,
      review_notes
    } = req.body;
    
    const reviewData = {};
    
    // If status is changing to "Reviewed", add reviewer info
    if (status === 'Reviewed' && threatModel.status !== 'Reviewed') {
      reviewData.reviewed_by = req.user.id;
      reviewData.reviewed_at = new Date();
    }
    
    const modelData = {
      name,
      description,
      model_version,
      status,
      review_notes,
      ...reviewData
    };
    
    const updatedThreatModel = await ThreatModel.update(req.params.id, modelData);
    res.json({ success: true, data: updatedThreatModel });
  } catch (error) {
    console.error('Error updating threat model:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

/**
 * @route   DELETE /api/threat-models/:id
 * @desc    Delete a threat model
 * @access  Private
 */
router.delete('/:id', ensureAuthenticated, async (req, res) => {
  try {
    const deleted = await ThreatModel.delete(req.params.id);
    
    if (!deleted) {
      return res.status(404).json({ success: false, error: 'Threat model not found' });
    }
    
    res.json({ success: true, data: { id: req.params.id } });
  } catch (error) {
    console.error('Error deleting threat model:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

/**
 * @route   POST /api/threat-models/:id/clone
 * @desc    Clone a threat model
 * @access  Private
 */
router.post('/:id/clone', ensureAuthenticated, async (req, res) => {
  try {
    const {
      project_id,
      name,
      description,
      model_version
    } = req.body;
    
    const newData = {
      project_id,
      name,
      description,
      model_version,
      created_by: req.user.id
    };
    
    const clonedModel = await ThreatModel.clone(req.params.id, newData);
    res.status(201).json({ success: true, data: clonedModel });
  } catch (error) {
    console.error('Error cloning threat model:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

/**
 * @route   POST /api/threat-models/:id/version
 * @desc    Create a new version of a threat model
 * @access  Private
 */
router.post('/:id/version', ensureAuthenticated, async (req, res) => {
  try {
    const newVersion = await ThreatModel.newVersion(req.params.id);
    res.status(201).json({ success: true, data: newVersion });
  } catch (error) {
    console.error('Error creating new version:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

/**
 * @route   GET /api/threat-models/:id/export
 * @desc    Export threat model to JSON
 * @access  Private
 */
router.get('/:id/export', ensureAuthenticated, async (req, res) => {
  try {
    const exportData = await ThreatModel.exportToJson(req.params.id);
    res.json({ success: true, data: exportData });
  } catch (error) {
    console.error('Error exporting threat model:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

/**
 * @route   GET /api/threat-models/:id/metrics
 * @desc    Get threat model metrics
 * @access  Private
 */
router.get('/:id/metrics', ensureAuthenticated, async (req, res) => {
  try {
    const metrics = await ThreatModel.getMetrics(req.params.id);
    res.json({ success: true, data: metrics });
  } catch (error) {
    console.error('Error fetching threat model metrics:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

module.exports = router;
