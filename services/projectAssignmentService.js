/**
 * Project Assignment Service
 * Handles the assignment of threat models to projects
 */
const db = require('../database');
const redisClient = require('../utils/redis').client;
const pool = require('../database').pool;

/**
 * Get threat models assigned to a project
 * @param {number} projectId - Project ID
 * @param {Object} filters - Optional filters (e.g., status)
 * @returns {Promise<Array>} - Array of threat models
 */
async function getThreatModelsForProject(projectId, filters = {}) {
  if (!projectId) {
    throw new Error('Project ID is required');
  }

  try {
    // Check Redis cache first
    const cacheKey = `project:${projectId}:threat_models${filters.status ? `:${filters.status}` : ''}`;
    const cachedData = await redisClient.get(cacheKey);
    
    if (cachedData) {
      console.log(`Cache hit for ${cacheKey}`);
      return JSON.parse(cachedData);
    }
    
    console.log(`Cache miss for ${cacheKey}, querying database and Redis...`);
    
    // Get PostgreSQL threat models
    // Build query based on filters
    const queryParams = [projectId];
    if (filters.status) {
      queryParams.push(filters.status);
    }
    
    const query = `
      SELECT tm.* 
      FROM threat_model.threat_models tm
      JOIN threat_model.project_threat_models ptm ON tm.id = ptm.threat_model_id
      WHERE ptm.project_id = $1
      ${filters.status ? 'AND tm.status = $2' : ''}
      ORDER BY tm.created_at DESC
    `;
    
    const pgResult = await pool.query(query, queryParams);
    
    // Get Redis-based subject IDs assigned to this project
    const subjectIds = await redisClient.sMembers(`project:${projectId}:subjects`) || [];
    
    // Get details for each subject
    const redisSubjects = [];
    for (const subjectId of subjectIds) {
      // Get subject title
      const title = await redisClient.get(`subject:${subjectId}:title`);
      if (!title) continue; // Skip if subject doesn't exist anymore
      
      // Get model used
      const model = await redisClient.get(`subject:${subjectId}:model`) || 'Unknown';
      
      // Get creation date
      const createdAt = await redisClient.get(`subject:${subjectId}:createdAt`) || new Date().toISOString();
      
      // Get response text to count threats
      let threatCount = 0;
      
      // First check if we have a cached threat count
      const cachedThreatCount = await redisClient.get(`subject:${subjectId}:threatCount`);
      if (cachedThreatCount !== null) {
        threatCount = parseInt(cachedThreatCount, 10) || 0;
        console.log(`Using cached threat count for subject ${subjectId}: ${threatCount}`);
      } else {
        // If no cached count, calculate it from the response
        const responseText = await redisClient.get(`subject:${subjectId}:response`);
        if (responseText) {
          // Try multiple patterns to be more robust
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
          
          threatCount = matches.length;
          console.log(`Calculated threat count for subject ${subjectId}: ${threatCount}`);
          
          // Cache the threat count for future use (never expires)
          await redisClient.set(`subject:${subjectId}:threatCount`, threatCount.toString());
        }
      }
      
      // Get assignment metadata
      const assignmentKey = `project:${projectId}:subject:${subjectId}`;
      const assignmentData = await redisClient.hGetAll(assignmentKey) || {};
      
      redisSubjects.push({
        id: subjectId,  // Use id for compatibility with PostgreSQL models
        subjectid: subjectId,
        title,
        model,
        created_at: createdAt,
        createdAt,
        threatCount,
        assigned_by: assignmentData.assigned_by || 'Unknown',
        assigned_at: assignmentData.assigned_at || createdAt,
        source: 'redis'
      });
    }
    
    // Combine results
    const combinedResults = [
      ...pgResult.rows.map(row => ({ ...row, source: 'postgres' })),
      ...redisSubjects
    ];
    
    // Sort by created_at (newest first)
    combinedResults.sort((a, b) => {
      const dateA = new Date(a.created_at || a.createdAt);
      const dateB = new Date(b.created_at || b.createdAt);
      return dateB - dateA;
    });
    
    // Cache the result for future requests (expire after 5 minutes)
    await redisClient.set(cacheKey, JSON.stringify(combinedResults), { EX: 300 });
    
    return combinedResults;
  } catch (error) {
    console.error('Error getting threat models for project:', error);
    throw error;
  }
}

/**
 * Assign threat models to a project
 * @param {number} projectId - Project ID
 * @param {Array<string|number>} threatModelIds - Array of threat model IDs to assign (can be numeric or string IDs)
 * @param {string} assignedBy - Username of the user making the assignment
 * @returns {Promise<Array>} - Array of assigned threat model IDs
 */
async function assignThreatModelsToProject(projectId, threatModelIds, assignedBy) {
  // Validate inputs
  if (!projectId || !Array.isArray(threatModelIds) || threatModelIds.length === 0) {
    throw new Error('Invalid input parameters');
  }

  try {
    // First, check if the project exists - use a cached check to improve performance
    const projectCacheKey = `project:${projectId}:exists`;
    let projectExists = await redisClient.get(projectCacheKey);
    
    if (projectExists === null) {
      // Not in cache, check database
      const projectQuery = 'SELECT id FROM threat_model.projects WHERE id = $1';
      const projectResult = await pool.query(projectQuery, [projectId]);
      
      projectExists = projectResult.rows.length > 0 ? '1' : '0';
      // Cache the result for 1 hour
      await redisClient.set(projectCacheKey, projectExists, { EX: 3600 });
    }
    
    if (projectExists === '0') {
      throw new Error(`Project with ID ${projectId} not found`);
    }
    
    // Check if the project ID is a UUID
    const isProjectUuid = typeof projectId === 'string' && projectId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    
    // Handle prefixed subject IDs (subj-123) from the frontend
    const processedIds = threatModelIds.map(id => {
      if (typeof id === 'string' && id.startsWith('subj-')) {
        // Remove the prefix and return the original ID
        console.log(`Processing prefixed ID: ${id} -> ${id.substring(5)}`);
        return id.substring(5);
      }
      console.log(`Using ID as-is: ${id}`);
      return id;
    });
    
    // Separate Redis-based subject IDs from PostgreSQL-based threat model IDs
    // Redis IDs are alphanumeric strings that don't look like UUIDs
    // PostgreSQL IDs should be UUIDs if the project ID is a UUID
    const redisSubjectIds = processedIds.filter(id => {
      // Consider numeric IDs and non-UUID strings as Redis subjects
      const isRedisFormat = 
        (typeof id === 'number') || 
        (typeof id === 'string' && !id.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i));
      
      if (isRedisFormat) {
        console.log(`Identified Redis subject ID: ${id}`);
      }
      return isRedisFormat;
    });
    
    // For PostgreSQL, we need to ensure the IDs match the expected format (UUID)
    const pgThreatModelIds = processedIds.filter(id => {
      // If it's a UUID string, it's definitely for PostgreSQL
      if (typeof id === 'string' && id.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
        console.log(`Identified PostgreSQL UUID: ${id}`);
        return true;
      }
      
      // If project uses UUIDs, we can't use numeric IDs with PostgreSQL
      // But we'll handle them as Redis subjects instead
      if (isProjectUuid) {
        // Move numeric IDs to Redis subjects instead of skipping them
        if (typeof id === 'number' || (typeof id === 'string' && !isNaN(parseInt(id)))) {
          console.log(`Moving numeric ID ${id} to Redis subjects for UUID-based project ${projectId}`);
          return false; // Don't include in pgThreatModelIds
        }
      } else {
        // For non-UUID projects, numeric IDs are fine for PostgreSQL
        if (typeof id === 'number' || (typeof id === 'string' && !isNaN(parseInt(id)))) {
          console.log(`Using numeric ID ${id} for non-UUID project ${projectId}`);
          return true;
        }
      }
      
      // By default, don't assume it's for PostgreSQL
      return false;
    });
    
    // Keep IDs in their original format - PostgreSQL will handle type conversion
    const pgIds = pgThreatModelIds;
    
    // Verify PostgreSQL threat models exist (if any)
    let pgModelsValid = true;
    if (pgIds.length > 0) {
      try {
        const placeholders = pgIds.map((_, i) => `$${i + 1}`).join(', ');
        const threatModelQuery = `SELECT id FROM threat_model.threat_models WHERE id IN (${placeholders})`;
        const threatModelResult = await pool.query(threatModelQuery, pgIds);
        
        if (threatModelResult.rows.length !== pgIds.length) {
          // Find which threat models don't exist
          const foundIds = threatModelResult.rows.map(row => row.id);
          const missingIds = pgIds.filter(id => !foundIds.includes(id));
          console.warn(`Some PostgreSQL threat models not found: ${missingIds.join(', ')}`);
          pgModelsValid = false;
        }
      } catch (error) {
        console.error('Error verifying PostgreSQL threat models:', error);
        pgModelsValid = false;
      }
    }
  
    // Start a database transaction
    const dbClient = await db.getClient();
    try {
      await dbClient.query('BEGIN');
      
      // Skip verification for Redis subjects - we'll just try to assign them
      // This improves performance by avoiding unnecessary checks
      const redisUtil = require('../utils/redis');
      const redisClient = redisUtil.client;
      
      if (redisSubjectIds.length > 0) {
        console.log(`Processing ${redisSubjectIds.length} Redis subject IDs...`);
      } else {
        console.log('No Redis subject IDs to process');
      }
      
      // Only validate if we have no IDs to process at all
      if (redisSubjectIds.length === 0 && pgIds.length === 0) {
        console.error('No threat models provided for assignment');
        throw new Error('No threat models provided for assignment');
      }
      
      // Insert assignments for PostgreSQL threat models
      const insertedIds = [];
      
      // Handle PostgreSQL threat models - batch insert for better performance
      if (pgIds.length > 0) {
        try {
          // Build a single query with multiple value sets for better performance
          const values = pgIds.map((id, index) => `($1, $${index + 2}, $${pgIds.length + 2})`);
          const params = [projectId, ...pgIds, assignedBy];
          
          const insertQuery = `
            INSERT INTO threat_model.project_threat_models (project_id, threat_model_id, assigned_by)
            VALUES ${values.join(', ')}
            ON CONFLICT (project_id, threat_model_id) DO NOTHING
            RETURNING threat_model_id
          `;
          
          console.log(`Batch inserting ${pgIds.length} PostgreSQL threat models`);
          const insertResult = await dbClient.query(insertQuery, params);
          
          // Add all inserted IDs to the result
          insertResult.rows.forEach(row => {
            insertedIds.push(row.threat_model_id);
          });
          
          console.log(`Successfully inserted ${insertResult.rows.length} PostgreSQL threat models`);
        } catch (error) {
          console.error(`Error batch inserting threat models for project ${projectId}:`, error);
          // Continue with Redis subjects even if PostgreSQL fails
        }
      }
      
      // Handle Redis subject IDs - batch operations for better performance
      if (redisSubjectIds.length > 0) {
        try {
          console.log(`Batch processing ${redisSubjectIds.length} Redis subjects`);
          const now = new Date().toISOString();
          const pipeline = redisClient.multi();
          
          // Add all Redis operations to the pipeline
          for (const subjectId of redisSubjectIds) {
            const key = `project:${projectId}:subject:${subjectId}`;
            
            // Add assignment metadata
            pipeline.hSet(key, {
              project_id: projectId,
              subject_id: subjectId,
              assigned_by: assignedBy,
              assigned_at: now
            });
            
            // Add to the project's list of assigned subjects
            pipeline.sAdd(`project:${projectId}:subjects`, subjectId);
            
            // Track for return value
            insertedIds.push(subjectId);
          }
          
          // Execute all Redis commands in one batch
          await pipeline.exec();
          console.log(`Successfully assigned ${redisSubjectIds.length} Redis subjects`);
        } catch (error) {
          console.error(`Error assigning Redis subjects to project ${projectId}:`, error);
        }
      }
      
      await dbClient.query('COMMIT');
      
      // Clear cache after successful assignment to ensure fresh data
      const cachePattern = `project:${projectId}:threat_models*`;
      const keys = await redisClient.keys(cachePattern);
      
      // Also invalidate the total threat model count cache
      keys.push(`project:${projectId}:total_threat_model_count`);
      
      if (keys.length > 0) {
        await redisClient.del(keys)
          .then(() => console.log(`Auto-cleared cache for project ${projectId}, ${keys.length} keys removed`))
          .catch(err => console.error(`Error clearing cache for project ${projectId}:`, err));
      }
      
      return insertedIds;
    } catch (error) {
      await dbClient.query('ROLLBACK');
      throw error;
    } finally {
      dbClient.release();
    }
  } catch (error) {
    console.error('Error assigning threat models to project:', error);
    throw error;
  }
}

/**
 * Remove a threat model assignment from a project
 * @param {number} projectId - Project ID
 * @param {string|number} threatModelId - Threat model ID to remove (can be numeric or string ID)
 * @returns {Promise<boolean>} - True if removed, false if not found
 */
async function removeThreatModelFromProject(projectId, threatModelId) {
  if (!projectId || !threatModelId) {
    throw new Error('Project ID and threat model ID are required');
  }

  try {
    let removed = false;
    
    // Handle prefixed subject IDs (subj-123) from the frontend
    let processedId = threatModelId;
    if (typeof threatModelId === 'string' && threatModelId.startsWith('subj-')) {
      processedId = threatModelId.substring(5);
    }
    
    // Check if this is a Redis subject ID (string) or PostgreSQL threat model ID
    // Redis IDs are alphanumeric strings that don't look like UUIDs
    const isRedisSubject = typeof processedId === 'string' && processedId.match(/^[a-zA-Z0-9-]+$/) && !processedId.includes('-');
    
    if (isRedisSubject) {
      // Handle Redis subject removal
      const key = `project:${projectId}:subject:${processedId}`;
      const exists = await redisClient.exists(key);
      
      if (exists) {
        // Remove the assignment
        await redisClient.del(key);
        
        // Remove from the project's list of assigned subjects
        await redisClient.sRem(`project:${projectId}:subjects`, processedId);
        
        removed = true;
      }
    } else {
      // Handle PostgreSQL threat model removal
      // Keep the ID in its original format - PostgreSQL will handle type conversion
      const pgId = threatModelId;
      
      // Delete the assignment
      const query = `
        DELETE FROM threat_model.project_threat_models
        WHERE project_id = $1 AND threat_model_id = $2
        RETURNING threat_model_id
      `;
      
      const result = await pool.query(query, [projectId, pgId]);
      removed = result.rows.length > 0;
    }
    
    // Clear cache for this project
    const cachePattern = `project:${projectId}:threat_models*`;
    const keys = await redisClient.keys(cachePattern);
    
    // Also invalidate the total threat model count cache
    keys.push(`project:${projectId}:total_threat_model_count`);
    
    if (keys.length > 0) {
      await redisClient.del(keys);
      console.log(`Cleared cache for pattern ${cachePattern} and total count`);
    }
    
    return removed;
  } catch (error) {
    console.error('Error removing threat model from project:', error);
    throw error;
  }
  
  return true;
}

module.exports = {
  getThreatModelsForProject,
  assignThreatModelsToProject,
  removeThreatModelFromProject
};
