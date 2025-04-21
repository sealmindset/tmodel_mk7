/**
 * Mock Rapid7 API Server
 * 
 * This server simulates the Rapid7 API for local development and testing
 * of the TModel MK7 application's vulnerability management features.
 */

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3100;

// Middleware
app.use(cors());
app.use(express.json());

// Load mock data
const vulnerabilitiesPath = path.join(__dirname, 'data', 'vulnerabilities.json');
const assetsPath = path.join(__dirname, 'data', 'assets.json');
const sitesPath = path.join(__dirname, 'data', 'sites.json');
const scansPath = path.join(__dirname, 'data', 'scans.json');

// Create data directory if it doesn't exist
if (!fs.existsSync(path.join(__dirname, 'data'))) {
  fs.mkdirSync(path.join(__dirname, 'data'));
}

// Initialize data files if they don't exist
if (!fs.existsSync(vulnerabilitiesPath)) {
  fs.writeFileSync(vulnerabilitiesPath, JSON.stringify(require('./mock-data/vulnerabilities'), null, 2));
}

if (!fs.existsSync(assetsPath)) {
  fs.writeFileSync(assetsPath, JSON.stringify(require('./mock-data/assets'), null, 2));
}

if (!fs.existsSync(sitesPath)) {
  fs.writeFileSync(sitesPath, JSON.stringify(require('./mock-data/sites'), null, 2));
}

if (!fs.existsSync(scansPath)) {
  fs.writeFileSync(scansPath, JSON.stringify(require('./mock-data/scans'), null, 2));
}

// Helper function to read data from JSON files
const readData = (filePath) => {
  try {
    const data = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error(`Error reading ${filePath}:`, error);
    return [];
  }
};

// Helper function to write data to JSON files
const writeData = (filePath, data) => {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    return true;
  } catch (error) {
    console.error(`Error writing to ${filePath}:`, error);
    return false;
  }
};

// Authentication middleware
const authenticate = (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  
  if (!apiKey || apiKey !== 'mock-api-key') {
    return res.status(401).json({ error: 'Unauthorized: Invalid API key' });
  }
  
  next();
};

// Routes

// GET /api/v1/vulnerabilities - Get all vulnerabilities
app.get('/api/v1/vulnerabilities', authenticate, (req, res) => {
  const vulnerabilities = readData(vulnerabilitiesPath);
  
  // Handle pagination
  const page = parseInt(req.query.page) || 1;
  const size = parseInt(req.query.size) || 50;
  const start = (page - 1) * size;
  const end = start + size;
  
  // Handle sorting
  const sort = req.query.sort || 'severity';
  const order = req.query.order || 'desc';
  
  // Sort vulnerabilities
  const sortedVulnerabilities = [...vulnerabilities].sort((a, b) => {
    if (order === 'asc') {
      return a[sort] > b[sort] ? 1 : -1;
    } else {
      return a[sort] < b[sort] ? 1 : -1;
    }
  });
  
  // Paginate vulnerabilities
  const paginatedVulnerabilities = sortedVulnerabilities.slice(start, end);
  
  res.json({
    data: paginatedVulnerabilities,
    metadata: {
      total: vulnerabilities.length,
      page,
      size,
      pages: Math.ceil(vulnerabilities.length / size)
    }
  });
});

// GET /api/v1/vulnerabilities/:id - Get vulnerability by ID
app.get('/api/v1/vulnerabilities/:id', authenticate, (req, res) => {
  const vulnerabilities = readData(vulnerabilitiesPath);
  const vulnerability = vulnerabilities.find(v => v.id === req.params.id);
  
  if (!vulnerability) {
    return res.status(404).json({ error: 'Vulnerability not found' });
  }
  
  res.json({ data: vulnerability });
});

// GET /api/v1/assets - Get all assets
app.get('/api/v1/assets', authenticate, (req, res) => {
  const assets = readData(assetsPath);
  
  // Handle pagination
  const page = parseInt(req.query.page) || 1;
  const size = parseInt(req.query.size) || 50;
  const start = (page - 1) * size;
  const end = start + size;
  
  // Paginate assets
  const paginatedAssets = assets.slice(start, end);
  
  res.json({
    data: paginatedAssets,
    metadata: {
      total: assets.length,
      page,
      size,
      pages: Math.ceil(assets.length / size)
    }
  });
});

// GET /api/v1/assets/:id - Get asset by ID
app.get('/api/v1/assets/:id', authenticate, (req, res) => {
  const assets = readData(assetsPath);
  const asset = assets.find(a => a.id === req.params.id);
  
  if (!asset) {
    return res.status(404).json({ error: 'Asset not found' });
  }
  
  res.json({ data: asset });
});

// GET /api/v1/sites - Get all sites
app.get('/api/v1/sites', authenticate, (req, res) => {
  const sites = readData(sitesPath);
  res.json({ data: sites });
});

// GET /api/v1/sites/:id - Get site by ID
app.get('/api/v1/sites/:id', authenticate, (req, res) => {
  const sites = readData(sitesPath);
  const site = sites.find(s => s.id === req.params.id);
  
  if (!site) {
    return res.status(404).json({ error: 'Site not found' });
  }
  
  res.json({ data: site });
});

// POST /api/v1/scans - Start a new scan
app.post('/api/v1/scans', authenticate, (req, res) => {
  const { site_id, scan_type } = req.body;
  
  if (!site_id) {
    return res.status(400).json({ error: 'site_id is required' });
  }
  
  const sites = readData(sitesPath);
  const site = sites.find(s => s.id === site_id);
  
  if (!site) {
    return res.status(404).json({ error: 'Site not found' });
  }
  
  const scans = readData(scansPath);
  
  // Create new scan
  const newScan = {
    id: `scan-${Date.now()}`,
    site_id,
    scan_type: scan_type || 'vulnerability',
    status: 'running',
    start_time: new Date().toISOString(),
    end_time: null
  };
  
  scans.push(newScan);
  writeData(scansPath, scans);
  
  // Simulate scan completion after 10 seconds
  setTimeout(() => {
    const scans = readData(scansPath);
    const scanIndex = scans.findIndex(s => s.id === newScan.id);
    
    if (scanIndex !== -1) {
      scans[scanIndex].status = 'completed';
      scans[scanIndex].end_time = new Date().toISOString();
      writeData(scansPath, scans);
      console.log(`Scan ${newScan.id} completed`);
    }
  }, 10000);
  
  res.status(201).json({ data: newScan });
});

// GET /api/v1/scans - Get all scans
app.get('/api/v1/scans', authenticate, (req, res) => {
  const scans = readData(scansPath);
  res.json({ data: scans });
});

// GET /api/v1/scans/:id - Get scan by ID
app.get('/api/v1/scans/:id', authenticate, (req, res) => {
  const scans = readData(scansPath);
  const scan = scans.find(s => s.id === req.params.id);
  
  if (!scan) {
    return res.status(404).json({ error: 'Scan not found' });
  }
  
  res.json({ data: scan });
});

// Start server
app.listen(PORT, () => {
  console.log(`Mock Rapid7 API server running on port ${PORT}`);
  console.log(`API Key: mock-api-key`);
});
