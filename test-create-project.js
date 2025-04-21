#!/usr/bin/env node
/**
 * Test script to create a project directly via the API
 * This bypasses the UI to help diagnose authentication issues
 */
const axios = require('axios');

// Project data to create
const projectData = {
  name: `Test Project ${new Date().toISOString().slice(11, 19)}`,
  description: 'Created by test script',
  business_unit: 'Testing',
  criticality: 'Medium',
  data_classification: 'Internal',
  status: 'Active'
};

console.log('Creating test project with data:');
console.log(JSON.stringify(projectData, null, 2));

// Make the API request
axios.post('http://localhost:3000/api/projects', projectData, {
  headers: {
    'Content-Type': 'application/json'
  }
})
.then(response => {
  console.log('\nProject created successfully!');
  console.log('Response status:', response.status);
  console.log('Response data:', JSON.stringify(response.data, null, 2));
  
  // Now list all projects to verify
  console.log('\nListing all projects to verify:');
  return axios.get('http://localhost:3000/api/projects');
})
.then(response => {
  console.log('Projects found:', response.data.data.length);
  console.log('Projects:', JSON.stringify(response.data.data, null, 2));
})
.catch(error => {
  console.error('\nError creating project:');
  if (error.response) {
    // The request was made and the server responded with a status code
    // that falls out of the range of 2xx
    console.error('Response status:', error.response.status);
    console.error('Response data:', error.response.data);
    console.error('Response headers:', error.response.headers);
  } else if (error.request) {
    // The request was made but no response was received
    console.error('No response received from server');
  } else {
    // Something happened in setting up the request that triggered an Error
    console.error('Error setting up request:', error.message);
  }
});
