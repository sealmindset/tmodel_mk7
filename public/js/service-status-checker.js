/**
 * Service Status Checker
 * 
 * Periodically checks Redis, PostgreSQL, Rapid7, OpenAI, and Ollama status and updates the indicators
 */

document.addEventListener('DOMContentLoaded', function() {
  // Initialize tooltips
  const initializeTooltips = () => {
    const tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
    tooltipTriggerList.map(function (tooltipTriggerEl) {
      return new bootstrap.Tooltip(tooltipTriggerEl);
    });
  };

  // Get all status indicators
  const redisIndicator = document.getElementById('redis-status');
  const postgresIndicator = document.getElementById('postgres-status');
  const rapid7Indicator = document.getElementById('rapid7-status');
  const openaiIndicator = document.getElementById('openai-status');
  const ollamaIndicator = document.getElementById('ollama-status');
  
  // Check if indicators exist in the DOM
  if (redisIndicator && openaiIndicator) {
    // Set initial loading state for all indicators
    redisIndicator.classList.add('loading');
    postgresIndicator?.classList.add('loading');
    rapid7Indicator?.classList.add('loading');
    openaiIndicator.classList.add('loading');
    ollamaIndicator?.classList.add('loading');
    
    // Initialize tooltips
    initializeTooltips();
    
    // Function to update status indicators
    const updateStatusIndicators = (statusData) => {
      // Update Redis status
      if (redisIndicator) {
        redisIndicator.classList.remove('loading', 'online', 'offline');
        redisIndicator.classList.add(statusData.redis ? 'online' : 'offline');
        redisIndicator.setAttribute('title', `Redis: ${statusData.redis ? 'Online' : 'Offline'}`);
      }
      
      // Update PostgreSQL status
      if (postgresIndicator) {
        postgresIndicator.classList.remove('loading', 'online', 'offline');
        postgresIndicator.classList.add(statusData.postgres ? 'online' : 'offline');
        postgresIndicator.setAttribute('title', `PostgreSQL: ${statusData.postgres ? 'Connected' : 'Disconnected'}`);
      }
      
      // Update Rapid7 status
      if (rapid7Indicator) {
        rapid7Indicator.classList.remove('loading', 'online', 'offline');
        rapid7Indicator.classList.add(statusData.rapid7 ? 'online' : 'offline');
        rapid7Indicator.setAttribute('title', `Rapid7 API: ${statusData.rapid7 ? 'Connected' : 'Disconnected'}`);
      }
      
      // Update OpenAI status
      if (openaiIndicator) {
        openaiIndicator.classList.remove('loading', 'online', 'offline');
        openaiIndicator.classList.add(statusData.openai ? 'online' : 'offline');
        openaiIndicator.setAttribute('title', `OpenAI API: ${statusData.openai ? 'Connected' : 'Disconnected'}`);
      }
      
      // Update Ollama status
      if (ollamaIndicator) {
        ollamaIndicator.classList.remove('loading', 'online', 'offline');
        ollamaIndicator.classList.add(statusData.ollama ? 'online' : 'offline');
        ollamaIndicator.setAttribute('title', `Ollama: ${statusData.ollama ? 'Connected' : 'Disconnected'}`);
      }
      
      // Refresh tooltips
      const tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
      tooltipTriggerList.forEach(function (tooltipTriggerEl) {
        const tooltip = bootstrap.Tooltip.getInstance(tooltipTriggerEl);
        if (tooltip) {
          tooltip.dispose();
          new bootstrap.Tooltip(tooltipTriggerEl);
        }
      });
    };
    
    // Function to check service status
    const checkServiceStatus = async () => {
      try {
        // Initialize a local status object to store service statuses
        let serviceStatus = {
          redis: false,
          postgres: false,
          rapid7: false,
          openai: false,
          ollama: false,
          timestamp: new Date().toISOString()
        };
        // Direct check for PostgreSQL using the health endpoint
        if (postgresIndicator) {
          try {
            console.log('Checking PostgreSQL status via /health endpoint');
            const pgResponse = await fetch('/health');
            if (pgResponse.ok) {
              const pgData = await pgResponse.json();
              const isConnected = pgData.db === 'UP';
              
              // Update the status in our serviceStatus object to ensure consistent updates
              serviceStatus.postgres = isConnected;
              
              // Immediately update the indicator
              postgresIndicator.classList.remove('loading', 'online', 'offline');
              postgresIndicator.classList.add(isConnected ? 'online' : 'offline');
              postgresIndicator.setAttribute('title', `PostgreSQL: ${isConnected ? 'Connected' : 'Disconnected'}`);
              
              console.log('Direct PostgreSQL check result:', isConnected ? 'Connected' : 'Disconnected');
            } else {
              console.log('PostgreSQL health check HTTP error:', pgResponse.status);
              postgresIndicator.classList.remove('loading', 'online', 'offline');
              postgresIndicator.classList.add('offline');
              postgresIndicator.setAttribute('title', 'PostgreSQL: Disconnected');
              serviceStatus.postgres = false;
            }
          } catch (pgError) {
            console.error('Error checking PostgreSQL health:', pgError);
            postgresIndicator.classList.remove('loading', 'online', 'offline');
            postgresIndicator.classList.add('offline');
            postgresIndicator.setAttribute('title', 'PostgreSQL: Disconnected');
            response.postgres = false;
          }
        }

        // First do a direct check for Rapid7 using the correct endpoint
        // This ensures we're using the same method as the Test Connection button
        if (rapid7Indicator) {
          try {
            // Set a timeout for the fetch to prevent long-running requests
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 3000);
            
            const rapid7ApiUrl = await fetch('/api/rapid7-url', { 
              signal: controller.signal,
              // Add cache-busting to prevent cached responses
              headers: { 'Cache-Control': 'no-cache' }
            }).catch(err => {
              // Silently handle network errors
              clearTimeout(timeoutId);
              return { ok: false, status: 0 };
            });
            
            clearTimeout(timeoutId);
            
            if (rapid7ApiUrl.ok) {
              const { url, apiKey } = await rapid7ApiUrl.json();
              
              if (url) {
                try {
                  // Set another timeout for the Rapid7 API request
                  const controller2 = new AbortController();
                  const timeoutId2 = setTimeout(() => controller2.abort(), 3000);
                  
                  // In development environment, use our mock API instead of direct Rapid7 calls
                  let direct;
                  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
                    console.log('Using mock API for Rapid7 status check in development');
                    direct = await fetch('/mock-api/vulnerabilities', {
                      signal: controller2.signal
                    }).catch(err => {
                      // Silently handle network errors
                      clearTimeout(timeoutId2);
                      return { ok: false };
                    });
                  } else {
                    // In production, use the actual Rapid7 API
                    direct = await fetch(`${url}/vulnerabilities`, {
                      signal: controller2.signal,
                      headers: {
                        'X-Api-Key': apiKey || 'test-api-key'
                      }
                    }).catch(err => {
                      // Silently handle network errors
                      clearTimeout(timeoutId2);
                      return { ok: false };
                    });
                  }
                  
                  clearTimeout(timeoutId2);
                  
                  if (direct.ok) {
                    rapid7Indicator.classList.remove('loading', 'online', 'offline');
                    rapid7Indicator.classList.add('online');
                    rapid7Indicator.setAttribute('title', 'Rapid7 API: Connected');
                    // console.log('Direct Rapid7 check successful');
                  }
                } catch (directError) {
                  console.log('Direct Rapid7 check failed:', directError);
                }
              }
            }
          } catch (rapid7UrlError) {
            console.error('Error getting Rapid7 URL:', rapid7UrlError);
          }
        }
        
        // Now check all services using the status API
        try {
          // Set a timeout for the fetch to prevent long-running requests
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 3000);
          
          const response = await fetch('/api/status?forceCheck=true&provider=all', {
            signal: controller.signal,
            // Add cache-busting to prevent cached responses
            headers: { 'Cache-Control': 'no-cache' }
          }).catch(err => {
            // Silently handle network errors
            clearTimeout(timeoutId);
            return { ok: false };
          });
          
          clearTimeout(timeoutId);
          
          if (response.ok) {
            const data = await response.json();
            // console.log('Service status check results:', data);
            
            // Update our serviceStatus object with the API response
            serviceStatus = { ...serviceStatus, ...data };
            
            // Update the UI with the final status
            updateStatusIndicators(serviceStatus);
          } else {
            // Silently handle HTTP errors
            // Update UI with our local status data
            updateStatusIndicators(serviceStatus);
          }
        } catch (error) {
          // Silently handle other errors
          // Update UI with our local status data
          updateStatusIndicators(serviceStatus);
        }
      } catch (error) {
        // Silently handle errors
        updateStatusIndicators({
          redis: false,
          postgres: false,
          rapid7: false,
          openai: false,
          ollama: false
        });
      }
    };
    
    // Check status immediately
    checkServiceStatus();
    
    // Then check every 15 seconds (more frequent checking)
    setInterval(checkServiceStatus, 15000);
  }
});
