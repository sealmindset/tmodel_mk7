/**
 * Rapid7 API Routes
 */
const express = require('express');
const router = express.Router();
const rapid7Service = require('../../services/rapid7Service');
const ScanHistory = require('../../database/models/scanHistory');
const { ensureAuthenticated } = require('../../middleware/auth');

/**
 * @route   GET /api/rapid7/vulnerabilities
 * @desc    Get vulnerabilities from Rapid7
 * @access  Private
 */
router.get('/vulnerabilities', ensureAuthenticated, async (req, res) => {
  try {
    const { page, size, sort } = req.query;
    const options = { 
      page: parseInt(page) || 0, 
      size: parseInt(size) || 100,
      sort
    };
    
    const vulnerabilities = await rapid7Service.getVulnerabilities(options);
    res.json({ success: true, data: vulnerabilities });
  } catch (error) {
    console.error('Error fetching vulnerabilities from Rapid7:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Error fetching vulnerabilities',
      message: error.message
    });
  }
});

/**
 * @route   GET /api/rapid7/vulnerabilities/top
 * @desc    Get top vulnerabilities by CVSS score
 * @access  Private
 */
router.get('/vulnerabilities/top', ensureAuthenticated, async (req, res) => {
  try {
    const { limit } = req.query;
    const vulnerabilities = await rapid7Service.getTopVulnerabilities(parseInt(limit) || 10);
    res.json({ success: true, data: vulnerabilities });
  } catch (error) {
    console.error('Error fetching top vulnerabilities:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Error fetching top vulnerabilities',
      message: error.message
    });
  }
});

/**
 * @route   GET /api/rapid7/vulnerabilities/:id
 * @desc    Get vulnerability details by ID
 * @access  Private
 */
router.get('/vulnerabilities/:id', ensureAuthenticated, async (req, res) => {
  try {
    const vulnerability = await rapid7Service.getVulnerabilityById(req.params.id);
    res.json({ success: true, data: vulnerability });
  } catch (error) {
    console.error(`Error fetching vulnerability ${req.params.id}:`, error);
    res.status(500).json({ 
      success: false, 
      error: 'Error fetching vulnerability details',
      message: error.message
    });
  }
});

/**
 * @route   GET /api/rapid7/assets
 * @desc    Get assets from Rapid7
 * @access  Private
 */
router.get('/assets', ensureAuthenticated, async (req, res) => {
  try {
    const { page, size, sort } = req.query;
    const options = { 
      page: parseInt(page) || 0, 
      size: parseInt(size) || 100,
      sort
    };
    
    const assets = await rapid7Service.getAssets(options);
    res.json({ success: true, data: assets });
  } catch (error) {
    console.error('Error fetching assets from Rapid7:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Error fetching assets',
      message: error.message
    });
  }
});

/**
 * @route   GET /api/rapid7/assets/:id
 * @desc    Get asset details by ID
 * @access  Private
 */
router.get('/assets/:id', ensureAuthenticated, async (req, res) => {
  try {
    const asset = await rapid7Service.getAssetById(req.params.id);
    res.json({ success: true, data: asset });
  } catch (error) {
    console.error(`Error fetching asset ${req.params.id}:`, error);
    res.status(500).json({ 
      success: false, 
      error: 'Error fetching asset details',
      message: error.message
    });
  }
});

/**
 * @route   POST /api/rapid7/scans
 * @desc    Start a new scan
 * @access  Private
 */
router.post('/scans', ensureAuthenticated, async (req, res) => {
  try {
    const { site_id, project_id } = req.body;
    
    if (!site_id || !project_id) {
      return res.status(400).json({
        success: false,
        error: 'Please provide site_id and project_id'
      });
    }
    
    const scanResult = await rapid7Service.startScan(site_id, project_id);
    res.status(201).json({ success: true, data: scanResult });
  } catch (error) {
    console.error('Error starting scan:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Error starting scan',
      message: error.message
    });
  }
});

/**
 * @route   GET /api/rapid7/scans/:id
 * @desc    Get scan status
 * @access  Private
 */
router.get('/scans/:id', ensureAuthenticated, async (req, res) => {
  try {
    const scan = await rapid7Service.getScanStatus(req.params.id);
    res.json({ success: true, data: scan });
  } catch (error) {
    console.error(`Error fetching scan status for ${req.params.id}:`, error);
    res.status(500).json({ 
      success: false, 
      error: 'Error fetching scan status',
      message: error.message
    });
  }
});

/**
 * @route   POST /api/rapid7/scans/:id/import
 * @desc    Import vulnerabilities from a completed scan
 * @access  Private
 */
router.post('/scans/:id/import', ensureAuthenticated, async (req, res) => {
  try {
    const { scan_history_id } = req.body;
    
    if (!scan_history_id) {
      return res.status(400).json({
        success: false,
        error: 'Please provide scan_history_id'
      });
    }
    
    const importResults = await rapid7Service.importVulnerabilitiesFromScan(
      req.params.id,
      scan_history_id
    );
    
    res.json({ success: true, data: importResults });
  } catch (error) {
    console.error(`Error importing vulnerabilities from scan ${req.params.id}:`, error);
    res.status(500).json({ 
      success: false, 
      error: 'Error importing vulnerabilities',
      message: error.message
    });
  }
});

/**
 * @route   GET /api/rapid7/scan-history
 * @desc    Get scan history
 * @access  Private
 */
router.get('/scan-history', ensureAuthenticated, async (req, res) => {
  try {
    const { project_id } = req.query;
    let scanHistory;
    
    if (project_id) {
      scanHistory = await ScanHistory.getByProject(project_id);
    } else {
      // Get all scan history - note: you might want to add pagination here for production
      const query = 'SELECT * FROM threat_model.scan_history ORDER BY created_at DESC LIMIT 100';
      const result = await db.query(query);
      scanHistory = result.rows;
    }
    
    res.json({ success: true, data: scanHistory });
  } catch (error) {
    console.error('Error fetching scan history:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Error fetching scan history',
      message: error.message
    });
  }
});

/**
 * @route   GET /api/rapid7/scan-history/stats
 * @desc    Get scan statistics
 * @access  Private
 */
router.get('/scan-history/stats', ensureAuthenticated, async (req, res) => {
  try {
    const { project_id } = req.query;
    const stats = await ScanHistory.getStatistics(project_id || null);
    res.json({ success: true, data: stats });
  } catch (error) {
    console.error('Error fetching scan statistics:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Error fetching scan statistics',
      message: error.message
    });
  }
});

module.exports = router;
