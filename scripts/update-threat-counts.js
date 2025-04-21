/**
 * Script to update threat counts for all Redis-based threat models
 * This script recalculates and persists the threat count for each model
 */
const redisUtil = require('../utils/redis');
const client = redisUtil.client;

async function updateThreatCounts() {
  try {
    console.log('Connecting to Redis...');
    await redisUtil.connect();
    console.log('Connected to Redis successfully!');
    
    // Get all subject IDs
    console.log('Fetching all subject IDs...');
    const subjectKeys = await client.keys('subject:*:title');
    const subjectIds = subjectKeys.map(key => key.split(':')[1]);
    
    console.log(`Found ${subjectIds.length} subjects. Processing...`);
    
    // Process each subject
    let updated = 0;
    let skipped = 0;
    let errors = 0;
    
    for (const subjectId of subjectIds) {
      try {
        // Get the response text
        const responseText = await client.get(`subject:${subjectId}:response`);
        if (!responseText) {
          console.log(`No response found for subject ${subjectId}, skipping...`);
          skipped++;
          continue;
        }
        
        // Calculate threat count
        let matches = [];
        
        // Pattern 1: Standard threat header format
        const threatPattern1 = /## Threat:([^#]+)/g;
        let match1;
        while ((match1 = threatPattern1.exec(responseText)) !== null) {
          matches.push(match1[1].trim());
        }
        
        // Pattern 2: Alternative format with just ## and a title
        if (matches.length === 0) {
          const threatPattern2 = /## ([^#\n]+)/g;
          let match2;
          while ((match2 = threatPattern2.exec(responseText)) !== null) {
            // Filter out non-threat headers like "Overview" or "Introduction"
            const title = match2[1].trim();
            if (!['Overview', 'Introduction', 'Summary', 'Conclusion', 'Background'].includes(title)) {
              matches.push(title);
            }
          }
        }
        
        const threatCount = matches.length;
        
        // Get the current cached count
        const currentCount = await client.get(`subject:${subjectId}:threatCount`);
        
        // Update the threat count
        await client.set(`subject:${subjectId}:threatCount`, threatCount.toString());
        
        const title = await client.get(`subject:${subjectId}:title`) || 'Unknown';
        console.log(`Updated subject ${subjectId} (${title}): ${currentCount || 'none'} -> ${threatCount} threats`);
        updated++;
      } catch (err) {
        console.error(`Error processing subject ${subjectId}:`, err);
        errors++;
      }
    }
    
    console.log('\nSummary:');
    console.log(`Total subjects: ${subjectIds.length}`);
    console.log(`Updated: ${updated}`);
    console.log(`Skipped: ${skipped}`);
    console.log(`Errors: ${errors}`);
    
    console.log('\nDone!');
  } catch (err) {
    console.error('Error updating threat counts:', err);
  } finally {
    // Close Redis connection
    await client.quit();
    process.exit(0);
  }
}

// Run the update function
updateThreatCounts();
