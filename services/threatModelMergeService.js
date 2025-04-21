/**
 * Threat Model Merge Service
 * 
 * Provides functionality to merge multiple threat models into one
 */
const db = require('../database');
const pool = require('../database').pool;
const redisClient = require('../utils/redis').client;
const ThreatModel = require('../database/models/threatModel');

/**
 * Merge multiple threat models into a primary model
 * 
 * @param {string} primaryModelId - ID of the primary model to merge into
 * @param {Array<string>} sourceModelIds - IDs of the models to merge from
 * @param {string} mergedBy - Username of the person performing the merge
 * @returns {Promise<Object>} - Updated primary model with merged threats
 */
async function mergeThreatModels(primaryModelId, sourceModelIds, mergedBy) {
  if (!primaryModelId || !sourceModelIds || !Array.isArray(sourceModelIds) || sourceModelIds.length === 0) {
    throw new Error('Primary model ID and at least one source model ID are required');
  }

  // Filter out the primary model from source models if it's included
  sourceModelIds = sourceModelIds.filter(id => id !== primaryModelId);
  
  if (sourceModelIds.length === 0) {
    throw new Error('At least one source model different from the primary model is required');
  }

  const dbClient = await pool.connect();
  
  try {
    await dbClient.query('BEGIN');
    
    // Check if primary model exists - handle both PostgreSQL and Redis models
    let primaryModel;
    let isPrimaryRedisModel = false;
    
    // Check if this is a Redis model (prefixed with 'subj-')
    if (typeof primaryModelId === 'string' && primaryModelId.startsWith('subj-')) {
      const redisSubjectId = primaryModelId.substring(5);
      isPrimaryRedisModel = true;
      
      // Get Redis model details
      const title = await redisClient.get(`subject:${redisSubjectId}:title`);
      const responseText = await redisClient.get(`subject:${redisSubjectId}:response`);
      
      if (!title || !responseText) {
        throw new Error(`Primary Redis threat model with ID ${redisSubjectId} not found`);
      }
      
      // For Redis models, we don't need to query the PostgreSQL database
      primaryModel = {
        id: redisSubjectId,
        name: title,
        is_redis_model: true
      };
    }
      
      primaryModel = {
        id: redisSubjectId,
        name: title,
    } else {
      // Get PostgreSQL model details
      const primaryModelQuery = `
        SELECT * FROM threat_model.threat_models WHERE id = $1
      `;
      
      try {
        const primaryModelResult = await dbClient.query(primaryModelQuery, [primaryModelId]);
        
        if (primaryModelResult.rows.length === 0) {
          throw new Error(`Primary threat model with ID ${primaryModelId} not found`);
        }
        
        primaryModel = primaryModelResult.rows[0];
      } catch (error) {
        // If there's an error with the UUID format, provide a clearer message
        if (error.code === '22P02') { // invalid input syntax for type uuid
          throw new Error(`Invalid PostgreSQL model ID format: ${primaryModelId}. If this is a Redis model, use the 'subj-' prefix.`);
        }
        throw error;
      }
    }
    
    console.log(`Using ${isPrimaryRedisModel ? 'Redis' : 'PostgreSQL'} model as primary: ${primaryModel.name} (ID: ${primaryModel.id})`);
    
    // Primary model is now set from the code above
    
    // Separate PostgreSQL and Redis models
    const pgModelIds = [];
    const redisModelIds = [];
    
    for (const modelId of sourceModelIds) {
      // Handle prefixed subject IDs (subj-123) from the frontend
      let processedId = modelId;
      if (typeof modelId === 'string' && modelId.startsWith('subj-')) {
        processedId = modelId.substring(5);
        redisModelIds.push(processedId);
      } else if (typeof processedId === 'string' && processedId.match(/^[0-9]+$/)) {
        // Redis IDs are numeric strings
        redisModelIds.push(processedId);
      } else {
        // PostgreSQL IDs are UUIDs
        pgModelIds.push(modelId);
      }
    }
    
    // Get existing threats in the primary model
    let existingThreats = [];
    
    if (isPrimaryRedisModel) {
      // For Redis models, we need to extract threats from the response text
      const redisSubjectId = primaryModelId.substring(5);
      const responseText = await redisClient.get(`subject:${redisSubjectId}:response`);
      
      if (responseText) {
        // Extract threats from the response text
        const extractedThreats = extractThreatsFromResponse(responseText);
        
        // Convert to a format similar to PostgreSQL threats
        existingThreats = extractedThreats.map(threat => ({
          id: `redis-${redisSubjectId}-${Math.random().toString(36).substring(2, 10)}`,
          title: threat.threat,
          description: threat.description,
          threat_model_id: primaryModelId,
          is_redis_threat: true
        }));
        
        console.log(`Extracted ${existingThreats.length} existing threats from Redis model ${redisSubjectId}`);
      }
    } else {
      // For PostgreSQL models, get threats from the database
      const existingThreatsQuery = `
        SELECT * FROM threat_model.threats WHERE threat_model_id = $1
      `;
      const existingThreatsResult = await dbClient.query(existingThreatsQuery, [primaryModelId]);
      existingThreats = existingThreatsResult.rows;
    }
    
    // Track metrics for the merge operation
    const mergeMetrics = {
      total_threats_added: 0,
      total_threats_skipped: 0, // Count of duplicate threats that were skipped
      total_safeguards_added: 0,
      source_models_processed: 0,
      redis_models_processed: 0,
      model_details: [] // Details for each processed model
    };
    
    // Process PostgreSQL models
    if (pgModelIds.length > 0) {
      // Get threats from source models
      const sourceThreatsQuery = `
        SELECT t.*, tm.name as model_name 
        FROM threat_model.threats t
        JOIN threat_model.threat_models tm ON t.threat_model_id = tm.id
        WHERE t.threat_model_id = ANY($1::uuid[])
      `;
      const sourceThreatsResult = await dbClient.query(sourceThreatsQuery, [pgModelIds]);
      const sourceThreats = sourceThreatsResult.rows;
      
      // Merge threats into primary model
      for (const threat of sourceThreats) {
        // Check if a similar threat already exists in the primary model
        const similarThreat = existingThreats.find(t => 
          t.title.toLowerCase() === threat.title.toLowerCase() ||
          t.description.toLowerCase().includes(threat.description.toLowerCase()) ||
          threat.description.toLowerCase().includes(t.description.toLowerCase())
        );
        
        if (!similarThreat) {
          // Add this threat to the primary model
          const insertThreatQuery = `
            INSERT INTO threat_model.threats (
              threat_model_id, title, description, impact, likelihood, 
              risk_score, mitigation, source_model_id, source_model_name
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING id
          `;
          
          const threatValues = [
            primaryModelId,
            threat.title,
            threat.description,
            threat.impact,
            threat.likelihood,
            threat.risk_score,
            threat.mitigation,
            threat.threat_model_id,
            threat.model_name
          ];
          
          const newThreatResult = await dbClient.query(insertThreatQuery, threatValues);
          const newThreatId = newThreatResult.rows[0].id;
          
          // Get safeguards for this threat
          const safeguardsQuery = `
            SELECT s.* FROM threat_model.safeguards s
            JOIN threat_model.threat_safeguards ts ON s.id = ts.safeguard_id
            WHERE ts.threat_id = $1
          `;
          const safeguardsResult = await dbClient.query(safeguardsQuery, [threat.id]);
          const safeguards = safeguardsResult.rows;
          
          // Add safeguards to the new threat
          for (const safeguard of safeguards) {
            // Check if safeguard already exists
            const existingSafeguardQuery = `
              SELECT id FROM threat_model.safeguards 
              WHERE title = $1 AND threat_model_id = $2
            `;
            const existingSafeguardResult = await dbClient.query(existingSafeguardQuery, [
              safeguard.title, primaryModelId
            ]);
            
            let safeguardId;
            
            if (existingSafeguardResult.rows.length > 0) {
              // Use existing safeguard
              safeguardId = existingSafeguardResult.rows[0].id;
            } else {
              // Create new safeguard
              const insertSafeguardQuery = `
                INSERT INTO threat_model.safeguards (
                  threat_model_id, title, description, type, status
                )
                VALUES ($1, $2, $3, $4, $5)
                RETURNING id
              `;
              
              const safeguardValues = [
                primaryModelId,
                safeguard.title,
                safeguard.description,
                safeguard.type,
                safeguard.status
              ];
              
              const newSafeguardResult = await dbClient.query(insertSafeguardQuery, safeguardValues);
              safeguardId = newSafeguardResult.rows[0].id;
              mergeMetrics.total_safeguards_added++;
            }
            
            // Link safeguard to threat
            const linkSafeguardQuery = `
              INSERT INTO threat_model.threat_safeguards (
                threat_id, safeguard_id, effectiveness
              )
              VALUES ($1, $2, $3)
            `;
            
            await dbClient.query(linkSafeguardQuery, [
              newThreatId, 
              safeguardId, 
              safeguard.effectiveness || 50
            ]);
          }
          
          mergeMetrics.total_threats_added++;
        } else {
          mergeMetrics.total_threats_skipped++;
        }
      }
      
      mergeMetrics.source_models_processed = pgModelIds.length;
      
      // Add model details for each processed PostgreSQL model
      for (const modelId of pgModelIds) {
        const modelDetailsQuery = `
          SELECT id, name, threat_count::integer as threat_count
          FROM threat_model.threat_models 
          WHERE id = $1
        `;
        const modelDetailsResult = await dbClient.query(modelDetailsQuery, [modelId]);
        
        if (modelDetailsResult.rows.length > 0) {
          const modelDetails = modelDetailsResult.rows[0];
          mergeMetrics.model_details.push({
            id: modelDetails.id,
            name: modelDetails.name,
            type: 'postgresql',
            total_threats: modelDetails.threat_count || 0,
            threats_added: 0,
            threats_skipped: 0
          });
        }
      }
    }
    
    // Process Redis models
    if (redisModelIds.length > 0) {
      for (const subjectId of redisModelIds) {
        // Get subject details
        const title = await redisClient.get(`subject:${subjectId}:title`);
        if (!title) {
          console.log(`No title found for Redis model ${subjectId}`);
          continue;
        }
        
        // Add this Redis model to the metrics
        const threatCount = await redisClient.get(`subject:${subjectId}:threatCount`) || '0';
        mergeMetrics.model_details.push({
          id: `subj-${subjectId}`,
          name: title,
          type: 'redis',
          total_threats: parseInt(threatCount, 10) || 0,
          threats_added: 0,
          threats_skipped: 0
        });
        
        console.log(`Processing Redis model ${subjectId}: ${title}`);
        
        // Get response text
        const responseText = await redisClient.get(`subject:${subjectId}:response`);
        if (!responseText) {
          console.log(`No response text found for Redis model ${subjectId}`);
          continue;
        }
        
        console.log(`Response text length: ${responseText.length} characters`);
        
        // Extract threats from response text
        const threats = extractThreatsFromResponse(responseText);
        console.log(`Extracted ${threats.length} threats from Redis model ${subjectId}`);
        
        // If no threats were extracted, try to get the threat count from Redis
        if (threats.length === 0) {
          const cachedThreatCount = await redisClient.get(`subject:${subjectId}:threatCount`);
          if (cachedThreatCount && parseInt(cachedThreatCount, 10) > 0) {
            console.log(`Warning: Found ${cachedThreatCount} threats in Redis count, but couldn't extract them from the response text`);
          }
        }
        
        // Add a note to the primary model about the merge
        const mergeNote = `\n\n## Merged from Redis model: ${title} (ID: ${subjectId})\n`;
        
        // Update the description of the primary model to include the merge note
        if (!isPrimaryRedisModel) {
          // Only update PostgreSQL models in the database
          const updateDescriptionQuery = `
            UPDATE threat_model.threat_models
            SET description = CASE 
              WHEN description IS NULL THEN $2
              ELSE description || $2
            END
            WHERE id = $1
          `;
          
          await dbClient.query(updateDescriptionQuery, [primaryModelId, mergeNote]);
        } else {
          // For Redis models, we need to append to the response text
          const redisSubjectId = primaryModelId.substring(5);
          const responseText = await redisClient.get(`subject:${redisSubjectId}:response`);
          
          if (responseText) {
            // Append the merge note to the response text
            const updatedResponseText = responseText + mergeNote;
            await redisClient.set(`subject:${redisSubjectId}:response`, updatedResponseText);
            console.log(`Updated Redis model ${redisSubjectId} with merge note`);
          }
        }
        
        // Add each extracted threat to the primary model
        for (const threat of threats) {
          // Check if a similar threat already exists
          const similarThreat = existingThreats.find(t => {
            // Exact title match
            if (t.title.toLowerCase() === threat.threat.toLowerCase()) {
              return true;
            }
            
            // If either description is very short, require a higher similarity threshold
            const minDescLength = Math.min(
              t.description.length, 
              threat.description.length
            );
            
            if (minDescLength < 30) {
              // For short descriptions, require more exact matching
              return t.description.toLowerCase() === threat.description.toLowerCase();
            }
            
            // For longer descriptions, check if one contains the other
            // or if they share significant common words
            const tDesc = t.description.toLowerCase();
            const threatDesc = threat.description.toLowerCase();
            
            // Check if one description contains the other
            if (tDesc.includes(threatDesc) || threatDesc.includes(tDesc)) {
              return true;
            }
            
            // Check for common significant words (excluding common words)
            const tWords = new Set(tDesc.split(/\W+/).filter(w => w.length > 4));
            const threatWords = new Set(threatDesc.split(/\W+/).filter(w => w.length > 4));
            
            // Count common significant words
            let commonWords = 0;
            for (const word of tWords) {
              if (threatWords.has(word)) {
                commonWords++;
              }
            }
            
            // If they share several significant words, consider them similar
            return commonWords >= 3;
          });
          
          if (!similarThreat) {
            // Calculate risk score based on description
            const riskScore = calculateRiskScore(threat.description);
            
            if (isPrimaryRedisModel) {
              // For Redis primary models, we need to append the threat to the response text
              const redisSubjectId = primaryModelId.substring(5);
              const responseText = await redisClient.get(`subject:${redisSubjectId}:response`);
              
              if (responseText) {
                // Format the threat to append to the response text
                const threatText = `

## Threat: ${threat.threat}

**Description:** ${threat.description}

**Mitigation:** ${threat.mitigation || 'None provided'}
`;                
                
                // Append the threat to the response text
                const updatedResponseText = responseText + threatText;
                await redisClient.set(`subject:${redisSubjectId}:response`, updatedResponseText);
                
                // Add to existing threats to prevent duplicates
                const newThreatId = `redis-${redisSubjectId}-${Math.random().toString(36).substring(2, 10)}`;
                existingThreats.push({
                  id: newThreatId,
                  title: threat.threat,
                  description: threat.description,
                  threat_model_id: primaryModelId,
                  is_redis_threat: true
                });
                
                mergeMetrics.total_threats_added++;
                
                // Update model-specific metrics
                const modelDetail = mergeMetrics.model_details.find(m => m.id === `subj-${subjectId}`);
                if (modelDetail) {
                  modelDetail.threats_added++;
                }
              }
            } else {
              // For PostgreSQL primary models, add to the database
              const insertThreatQuery = `
                INSERT INTO threat_model.threats (
                  threat_model_id, title, description, mitigation, risk_score,
                  impact, likelihood, source_model_id, source_model_name
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                RETURNING id
              `;
              
              const threatValues = [
                primaryModelId,
                threat.threat,
                threat.description,
                threat.mitigation,
                riskScore,
                Math.ceil(riskScore / 20), // Impact on a scale of 1-5
                Math.ceil(riskScore / 20), // Likelihood on a scale of 1-5
                `redis-${subjectId}`,
                title
              ];
              
              const newThreatResult = await dbClient.query(insertThreatQuery, threatValues);
              const newThreatId = newThreatResult.rows[0].id;
              mergeMetrics.total_threats_added++;
              
              // Update model-specific metrics
              const modelDetail = mergeMetrics.model_details.find(m => m.id === `subj-${subjectId}`);
              if (modelDetail) {
                modelDetail.threats_added++;
              }
            }
            
            console.log(`Added threat "${threat.threat}" from Redis model ${subjectId} to primary model`);
            
            // Add the new threat to the existingThreats array so we don't add duplicates
            // in subsequent iterations
            existingThreats.push({
              id: newThreatId,
              title: threat.threat,
              description: threat.description,
              threat_model_id: primaryModelId
            });
          } else {
            console.log(`Skipped threat "${threat.threat}" from Redis model ${subjectId} - similar threat already exists`);
            mergeMetrics.total_threats_skipped++;
            
            // Update model-specific metrics
            const modelDetail = mergeMetrics.model_details.find(m => m.id === `subj-${subjectId}`);
            if (modelDetail) {
              modelDetail.threats_skipped++;
            }
          }
        }
        
        mergeMetrics.redis_models_processed++;
      }
    }
    
    // Update the primary model metadata
    let updatedModel;
    
    if (isPrimaryRedisModel) {
      // Merge PostgreSQL to Redis
      await mergePostgresToRedis(
        primaryModel.id, // Use the extracted Redis ID without prefix
        sourceModel,
        threats,
        modelMetrics
      );
    } else {
      // For PostgreSQL models, update the database
      const updateModelQuery = `
        UPDATE threat_model.threat_models
        SET 
          updated_at = CURRENT_TIMESTAMP,
          model_version = (CAST(model_version AS NUMERIC) + 0.1)::TEXT,
          status = 'Draft',
          merge_metadata = $2
        WHERE id = $1
        RETURNING *
      `;
      
      const mergeMetadata = {
        merged_at: new Date().toISOString(),
        merged_by: mergedBy,
        source_models: {
          postgres: pgModelIds,
          redis: redisModelIds
        },
        metrics: mergeMetrics
      };
      
      const updatedModelResult = await dbClient.query(updateModelQuery, [
        primaryModelId, 
        JSON.stringify(mergeMetadata)
      ]);
      
      updatedModel = updatedModelResult.rows[0];
    } else {
      // For Redis models, store merge metadata in Redis
      const redisSubjectId = primaryModelId.substring(5);
      
      const mergeMetadata = {
        merged_at: new Date().toISOString(),
        merged_by: mergedBy,
        source_models: {
          postgres: pgModelIds,
          redis: redisModelIds
        },
        metrics: mergeMetrics
      };
      
      // Store merge metadata in Redis
      await redisClient.set(`subject:${redisSubjectId}:mergeMetadata`, JSON.stringify(mergeMetadata));
      
      // Update the threat count
      const currentThreatCount = await redisClient.get(`subject:${redisSubjectId}:threatCount`) || '0';
      const newThreatCount = parseInt(currentThreatCount, 10) + mergeMetrics.total_threats_added;
      await redisClient.set(`subject:${redisSubjectId}:threatCount`, newThreatCount.toString());
      
      // Create an updated model object similar to the PostgreSQL one
      updatedModel = {
        id: redisSubjectId,
        name: await redisClient.get(`subject:${redisSubjectId}:title`) || 'Unknown',
        is_redis_model: true,
        threat_count: newThreatCount,
        merge_metadata: mergeMetadata
      };
      
      console.log(`Updated Redis model ${redisSubjectId} with merge metadata and new threat count: ${newThreatCount}`);
    }
    
    await dbClient.query('COMMIT');
    
    return {
      model: updatedModel,
      metrics: mergeMetrics
    };
  } catch (error) {
    await dbClient.query('ROLLBACK');
    console.error('Error merging threat models:', error);
    throw error;
  } finally {
    dbClient.release();
  }
}

/**
 * Extract threats from a Redis response text
 * 
 * @param {string} responseText - The response text from Redis
 * @returns {Array<Object>} - Array of extracted threats
 */
function extractThreatsFromResponse(responseText) {
  const threats = [];
  
  // Try multiple patterns to match threat sections
  const patterns = [
    // Pattern 1: Standard format with ## Threat: header
    {
      regex: /## Threat:([^#]+)##\s*\*\*Description:\*\*([^*]+)\*\*Mitigation:\*\*([^#]*)/g,
      extract: (match) => ({
        threat: match[1].trim(),
        description: match[2].trim(),
        mitigation: match[3].trim()
      })
    },
    // Pattern 2: Format with just ## Threat: without markdown formatting
    {
      regex: /## Threat:([^#\n]+)([\s\S]*?)(?=## |$)/g,
      extract: (match) => {
        const title = match[1].trim();
        const content = match[2].trim();
        let description = content;
        let mitigation = '';
        
        const mitigationMatch = content.match(/Mitigation:([\s\S]*)/i);
        if (mitigationMatch) {
          mitigation = mitigationMatch[1].trim();
          description = content.replace(/Mitigation:[\s\S]*/i, '').trim();
        }
        
        return {
          threat: title,
          description: description,
          mitigation: mitigation
        };
      }
    },
    // Pattern 3: Format with just ## as headers for each threat
    {
      regex: /## ([^#\n]+)([\s\S]*?)(?=## |$)/g,
      extract: (match) => {
        const title = match[1].trim();
        const content = match[2].trim();
        
        // Skip headers like "Overview", "Introduction", etc.
        if (['Overview', 'Introduction', 'Summary', 'Conclusion', 'Background'].includes(title)) {
          return null;
        }
        
        let description = content;
        let mitigation = '';
        
        const mitigationMatch = content.match(/Mitigation:([\s\S]*)/i);
        if (mitigationMatch) {
          mitigation = mitigationMatch[1].trim();
          description = content.replace(/Mitigation:[\s\S]*/i, '').trim();
        }
        
        return {
          threat: title,
          description: description,
          mitigation: mitigation
        };
      }
    },
    // Pattern 4: Format with numbered threats
    {
      regex: /\d+\.\s+([^\n]+)([\s\S]*?)(?=\d+\.|$)/g,
      extract: (match) => {
        const title = match[1].trim();
        const content = match[2].trim();
        
        if (content.length < 10) return null; // Skip if content is too short
        
        let description = content;
        let mitigation = '';
        
        const mitigationMatch = content.match(/Mitigation:([\s\S]*)/i);
        if (mitigationMatch) {
          mitigation = mitigationMatch[1].trim();
          description = content.replace(/Mitigation:[\s\S]*/i, '').trim();
        }
        
        return {
          threat: title,
          description: description,
          mitigation: mitigation
        };
      }
    }
  ];
  
  // Try each pattern until we find threats
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.regex.exec(responseText)) !== null) {
      const threat = pattern.extract(match);
      if (threat) {
        threats.push(threat);
      }
    }
    
    // If we found threats with this pattern, stop trying other patterns
    if (threats.length > 0) {
      break;
    }
  }
  
  return threats;
}

/**
 * Calculate a risk score based on threat description
 * 
 * @param {string} description - Threat description
 * @returns {number} - Risk score (1-100)
 */
function calculateRiskScore(description) {
  // Default medium risk
  let baseScore = 50;
  
  // Keywords that indicate higher risk
  const highRiskKeywords = [
    'critical', 'severe', 'high', 'dangerous', 'significant', 'major', 
    'sensitive data', 'personal data', 'financial', 'authentication',
    'bypass', 'privilege', 'escalation', 'remote', 'execution', 'injection',
    'unauthorized', 'access', 'disclosure', 'breach', 'compromise'
  ];
  
  // Keywords that indicate lower risk
  const lowRiskKeywords = [
    'low', 'minor', 'minimal', 'limited', 'small', 'unlikely', 'rare',
    'informational', 'disclosure', 'non-sensitive', 'public', 'temporary'
  ];
  
  // Check for high risk keywords
  for (const keyword of highRiskKeywords) {
    if (description.toLowerCase().includes(keyword)) {
      baseScore += 5; // Increase score for each high risk keyword
    }
  }
  
  // Check for low risk keywords
  for (const keyword of lowRiskKeywords) {
    if (description.toLowerCase().includes(keyword)) {
      baseScore -= 5; // Decrease score for each low risk keyword
    }
  }
  
  // Ensure score is within range
  return Math.max(1, Math.min(100, baseScore));
}

module.exports = {
  mergeThreatModels
};
