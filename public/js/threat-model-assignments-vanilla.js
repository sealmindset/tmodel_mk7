/**
 * Threat Model Assignments Vanilla JS
 * 
 * A non-React implementation of the threat model assignments functionality
 * to ensure it works regardless of React loading issues.
 */

// Add event listeners after DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  console.log('Initializing threat model assignments');
  initThreatModelAssignments();
});

/**
 * Get project ID from URL
 */
function getProjectIdFromUrl() {
  const pathParts = window.location.pathname.split('/');
  const projectsIndex = pathParts.indexOf('projects');
  if (projectsIndex !== -1 && projectsIndex < pathParts.length - 1) {
    return pathParts[projectsIndex + 1];
  }
  return null;
}

/**
 * Main initialization function
 */
function initThreatModelAssignments() {
  console.log('Initializing vanilla threat model assignments');
  
  // Get project ID from the URL
  const projectId = getProjectIdFromUrl();
  if (!projectId) {
    console.error('Project ID not found in URL');
    return;
  }
  
  // Initialize the UI
  const container = document.getElementById('threatModelAssignmentsContainer');
  if (!container) {
    console.error('Threat model assignments container not found');
    return;
  }
  
  // Set up the assign button event listener
  const assignButton = document.getElementById('assignThreatModelsBtn');
  if (assignButton) {
    assignButton.addEventListener('click', function() {
      openAssignModal(projectId);
    });
  }
  
  // Show loading state
  showLoading();
  
  // Fetch threat models assigned to this project
  fetchThreatModels(projectId, container);
}

/**
 * Fetch threat models assigned to this project
 */
function fetchThreatModels(projectId, container) {
  // Add a cache-busting parameter to prevent browser caching
  const timestamp = new Date().getTime();
  fetch(`/api/projects/${projectId}/threat-models?_=${timestamp}`)
    .then(response => {
      if (!response.ok) {
        throw new Error(`Error: ${response.status}`);
      }
      return response.json();
    })
    .then(data => {
      console.log(`Fetched ${data.data ? data.data.length : 0} threat models for project ${projectId}`);
      renderThreatModelsList(data.data || [], projectId, container);
    })
    .catch(error => {
      console.error('Error fetching threat models:', error);
      showErrorMessage('Failed to load threat models. Please try again later.', container);
    });
}

/**
 * Render the list of threat models
 */
function renderThreatModelsList(threatModels, projectId, container) {
  if (!container) return;
  
  if (threatModels.length === 0) {
    container.innerHTML = `
      <div class="alert alert-info" role="alert">
        No threat models are currently assigned to this project.
        <button 
          class="btn btn-sm btn-primary ms-3"
          id="emptyStateAssignBtn"
        >
          Assign Threat Models
        </button>
      </div>
    `;
    
    // Add event listener to the button
    const emptyStateAssignBtn = document.getElementById('emptyStateAssignBtn');
    if (emptyStateAssignBtn) {
      emptyStateAssignBtn.addEventListener('click', function() {
        openAssignModal(projectId);
      });
    }
    
    return;
  }
  
  // Render the table with threat models
  let html = `
    <div class="d-flex justify-content-between align-items-center mb-3">
      <h3 class="mb-0">Assigned Threat Models</h3>
    </div>
    <div class="table-responsive">
      <table class="table table-striped table-hover">
        <thead>
          <tr>
            <th>Title</th>
            <th>Created</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
  `;
  
  // Add each threat model to the table
  threatModels.forEach(model => {
    const statusClass = getStatusClass(model.status || 'Draft');
    const createdDate = model.created_at ? new Date(model.created_at).toLocaleDateString() : 'Unknown';
    const modelId = model.id || model.subjectid || '';
    const source = model.source || '';
    
    // Determine the correct URL based on the source
    let modelUrl = '';
    if (source === 'redis') {
      // Redis-based threat models should link to results page with subjectid
      modelUrl = `/results?subjectid=${modelId}`;
    } else {
      // PostgreSQL-based threat models link to the threat-models page
      modelUrl = `/threat-models/${modelId}`;
    }
    
    console.log(`Creating link for model ${modelId}, source: ${source}, URL: ${modelUrl}`);
    
    html += `
      <tr data-id="${modelId}" data-source="${source}">
        <td>
          <a href="${modelUrl}" target="_blank">
            ${model.title || 'Untitled Threat Model'}
          </a>
        </td>
        <td>${createdDate}</td>
        <td>
          <span class="badge bg-${statusClass}">
            ${model.status || 'Draft'}
          </span>
        </td>
        <td>
          <div class="btn-group btn-group-sm">
            <a href="${modelUrl}" class="btn btn-outline-primary" title="View Threat Model" target="_blank">
              <i class="bi bi-eye"></i>
            </a>
            <button
              class="btn btn-outline-danger remove-threat-model-btn"
              data-id="${modelId}"
              title="Remove Assignment"
            >
              <i class="bi bi-trash"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  });
  
  html += `
        </tbody>
      </table>
    </div>
  `;
  
  container.innerHTML = html;
  
  // Add event listeners to remove buttons
  const removeButtons = container.querySelectorAll('.remove-threat-model-btn');
  removeButtons.forEach(button => {
    button.addEventListener('click', function() {
      const threatModelId = this.getAttribute('data-id');
      if (confirm('Are you sure you want to remove this threat model from the project?')) {
        removeThreatModel(threatModelId, projectId, container);
      }
    });
  });
}

/**
 * Remove a threat model from the project
 */
function removeThreatModel(threatModelId, projectId, container) {
  fetch(`/api/projects/${projectId}/threat-models/${threatModelId}`, {
    method: 'DELETE'
  })
  .then(response => {
    if (!response.ok) {
      throw new Error(`Error: ${response.status}`);
    }
    return response.json();
  })
  .then(data => {
    toastr.success('Threat model removed successfully');
    // Clear cache first, then fetch threat models
    fetch(`/api/projects/${projectId}/clear-cache`, { method: 'POST' })
      .then(() => {
        fetchThreatModels(projectId, container);
      })
      .catch(() => {
        // If cache clearing fails, still try to refresh
        fetchThreatModels(projectId, container);
      });
  })
  .catch(error => {
    console.error('Error removing threat model:', error);
    toastr.error('Failed to remove threat model');
  });
}

/**
 * Open the assign modal
 */
function openAssignModal(projectId) {
  // Get or create modal
  let modal = document.getElementById('assignThreatModelsModal');
  
  if (!modal) {
    // Create modal if it doesn't exist
    const modalHtml = `
      <div class="modal fade" id="assignThreatModelsModal" tabindex="-1" aria-labelledby="assignThreatModelsModalLabel" aria-hidden="true">
        <div class="modal-dialog modal-lg">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title" id="assignThreatModelsModalLabel">Assign Threat Models</h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
            </div>
            <div class="modal-body" id="assignModalContent">
              <div class="text-center py-4">
                <div class="spinner-border text-primary" role="status">
                  <span class="visually-hidden">Loading...</span>
                </div>
                <p class="mt-2">Loading threat models...</p>
              </div>
            </div>
            <div class="modal-footer">
              <div class="me-auto">
                <span class="badge bg-primary" id="selectedCountBadge">0 selected</span>
              </div>
              <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
              <button type="button" class="btn btn-primary" id="assignSelectedBtn" disabled>Assign Selected</button>
            </div>
          </div>
        </div>
      </div>
    `;
    
    // Append modal to body
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    modal = document.getElementById('assignThreatModelsModal');
    
    // Add event listener to select all checkbox
    modal.addEventListener('change', function(e) {
      if (e.target.id === 'selectAllThreatModels') {
        const checkboxes = modal.querySelectorAll('.threat-model-checkbox');
        checkboxes.forEach(checkbox => {
          checkbox.checked = e.target.checked;
        });
        updateSelectedCount();
      } else if (e.target.classList.contains('threat-model-checkbox')) {
        updateSelectedCount();
      }
    });
    
    // Add event listener to search input
    modal.addEventListener('input', function(e) {
      if (e.target.id === 'threatModelSearchInput') {
        filterThreatModels(e.target.value);
      }
    });
    
    // Add event listener to assign button
    const assignSelectedBtn = document.getElementById('assignSelectedBtn');
    if (assignSelectedBtn) {
      assignSelectedBtn.addEventListener('click', function() {
        assignSelectedThreatModels(projectId);
      });
    }
  }
  
  // Show the modal
  const bsModal = new bootstrap.Modal(modal);
  bsModal.show();
  
  // Load available threat models
  loadAvailableThreatModels(projectId);
}

/**
 * Load available threat models for assignment
 */
function loadAvailableThreatModels(projectId) {
  const modalContent = document.getElementById('assignModalContent');
  if (!modalContent) return;
  
  // Show loading state
  modalContent.innerHTML = `
    <div class="text-center py-4">
      <div class="spinner-border text-primary" role="status">
        <span class="visually-hidden">Loading...</span>
      </div>
      <p class="mt-2">Loading threat models...</p>
    </div>
  `;
  
  // First get currently assigned threat models
  fetch(`/api/projects/${projectId}/threat-models`)
    .then(response => {
      if (!response.ok) {
        throw new Error(`Error: ${response.status}`);
      }
      return response.json();
    })
    .then(currentData => {
      const currentIds = (currentData.data || []).map(tm => tm.id || tm.subjectid);
      console.log('Currently assigned threat model IDs:', currentIds);
      
      // Get all threat models from the Redis-based models storage
      // This endpoint returns the actual models shown on the models page
      return fetch('/api/subjects')
        .then(response => {
          if (!response.ok) {
            throw new Error(`Error: ${response.status}`);
          }
          return response.json();
        })
        .then(allData => {
          console.log('All threat models from Redis storage:', allData);
          // Filter out already assigned ones
          const available = (allData.subjects || []).filter(tm => !currentIds.includes(tm.subjectid));
          console.log('Available threat models for assignment:', available);
          renderAvailableThreatModels(available);
        })
        .catch(modelError => {
          console.error('Error fetching from /api/subjects, trying alternative endpoints:', modelError);
          
          // Try the models page endpoint
          return fetch('/models')
            .then(response => {
              if (!response.ok) {
                throw new Error(`Error: ${response.status}`);
              }
              return response.text();
            })
            .then(html => {
              console.log('Received HTML from /models page');
              // Parse the HTML to extract model data
              const parser = new DOMParser();
              const doc = parser.parseFromString(html, 'text/html');
              
              // Find model cards or table rows
              const modelElements = doc.querySelectorAll('.model-card, .model-row, tr[data-model-id]');
              console.log(`Found ${modelElements.length} model elements in HTML`);
              
              // Extract model data from HTML
              const models = Array.from(modelElements).map(el => {
                const id = el.dataset.modelId || el.querySelector('[data-model-id]')?.dataset.modelId;
                const title = el.querySelector('.model-title, [data-model-title]')?.textContent.trim();
                return { subjectid: id, title: title, source: 'redis' };
              }).filter(m => m.subjectid && m.title);
              
              console.log('Extracted models from HTML:', models);
              renderAvailableThreatModels(models);
            })
            .catch(htmlError => {
              console.error('Error parsing models from HTML, trying /api/threat-models as last resort:', htmlError);
              
              // Last resort: try the original endpoint
              return fetch('/api/threat-models')
                .then(response => {
                  if (!response.ok) {
                    throw new Error(`Error: ${response.status}`);
                  }
                  return response.json();
                })
                .then(allData => {
                  console.log('All threat models from fallback endpoint:', allData);
                  // Filter out already assigned ones
                  const available = (allData.data || []).filter(tm => !currentIds.includes(tm.id));
                  renderAvailableThreatModels(available);
                });
            });
        });
    })
    .catch(error => {
      console.error('Error loading available threat models:', error);
      modalContent.innerHTML = `
        <div class="alert alert-danger" role="alert">
          Failed to load available threat models. Please try again later.
          <a href="/models" class="btn btn-sm btn-outline-primary ms-3" target="_blank">
            View All Models
          </a>
        </div>
      `;
    });
}

/**
 * Render available threat models in the modal
 */
function renderAvailableThreatModels(threatModels) {
  const modalContent = document.getElementById('assignModalContent');
  if (!modalContent) return;
  
  if (!threatModels || threatModels.length === 0) {
    modalContent.innerHTML = `
      <div class="alert alert-info" role="alert">
        No threat models available for assignment. All threat models are already assigned to this project.
      </div>
    `;
    return;
  }
  
  console.log('Rendering threat models:', threatModels);
  
  let html = `
    <div class="mb-3">
      <input type="text" class="form-control" id="threatModelSearchInput" placeholder="Search threat models...">
    </div>
    <div class="mb-3">
      <div class="form-check">
        <input class="form-check-input" type="checkbox" id="selectAllThreatModels">
        <label class="form-check-label" for="selectAllThreatModels">
          Select All
        </label>
      </div>
    </div>
    <div class="list-group mb-3" id="availableThreatModelsList">
  `;
  
  // Add each threat model to the list
  threatModels.forEach(tm => {
    // Handle all possible formats - from Redis subjects, HTML parsing, or API endpoints
    const id = tm.id || tm.subjectid || tm._id;
    const title = tm.title || tm.name || 'Untitled Threat Model';
    const description = tm.description || '';
    
    // Determine the source based on available properties
    let source = 'postgres';
    if (tm.subjectid || tm.source === 'redis' || 
        // Non-UUID strings or numeric IDs are likely Redis subjects
        (typeof id === 'string' && !id.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) ||
        typeof id === 'number') {
      source = 'redis';
    }
    
    console.log(`Threat model: ${id}, Title: ${title}, Source: ${source}`);
    
    // Extract status from model_data if available
    let status = '';
    if (tm.model_data && typeof tm.model_data === 'string') {
      try {
        const modelData = JSON.parse(tm.model_data);
        status = modelData.status || '';
      } catch (e) {
        console.warn(`Could not parse model_data for threat model: ${id}`);
      }
    } else if (tm.status) {
      status = tm.status;
    } else if (tm.threatCount !== undefined) {
      // For Redis subjects, use threat count as a status indicator
      status = `${tm.threatCount} threats`;
    }
    
    // Format date
    const createdDate = tm.created_at || tm.createdAt ? new Date(tm.created_at || tm.createdAt).toLocaleDateString() : 'Unknown';
    
    html += `
      <div class="list-group-item list-group-item-action">
        <div class="d-flex w-100 justify-content-between align-items-center">
          <div class="form-check">
            <input class="form-check-input threat-model-checkbox" type="checkbox" id="tm-${id}" data-id="${id}" data-source="${source}">
            <label class="form-check-label" for="tm-${id}">
              ${title}
            </label>
          </div>
          <small class="text-muted">
            ${status ? `Status: ${status} | ` : ''}
            Created: ${createdDate}
            ${source === 'redis' ? '<span class="badge bg-info ms-2">Redis</span>' : ''}
          </small>
        </div>
        ${description ? `<p class="mb-1 small text-muted">${description}</p>` : ''}
      </div>
    `;
  });
  
  html += `
    </div>
  `;
  
  modalContent.innerHTML = html;
  
  // Initialize the selected count
  updateSelectedCount();
}

/**
 * Filter threat models based on search query
 */
function filterThreatModels(query) {
  const list = document.getElementById('availableThreatModelsList');
  if (!list) return;
  
  const items = list.querySelectorAll('.list-group-item');
  const lowerQuery = query.toLowerCase();
  
  items.forEach(item => {
    const title = item.querySelector('label').textContent.trim().toLowerCase();
    const description = item.querySelector('p')?.textContent.trim().toLowerCase() || '';
    
    if (title.includes(lowerQuery) || description.includes(lowerQuery)) {
      item.style.display = '';
    } else {
      item.style.display = 'none';
    }
  });
}

/**
 * Update the selected count badge
 */
function updateSelectedCount() {
  const selectedCheckboxes = document.querySelectorAll('.threat-model-checkbox:checked');
  const countBadge = document.getElementById('selectedCountBadge');
  const assignButton = document.getElementById('assignSelectedBtn');
  
  if (countBadge) {
    countBadge.textContent = `${selectedCheckboxes.length} selected`;
  }
  
  if (assignButton) {
    assignButton.disabled = selectedCheckboxes.length === 0;
  }
}

/**
 * Assign selected threat models to the project
 */
function assignSelectedThreatModels(projectId) {
  const selectedCheckboxes = document.querySelectorAll('.threat-model-checkbox:checked');
  
  // Get the IDs and their sources
  const threatModelsWithSource = Array.from(selectedCheckboxes).map(cb => {
    return {
      id: cb.getAttribute('data-id'),
      source: cb.getAttribute('data-source') || 'unknown'
    };
  });
  
  // Convert numeric IDs to string format with 'subj-' prefix for Redis subjects
  const threatModelIds = threatModelsWithSource.map(tm => {
    console.log(`Processing ID: ${tm.id}, Source: ${tm.source}`);
    
    // If it's a Redis subject, prefix it with 'subj-'
    if (tm.source === 'redis') {
      // Only add the prefix if it doesn't already have it
      if (!tm.id.startsWith('subj-')) {
        console.log(`Adding prefix to Redis ID: ${tm.id} -> subj-${tm.id}`);
        return `subj-${tm.id}`;
      }
    }
    return tm.id;
  });
  
  // Log the final list of IDs being sent
  console.log('Final threat model IDs for assignment:', JSON.stringify(threatModelIds));
  
  // If there are no IDs to assign, show an error and return early
  if (threatModelIds.length === 0) {
    toastr.error('No threat models selected for assignment');
    if (assignButton) {
      assignButton.disabled = false;
      assignButton.innerHTML = 'Assign Selected';
    }
    return false;
  }
  
  console.log('Selected threat model IDs for assignment:', threatModelIds);
  
  if (threatModelIds.length === 0) {
    toastr.warning('Please select at least one threat model to assign');
    return;
  }
  
  // Disable the button to prevent multiple clicks
  const assignButton = document.getElementById('assignSelectedBtn');
  if (assignButton) {
    assignButton.disabled = true;
    assignButton.innerHTML = `
      <span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
      Assigning...
    `;
  }
  
  // Store modal reference for later use
  const modal = bootstrap.Modal.getInstance(document.getElementById('assignThreatModelsModal'));
  
  // Add a timeout to reset the button if the request takes too long
  const buttonResetTimeout = setTimeout(() => {
    if (assignButton) {
      assignButton.disabled = false;
      assignButton.innerHTML = 'Assign Selected';
      toastr.warning('The operation is taking longer than expected. It may still complete in the background.');
    }
  }, 5000); // 5 seconds timeout - reduced from 10 seconds
  
  // Add debug timestamp
  console.log(`Assignment request started at: ${new Date().toISOString()}`);
  
  // Send the request
  fetch(`/api/projects/${projectId}/threat-models`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ threatModelIds })
  })
  .then(response => {
    console.log(`Response received at: ${new Date().toISOString()}, status: ${response.status}`);
    
    if (!response.ok) {
      throw new Error(`Error: ${response.status}`);
    }
    
    // Parse the JSON response immediately without delay
    return response.json();
  })
  .then(result => {
    // Clear the timeout since we got a response
    clearTimeout(buttonResetTimeout);
    
    console.log(`Assignment successful at: ${new Date().toISOString()}`, result);
    
    // Immediately reset button state
    if (assignButton) {
      assignButton.disabled = false;
      assignButton.innerHTML = 'Assign Selected';
    }

    // Show a success modal before closing the assignment modal and refreshing
    // First, close the assignment modal
    if (modal) {
      modal.hide();
    }
    
    // Create and show a success modal
    const successModalHtml = `
      <div class="modal fade" id="assignmentSuccessModal" tabindex="-1" aria-labelledby="assignmentSuccessModalLabel" aria-hidden="true">
        <div class="modal-dialog modal-dialog-centered">
          <div class="modal-content">
            <div class="modal-header bg-success text-white">
              <h5 class="modal-title" id="assignmentSuccessModalLabel">Assignment Successful</h5>
              <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
            </div>
            <div class="modal-body text-center">
              <div class="mb-3">
                <i class="bi bi-check-circle-fill text-success" style="font-size: 3rem;"></i>
              </div>
              <p class="lead">Successfully assigned ${threatModelIds.length} threat model(s) to project.</p>
              <p class="text-muted">The page will refresh automatically in a moment.</p>
            </div>
          </div>
        </div>
      </div>
    `;
    
    // Add the modal to the DOM
    const successModalContainer = document.createElement('div');
    successModalContainer.innerHTML = successModalHtml;
    document.body.appendChild(successModalContainer.firstElementChild);
    
    // Show the success modal
    const successModal = new bootstrap.Modal(document.getElementById('assignmentSuccessModal'));
    successModal.show();
    
    // Force reload the page after showing the success modal for a short time
    setTimeout(() => {
      window.location.reload();
    }, 1500); // Give enough time to see the success modal
  })
  .catch(error => {
    // Clear the timeout since we got a response
    clearTimeout(buttonResetTimeout);

    
    console.error(`Error assigning threat models at: ${new Date().toISOString()}:`, error);
    
    // Immediately reset button state
    if (assignButton) {
      assignButton.disabled = false;
      assignButton.innerHTML = 'Assign Selected';
    }
    
    // Display a simple error message
    toastr.error('Failed to assign threat models. Please try again.');
  });
  
  // Return false to prevent form submission
  return false;
}

/**
 * Show loading state
 */
function showLoading(container) {
  if (!container) {
    container = document.getElementById('threatModelAssignmentsContainer');
  }
  if (!container) return;
  
  container.innerHTML = `
    <div class="text-center py-4">
      <div class="spinner-border text-primary" role="status">
        <span class="visually-hidden">Loading...</span>
      </div>
      <p class="mt-2">Loading threat models...</p>
    </div>
  `;
}

/**
 * Show error message
 */
function showErrorMessage(message, container) {
  if (!container) {
    container = document.getElementById('threatModelAssignmentsContainer');
  }
  if (!container) return;
  
  container.innerHTML = `
    <div class="alert alert-warning">
      <i class="bi bi-exclamation-triangle-fill me-2"></i>
      ${message || 'Unable to load threat models. Please try again later.'}
      <button class="btn btn-sm btn-outline-primary ms-3" onclick="window.location.reload()">
        Refresh Page
      </button>
    </div>
  `;
}

/**
 * Get the status class for a threat model status
 */
function getStatusClass(status) {
  switch(status) {
    case 'Active': return 'success';
    case 'Draft': return 'secondary';
    case 'In Review': return 'info';
    case 'Approved': return 'primary';
    case 'Deprecated': return 'warning';
    default: return 'secondary';
  }
}
