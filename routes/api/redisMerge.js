/**
 * Redis Threat Model Merge API Routes
 * 
 * Provides endpoints for merging Redis-based threat models
 */
const express = require('express');
const router = express.Router();
const { ensureAuthenticated } = require('../../middleware/auth');
const redisClient = require('../../utils/redis').client;

/**
 * @route POST /api/redis-merge
 * @desc Merge multiple Redis threat models into one
 * @access Private
 */
router.post('/redis-merge', ensureAuthenticated, async (req, res) => {
  try {
    const { primaryModelId, sourceModelIds } = req.body;
    
    if (!primaryModelId || !sourceModelIds || !Array.isArray(sourceModelIds) || sourceModelIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Primary model ID and at least one source model ID are required'
      });
    }
    
    // Get username from session
    const mergedBy = req.session.username || 'system';
    
    console.log('Starting Redis merge operation:', { primaryModelId, sourceModelIds, mergedBy });
    
    // Track metrics for the merge operation
    const mergeMetrics = {
      total_threats_added: 0,
      total_threats_skipped: 0,
      models_processed: 0,
      model_details: []
    };
    
    // Extract Redis IDs (remove 'subj-' prefix if present)
    const primaryRedisId = primaryModelId.startsWith('subj-') 
      ? primaryModelId.substring(5) 
      : primaryModelId;
    
    const sourceRedisIds = sourceModelIds.map(id => 
      id.startsWith('subj-') ? id.substring(5) : id
    );
    
    // Verify primary model exists
    const primaryTitle = await redisClient.get(`subject:${primaryRedisId}:title`);
    const primaryResponse = await redisClient.get(`subject:${primaryRedisId}:response`);
    
    if (!primaryTitle || !primaryResponse) {
      return res.status(404).json({
        success: false,
        error: `Primary Redis model with ID ${primaryRedisId} not found`
      });
    }
    
    // Get current threat count
    let primaryThreatCount = parseInt(await redisClient.get(`subject:${primaryRedisId}:threatCount`) || '0', 10);
    
    // Process each source model
    for (const sourceId of sourceRedisIds) {
      // Skip if source is the same as primary
      if (sourceId === primaryRedisId) continue;
      
      const sourceTitle = await redisClient.get(`subject:${sourceId}:title`);
      const sourceResponse = await redisClient.get(`subject:${sourceId}:response`);
      
      if (!sourceTitle || !sourceResponse) {
        console.log(`Source Redis model ${sourceId} not found, skipping`);
        continue;
      }
      
      // Get source threat count
      const sourceThreatCount = parseInt(await redisClient.get(`subject:${sourceId}:threatCount`) || '0', 10);
      
      // Add model to metrics
      mergeMetrics.model_details.push({
        id: `subj-${sourceId}`,
        name: sourceTitle,
        type: 'redis',
        total_threats: sourceThreatCount,
        threats_added: sourceThreatCount > 0 ? 1 : 0, // Simplified - assume we add at least one threat if any exist
        threats_skipped: 0
      });
      
      // Add a merge note to the primary model
      const mergeNote = `\n\n## Merged from model: ${sourceTitle} (ID: ${sourceId})\n`;
      
      // Append source content to primary model
      const updatedResponse = primaryResponse + mergeNote + sourceResponse;
      await redisClient.set(`subject:${primaryRedisId}:response`, updatedResponse);
      
      // Increment threat count (simplified - just add 1 for now)
      primaryThreatCount += 1;
      mergeMetrics.total_threats_added += 1;
      mergeMetrics.models_processed += 1;
    }
    
    // Update the threat count
    await redisClient.set(`subject:${primaryRedisId}:threatCount`, primaryThreatCount.toString());
    
    // Store merge metadata
    const mergeMetadata = {
      merged_at: new Date().toISOString(),
      merged_by: mergedBy,
      source_models: sourceModelIds,
      metrics: mergeMetrics
    };
    
    await redisClient.set(`subject:${primaryRedisId}:mergeMetadata`, JSON.stringify(mergeMetadata));
    
    // Prepare response data
    const primaryModel = {
      id: primaryRedisId,
      title: primaryTitle,
      threatCount: primaryThreatCount,
      is_redis_model: true
    };
    
    // Return success response
    res.json({
      success: true,
      message: 'Redis threat models merged successfully',
      data: {
        model: primaryModel,
        metrics: mergeMetrics
      }
    });
  } catch (error) {
    console.error('Error merging Redis threat models:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Error merging Redis threat models'
    });
  }
});

module.exports = router;
