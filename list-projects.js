#!/usr/bin/env node
// CLI tool to list all projects directly from Postgres
const db = require('./database');
(async () => {
  try {
    const result = await db.query('SELECT * FROM threat_model.projects ORDER BY created_at DESC');
    if (result.rows.length === 0) {
      console.log('No projects found.');
    } else {
      console.table(result.rows);
    }
    process.exit(0);
  } catch (err) {
    console.error('Error querying projects:', err);
    process.exit(1);
  }
})();
