/**
 * Vulnerability Sync Script
 * 
 * This script synchronizes vulnerability data from Rapid7 to our database.
 * It can be run on a schedule (e.g., via cron) to maintain up-to-date vulnerability information.
 */
require('dotenv').config();
const rapid7Service = require('../services/rapid7Service');
const Vulnerability = require('../database/models/vulnerability');
const ScanHistory = require('../database/models/scanHistory');
const Project = require('../database/models/project');
const db = require('../database');

// Determine environment
const env = process.env.NODE_ENV || 'development';
console.log(`Running vulnerability sync job in ${env} environment`);

async function syncVulnerabilities() {
  console.log('Starting vulnerability sync job...');
  let scanHistoryId = null;
  
  try {
    // Create a scan history record
    const scanHistory = await ScanHistory.create({
      source: 'rapid7',
      scan_type: 'Sync',
      status: 'Running',
      started_at: new Date()
    });
    
    scanHistoryId = scanHistory.id;
    console.log(`Created scan history record: ${scanHistoryId}`);
    
    // Fetch vulnerabilities from Rapid7
    console.log('Fetching vulnerabilities from Rapid7...');
    const vulnerabilities = await rapid7Service.getVulnerabilities({
      // Use larger page size for efficiency
      size: 200
    });
    
    console.log(`Found ${vulnerabilities.length} vulnerabilities`);
    
    // Import vulnerabilities to our database
    console.log('Importing vulnerabilities to database...');
    const importResults = await Vulnerability.importFromRapid7(vulnerabilities, scanHistoryId);
    
    console.log('Import results:', {
      created: importResults.created,
      updated: importResults.updated,
      errors: importResults.errors
    });
    
    // Update scan history with results
    await ScanHistory.update(scanHistoryId, {
      status: 'Completed',
      completed_at: new Date(),
      vulnerabilities_found: importResults.created + importResults.updated
    });
    
    // Attempt to link vulnerabilities to threats
    await linkVulnerabilitiesToThreats();
    
    return {
      success: true,
      importResults
    };
  } catch (error) {
    console.error('Error syncing vulnerabilities:', error);
    
    // Update scan history with error status
    if (scanHistoryId) {
      await ScanHistory.update(scanHistoryId, {
        status: 'Failed',
        completed_at: new Date()
      });
    }
    
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Attempt to automatically link vulnerabilities to relevant threats
 * based on keyword matching and category correlation
 */
async function linkVulnerabilitiesToThreats() {
  console.log('Starting automatic vulnerability-threat linking...');
  
  try {
    // Get vulnerabilities that aren't linked to threats yet
    const query = `
      SELECT v.* 
      FROM threat_model.vulnerabilities v
      LEFT JOIN threat_model.threat_vulnerabilities tv ON v.id = tv.vulnerability_id
      WHERE tv.vulnerability_id IS NULL
      AND v.status = 'Open'
    `;
    
    const result = await db.query(query);
    const unlinkedVulnerabilities = result.rows;
    
    console.log(`Found ${unlinkedVulnerabilities.length} unlinked vulnerabilities`);
    
    if (unlinkedVulnerabilities.length === 0) {
      return { linked: 0 };
    }
    
    // Get all active threats
    const threatsQuery = `
      SELECT t.* 
      FROM threat_model.threats t
      JOIN threat_model.threat_models tm ON t.threat_model_id = tm.id
      WHERE tm.status != 'Archived'
      AND t.status != 'Mitigated'
    `;
    
    const threatsResult = await db.query(threatsQuery);
    const threats = threatsResult.rows;
    
    console.log(`Found ${threats.length} active threats for matching`);
    
    // Setup keyword mappings for STRIDE categories
    const categoryKeywords = {
      'Spoofing': ['spoof', 'impersonat', 'identity', 'authenticat', 'credent', 'password', 'phish'],
      'Tampering': ['tamper', 'modif', 'alter', 'integrit', 'inject', 'xss', 'csrf'],
      'Repudiation': ['repudiat', 'deny', 'log', 'audit', 'trail', 'track'],
      'Information Disclosure': ['disclos', 'leak', 'exposure', 'reveal', 'sensitive', 'data', 'confidential', 'privacy'],
      'Denial of Service': ['dos', 'denial', 'service', 'availab', 'exhaust', 'resource', 'flood'],
      'Elevation of Privilege': ['elevat', 'privilege', 'permiss', 'access control', 'authoriz', 'admin', 'root']
    };
    
    let linkedCount = 0;
    
    // For each vulnerability, find matching threats
    for (const vuln of unlinkedVulnerabilities) {
      // Get the text content to match against
      const vulnText = `${vuln.name} ${vuln.description}`.toLowerCase();
      
      // Determine likely STRIDE categories for this vulnerability
      const vulnCategories = [];
      
      for (const [category, keywords] of Object.entries(categoryKeywords)) {
        const matchCount = keywords.filter(keyword => vulnText.includes(keyword.toLowerCase())).length;
        if (matchCount > 0) {
          vulnCategories.push({
            category,
            relevance: matchCount / keywords.length
          });
        }
      }
      
      // Sort by relevance
      vulnCategories.sort((a, b) => b.relevance - a.relevance);
      
      let bestMatchThreat = null;
      let bestMatchScore = 0;
      
      // Find the best matching threat
      for (const threat of threats) {
        const threatText = `${threat.name} ${threat.description}`.toLowerCase();
        let matchScore = 0;
        
        // Check for direct keyword matches
        const vulnWords = vulnText.split(/\s+/).filter(w => w.length > 4);
        const threatWords = threatText.split(/\s+/).filter(w => w.length > 4);
        
        // Count matching words
        for (const word of vulnWords) {
          if (threatWords.includes(word)) {
            matchScore += 1;
          }
        }
        
        // Boost score if the threat category matches a likely category for the vulnerability
        const topVulnCategories = vulnCategories.slice(0, 2).map(vc => vc.category);
        if (topVulnCategories.includes(threat.category)) {
          matchScore += 2;
        }
        
        // Consider this a match if the score is high enough
        if (matchScore > 3 && matchScore > bestMatchScore) {
          bestMatchScore = matchScore;
          bestMatchThreat = threat;
        }
      }
      
      // Link the vulnerability to the best matching threat if found
      if (bestMatchThreat) {
        // Calculate a confidence score (0-100)
        const confidence = Math.min(Math.round(bestMatchScore * 10), 90);
        
        await Vulnerability.linkToThreat(
          vuln.id,
          bestMatchThreat.id,
          confidence,
          `Auto-linked based on keyword matching (${confidence}% confidence)`
        );
        
        console.log(`Linked vulnerability "${vuln.name}" to threat "${bestMatchThreat.name}" with ${confidence}% confidence`);
        linkedCount++;
      }
    }
    
    console.log(`Automatically linked ${linkedCount} vulnerabilities to threats`);
    return { linked: linkedCount };
  } catch (error) {
    console.error('Error linking vulnerabilities to threats:', error);
    return { linked: 0, error: error.message };
  }
}

// Run the sync job
syncVulnerabilities()
  .then(result => {
    if (result.success) {
      console.log('✅ Vulnerability sync completed successfully');
      console.log(`Created: ${result.importResults.created}, Updated: ${result.importResults.updated}`);
    } else {
      console.error('❌ Vulnerability sync failed:', result.error);
      process.exit(1);
    }
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Unexpected error during vulnerability sync:', error);
    process.exit(1);
  });
