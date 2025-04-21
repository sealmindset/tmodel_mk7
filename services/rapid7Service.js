/**
 * Rapid7 Integration Service
 * 
 * This service handles communication with the Rapid7 InsightVM API
 * to fetch vulnerabilities and scan information.
 */
const axios = require('axios');
const db = require('../db/db');
const redis = require('../utils/redis').client;

// Helper functions for storing scan data and vulnerabilities
async function saveVulnerability(vulnData) {
  try {
    const query = `
      INSERT INTO threat_model.vulnerabilities 
        (external_id, title, description, severity, cvss_score, 
         status, remediation, asset_id, asset_name, first_found, last_found)
      VALUES 
        ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      ON CONFLICT (external_id) 
      DO UPDATE SET 
        title = $2, 
        description = $3, 
        severity = $4, 
        cvss_score = $5, 
        status = $6, 
        remediation = $7,
        asset_id = $8,
        asset_name = $9,
        last_found = $11,
        updated_at = CURRENT_TIMESTAMP
      RETURNING id`;

    const result = await db.query(query, [
      vulnData.id, // external_id
      vulnData.title, 
      vulnData.description || '',
      vulnData.severity,
      vulnData.cvss_score, 
      'Open',  // default status
      vulnData.remediation || '',
      vulnData.asset_id,
      vulnData.asset_name || '',
      new Date(), // first_found 
      new Date()  // last_found
    ]);

    return result.rows[0].id;
  } catch (error) {
    console.error(`Error saving vulnerability ${vulnData.id}:`, error);
    throw error;
  }
}

async function updateScanHistory(scanId, status, vulnCount = 0) {
  try {
    const query = `
      UPDATE threat_model.scan_history 
      SET status = $1, 
          total_vulnerabilities = $2,
          end_time = $3,
          updated_at = CURRENT_TIMESTAMP
      WHERE scan_id = $4
      RETURNING id`;

    const result = await db.query(query, [
      status,
      vulnCount,
      status === 'Completed' ? new Date() : null,
      scanId
    ]);

    return result.rows[0];
  } catch (error) {
    console.error(`Error updating scan history for ${scanId}:`, error);
    throw error;
  }
}

class Rapid7Service {
  constructor() {
    this.refreshClient();
  }

  /**
   * Refresh the API client with latest settings from Redis
   */
  async refreshClient() {
    try {
      // Get API URL and Key from Redis (fallback to env vars)
      const [apiUrl, apiKey] = await Promise.all([
        redis.get('settings:rapid7:api_url'),
        redis.get('settings:rapid7:api_key')
      ]);
      
      this.baseUrl = apiUrl || process.env.RAPID7_API_URL || 'http://localhost:3100';
      this.apiKey = apiKey || process.env.RAPID7_API_KEY || 'test-api-key';
      
      this.client = axios.create({
        baseURL: this.baseUrl,
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': this.apiKey
        },
        timeout: 15000 // 15 second timeout
      });
      
      console.log(`Rapid7 client configured with API URL: ${this.baseUrl}`);
    } catch (error) {
      console.error('Error refreshing Rapid7 client:', error);
      // Create default client anyway
      this.baseUrl = process.env.RAPID7_API_URL || 'http://localhost:3100';
      this.apiKey = process.env.RAPID7_API_KEY || 'test-api-key';
      this.client = axios.create({
        baseURL: this.baseUrl,
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': this.apiKey
        }
      });
    }
  }
  
  /**
   * Get all vulnerabilities from Rapid7
   * 
   * @param {Object} options - Query options
   * @returns {Promise<Array>} - Array of vulnerabilities
   */
  async getVulnerabilities(options = {}) {
    try {
      const { page = 0, size = 100, sort = 'severity,desc' } = options;
      const response = await this.client.get('/vulnerabilities', {
        params: {
          page,
          size,
          sort
        }
      });
      
      return response.data.resources;
    } catch (error) {
      console.error('Error fetching vulnerabilities from Rapid7:', error.message);
      throw new Error(`Failed to fetch vulnerabilities: ${error.message}`);
    }
  }
  
  /**
   * Get vulnerability details by ID
   * 
   * @param {string} vulnerabilityId - Vulnerability ID
   * @returns {Promise<Object>} - Vulnerability details
   */
  async getVulnerabilityById(vulnerabilityId) {
    try {
      const response = await this.client.get(`/vulnerabilities/${vulnerabilityId}`);
      return response.data;
    } catch (error) {
      console.error(`Error fetching vulnerability ${vulnerabilityId} from Rapid7:`, error.message);
      throw new Error(`Failed to fetch vulnerability details: ${error.message}`);
    }
  }
  
  /**
   * Get vulnerabilities for a specific asset
   * 
   * @param {string} assetId - Asset ID in Rapid7
   * @returns {Promise<Array>} - Array of vulnerabilities
   */
  async getVulnerabilitiesForAsset(assetId) {
    try {
      const response = await this.client.get(`/assets/${assetId}/vulnerabilities`);
      return response.data.resources;
    } catch (error) {
      console.error(`Error fetching vulnerabilities for asset ${assetId}:`, error.message);
      throw new Error(`Failed to fetch asset vulnerabilities: ${error.message}`);
    }
  }
  
  /**
   * Get solutions for a vulnerability
   * 
   * @param {string} vulnerabilityId - Vulnerability ID
   * @returns {Promise<Array>} - Array of solutions
   */
  async getSolutions(vulnerabilityId) {
    try {
      const response = await this.client.get(`/vulnerabilities/${vulnerabilityId}/solutions`);
      return response.data.resources;
    } catch (error) {
      console.error(`Error fetching solutions for vulnerability ${vulnerabilityId}:`, error.message);
      throw new Error(`Failed to fetch vulnerability solutions: ${error.message}`);
    }
  }
  
  /**
   * Get all assets from Rapid7
   * 
   * @param {Object} options - Query options
   * @returns {Promise<Array>} - Array of assets
   */
  async getAssets(options = {}) {
    try {
      const { page = 0, size = 100, sort = 'id,asc' } = options;
      const response = await this.client.get('/assets', {
        params: {
          page,
          size,
          sort
        }
      });
      
      return response.data.resources;
    } catch (error) {
      console.error('Error fetching assets from Rapid7:', error.message);
      throw new Error(`Failed to fetch assets: ${error.message}`);
    }
  }
  
  /**
   * Get asset details by ID
   * 
   * @param {string} assetId - Asset ID
   * @returns {Promise<Object>} - Asset details
   */
  async getAssetById(assetId) {
    try {
      const response = await this.client.get(`/assets/${assetId}`);
      return response.data;
    } catch (error) {
      console.error(`Error fetching asset ${assetId} from Rapid7:`, error.message);
      throw new Error(`Failed to fetch asset details: ${error.message}`);
    }
  }
  
  /**
   * Start a scan on a site
   * 
   * @param {string} siteId - Site ID in Rapid7
   * @param {string} projectId - Our internal project ID
   * @returns {Promise<Object>} - Scan information
   */
  async startScan(siteId, projectId) {
    try {
      // Create scan history record first
      const scanHistory = await ScanHistory.create({
        source: 'rapid7',
        project_id: projectId,
        scan_type: 'Full',
        status: 'Scheduled'
      });
      
      // Start the scan in Rapid7
      const response = await this.client.post(`/sites/${siteId}/scans`, {
        name: `Project Scan ${new Date().toISOString()}`,
        engineId: 1  // Using default engine, adjust as needed
      });
      
      // Update scan history with Rapid7 scan ID
      await ScanHistory.update(scanHistory.id, {
        scan_id: response.data.id,
        status: 'Running',
        started_at: new Date()
      });
      
      return {
        scanHistoryId: scanHistory.id,
        rapid7ScanId: response.data.id,
        status: 'started'
      };
    } catch (error) {
      console.error(`Error starting scan for site ${siteId}:`, error.message);
      throw new Error(`Failed to start scan: ${error.message}`);
    }
  }
  
  /**
   * Get scan status
   * 
   * @param {string} scanId - Scan ID in Rapid7
   * @returns {Promise<Object>} - Scan status
   */
  async getScanStatus(scanId) {
    try {
      const response = await this.client.get(`/scans/${scanId}`);
      return response.data;
    } catch (error) {
      console.error(`Error fetching scan status for ${scanId}:`, error.message);
      throw new Error(`Failed to fetch scan status: ${error.message}`);
    }
  }
  
  /**
   * Import vulnerabilities from a completed scan
   * 
   * @param {string} scanId - Scan ID in Rapid7
   * @param {string} scanHistoryId - Our internal scan history ID
   * @returns {Promise<Object>} - Import results
   */
  async importVulnerabilitiesFromScan(scanId, scanHistoryId) {
    try {
      // Ensure client is using latest API settings
      await this.refreshClient();
      
      // Get scan results
      const scan = await this.getScanStatus(scanId);
      
      if (scan.status !== 'finished') {
        throw new Error(`Scan ${scanId} is not finished yet`);
      }
      
      // Get vulnerabilities for each asset in the scan
      const vulnerabilities = [];
      
      for (const assetId of scan.assets) {
        const assetVulns = await this.getVulnerabilitiesForAsset(assetId);
        
        // For each vulnerability, get full details
        for (const vulnRef of assetVulns) {
          const vulnDetails = await this.getVulnerabilityById(vulnRef.id);
          
          // Get solutions
          const solutions = await this.getSolutions(vulnRef.id);
          const remediation = solutions && solutions.length > 0 ? solutions[0].summary : null;
          
          // Get asset details
          const asset = await this.getAssetById(assetId);
          
          // Add to list for database insertion
          vulnerabilities.push({
            id: vulnDetails.id,
            title: vulnDetails.title,
            description: vulnDetails.description,
            severity: vulnDetails.severity,
            cvss_score: vulnDetails.cvss,
            remediation: remediation,
            asset_id: assetId,
            asset_name: asset.hostName || asset.id,
          });
        }
      }
      
      // Import vulnerabilities into our database
      const savedVulns = [];
      for (const vuln of vulnerabilities) {
        const vulnId = await saveVulnerability(vuln);
        savedVulns.push(vulnId);
      }
      
      // Update scan history record
      await updateScanHistory(scanId, 'Completed', vulnerabilities.length);
      
      // Update the last sync time in Redis
      await redis.set('rapid7:last_sync', new Date().toISOString());
      
      return {
        scanId,
        importResults: {
          total: vulnerabilities.length,
          saved: savedVulns.length,
          vulnerabilityIds: savedVulns
        }
      };
    } catch (error) {
      console.error(`Error importing vulnerabilities from scan ${scanId}:`, error.message);
      throw new Error(`Failed to import vulnerabilities: ${error.message}`);
    }
  }
  
  /**
   * Get top vulnerabilities by CVSS score
   * 
   * @param {number} limit - Number of vulnerabilities to return
   * @returns {Promise<Array>} - Array of vulnerabilities
   */
  /**
   * Sync vulnerabilities from Rapid7 to local database
   * This is the main method to call for syncing all data
   */
  async syncVulnerabilities() {
    try {
      // Ensure client is using latest API settings
      await this.refreshClient();
      
      // Get all vulnerabilities
      const vulns = await this.getVulnerabilities({ size: 100 });
      
      // Get all assets to associate with vulnerabilities
      const assets = await this.getAssets({ size: 100 });
      const assetMap = {};
      assets.forEach(asset => {
        assetMap[asset.id] = asset;
      });
      
      // Format and save each vulnerability
      const savedVulns = [];
      for (const vuln of vulns) {
        // Get additional details
        const vulnDetails = await this.getVulnerabilityById(vuln.id);
        const solutions = await this.getSolutions(vuln.id);
        const remediation = solutions && solutions.length > 0 ? solutions[0].summary : null;
        
        // Find associated asset if available
        const assetId = vuln.assets && vuln.assets.length > 0 ? vuln.assets[0] : null;
        const asset = assetId ? assetMap[assetId] : null;
        
        // Save to database
        const vulnData = {
          id: vuln.id,
          title: vuln.title,
          description: vulnDetails.description || vuln.title,
          severity: vuln.severity,
          cvss_score: vuln.cvss || 0,
          remediation: remediation,
          asset_id: assetId,
          asset_name: asset ? (asset.hostName || asset.id) : 'Unknown',
        };
        
        const vulnId = await saveVulnerability(vulnData);
        savedVulns.push(vulnId);
      }
      
      // Create scan history record for this sync
      const scanId = `sync-${Date.now()}`;
      const query = `
        INSERT INTO threat_model.scan_history 
          (scan_id, status, start_time, end_time, total_vulnerabilities)
        VALUES 
          ($1, $2, $3, $4, $5)
        RETURNING id`;
        
      const result = await db.query(query, [
        scanId,
        'Completed',
        new Date(),
        new Date(),
        savedVulns.length
      ]);
      
      // Update the last sync time in Redis
      await redis.set('rapid7:last_sync', new Date().toISOString());
      
      return {
        syncId: result.rows[0].id,
        total: vulns.length,
        saved: savedVulns.length
      };
    } catch (error) {
      console.error('Error syncing vulnerabilities:', error);
      throw new Error(`Failed to sync vulnerabilities: ${error.message}`);
    }
  }
  
  async getTopVulnerabilities(limit = 10) {
    try {
      // Query directly from our database
      const query = `
        SELECT id, external_id, title, severity, cvss_score, status, 
               asset_name, created_at
        FROM threat_model.vulnerabilities
        ORDER BY cvss_score DESC NULLS LAST
        LIMIT $1`;
      
      const result = await db.query(query, [limit]);
      return result.rows;
    } catch (error) {
      console.error('Error fetching top vulnerabilities:', error.message);
      throw new Error(`Failed to fetch top vulnerabilities: ${error.message}`);
    }
  }
  
  /**
   * Map Rapid7 assets to our internal components
   * 
   * @param {Array} assets - Array of Rapid7 assets
   * @param {Function} componentMatcher - Function to match assets to components
   * @returns {Promise<Object>} - Mapping results
   */
  /**
   * Check API connectivity to Rapid7
   * @returns {Promise<boolean>} - True if connection successful
   */
  async checkConnection() {
    try {
      // Ensure client is using latest API settings
      await this.refreshClient();
      
      // Make a simple API call to check connectivity
      await this.client.get('/assets?size=1');
      return true;
    } catch (error) {
      console.error('Rapid7 connectivity check failed:', error.message);
      return false;
    }
  }
  
  async mapAssetsToComponents(assets, componentMatcher) {
    const results = {
      mapped: 0,
      unmapped: 0,
      mappings: []
    };
    
    for (const asset of assets) {
      // Use the provided matcher function to find a matching component
      const component = await componentMatcher(asset);
      
      if (component) {
        results.mapped++;
        results.mappings.push({
          asset_id: asset.id,
          asset_hostname: asset.hostName,
          component_id: component.id,
          component_name: component.name
        });
      } else {
        results.unmapped++;
      }
    }
    
    return results;
  }
}

module.exports = new Rapid7Service();
