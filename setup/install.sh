#!/bin/bash

# TModel MK7 Installation Script
# This script installs all dependencies and sets up the TModel MK7 application
# for macOS environments

# Color codes for output formatting
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Print banner
echo -e "${BLUE}"
echo "============================================================"
echo "  TModel MK7 Installation Script"
echo "  Enterprise Security Architecture Management Platform"
echo "============================================================"
echo -e "${NC}"

# Check if running as root and exit if true
if [ "$EUID" -eq 0 ]; then
  echo -e "${RED}Please do not run this script as root or with sudo.${NC}"
  exit 1
fi

# Create log directory
mkdir -p logs
LOG_FILE="logs/install_$(date +%Y%m%d_%H%M%S).log"
touch $LOG_FILE

# Function to log messages
log() {
  local message="$1"
  local level="${2:-INFO}"
  local timestamp=$(date +"%Y-%m-%d %H:%M:%S")
  echo -e "[$timestamp] [$level] $message" | tee -a $LOG_FILE
}

# Function to check command exists
command_exists() {
  command -v "$1" >/dev/null 2>&1
}

# Function to check system requirements
check_system_requirements() {
  log "Checking system requirements..." "INFO"
  
  # Check if macOS
  if [[ "$(uname)" != "Darwin" ]]; then
    log "This script is designed for macOS only. Detected OS: $(uname)" "ERROR"
    exit 1
  fi
  
  # Check macOS version
  local os_version=$(sw_vers -productVersion)
  log "Detected macOS version: $os_version" "INFO"
  
  # Check if M-series chip
  local chip_type=$(sysctl -n machdep.cpu.brand_string)
  if [[ "$chip_type" == *"Apple"* ]]; then
    log "Detected Apple Silicon: $chip_type" "INFO"
  else
    log "Warning: This application is optimized for Apple Silicon. Detected: $chip_type" "WARNING"
  fi
  
  # Check available memory
  local total_memory=$(sysctl -n hw.memsize)
  local total_memory_gb=$((total_memory / 1024 / 1024 / 1024))
  log "Detected memory: ${total_memory_gb}GB" "INFO"
  
  if [ "$total_memory_gb" -lt 8 ]; then
    log "Warning: At least 8GB of RAM is recommended. Detected: ${total_memory_gb}GB" "WARNING"
  fi
  
  # Check available disk space
  local available_space=$(df -h . | awk 'NR==2 {print $4}')
  log "Available disk space: $available_space" "INFO"
  
  # Check if Homebrew is installed
  if ! command_exists brew; then
    log "Homebrew is not installed. Will install it during setup." "INFO"
  else
    log "Homebrew is already installed: $(brew --version | head -1)" "INFO"
  fi
  
  log "System requirements check completed." "INFO"
}

# Function to install Homebrew if not already installed
install_homebrew() {
  if ! command_exists brew; then
    log "Installing Homebrew..." "INFO"
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    
    # Add Homebrew to PATH for Apple Silicon Macs
    if [[ "$(uname -m)" == "arm64" ]]; then
      echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zprofile
      eval "$(/opt/homebrew/bin/brew shellenv)"
    fi
    
    log "Homebrew installed successfully." "SUCCESS"
  else
    log "Homebrew is already installed." "INFO"
  fi
}

# Function to install Node.js and npm
install_node() {
  if ! command_exists node; then
    log "Installing Node.js..." "INFO"
    brew install node@20
    
    # Ensure node is in PATH
    if [[ "$(uname -m)" == "arm64" ]]; then
      echo 'export PATH="/opt/homebrew/opt/node@20/bin:$PATH"' >> ~/.zprofile
      export PATH="/opt/homebrew/opt/node@20/bin:$PATH"
    else
      echo 'export PATH="/usr/local/opt/node@20/bin:$PATH"' >> ~/.zprofile
      export PATH="/usr/local/opt/node@20/bin:$PATH"
    fi
    
    log "Node.js installed successfully: $(node --version)" "SUCCESS"
  else
    log "Node.js is already installed: $(node --version)" "INFO"
    
    # Check if version is compatible
    local node_version=$(node --version | cut -d 'v' -f 2 | cut -d '.' -f 1)
    if [ "$node_version" -lt 16 ]; then
      log "Node.js version $node_version is too old. Upgrading to Node.js 20..." "WARNING"
      brew install node@20
      
      # Update PATH
      if [[ "$(uname -m)" == "arm64" ]]; then
        echo 'export PATH="/opt/homebrew/opt/node@20/bin:$PATH"' >> ~/.zprofile
        export PATH="/opt/homebrew/opt/node@20/bin:$PATH"
      else
        echo 'export PATH="/usr/local/opt/node@20/bin:$PATH"' >> ~/.zprofile
        export PATH="/usr/local/opt/node@20/bin:$PATH"
      fi
      
      log "Node.js upgraded successfully: $(node --version)" "SUCCESS"
    fi
  fi
  
  # Check npm
  if ! command_exists npm; then
    log "npm not found. Something went wrong with Node.js installation." "ERROR"
    exit 1
  else
    log "npm is installed: $(npm --version)" "INFO"
  fi
}

# Function to install and configure PostgreSQL
install_postgres() {
  if ! command_exists psql; then
    log "Installing PostgreSQL..." "INFO"
    brew install postgresql@15
    
    # Start PostgreSQL service
    brew services start postgresql@15
    
    # Wait for PostgreSQL to start
    sleep 5
    
    # Add to PATH if needed
    if [[ "$(uname -m)" == "arm64" ]]; then
      echo 'export PATH="/opt/homebrew/opt/postgresql@15/bin:$PATH"' >> ~/.zprofile
      export PATH="/opt/homebrew/opt/postgresql@15/bin:$PATH"
    else
      echo 'export PATH="/usr/local/opt/postgresql@15/bin:$PATH"' >> ~/.zprofile
      export PATH="/usr/local/opt/postgresql@15/bin:$PATH"
    fi
    
    log "PostgreSQL installed successfully." "SUCCESS"
  else
    log "PostgreSQL is already installed: $(psql --version)" "INFO"
    
    # Ensure PostgreSQL service is running
    if ! brew services list | grep postgresql | grep started > /dev/null; then
      log "Starting PostgreSQL service..." "INFO"
      brew services start postgresql@15
      sleep 5
    fi
  fi
  
  # Create database and user if they don't exist
  log "Setting up PostgreSQL database and user..." "INFO"
  
  # Get current user
  local current_user=$(whoami)
  
  # Create database user if it doesn't exist
  if ! psql -U $current_user -lqt | cut -d \| -f 1 | grep -qw postgres; then
    log "Creating 'postgres' database..." "INFO"
    createdb postgres
  fi
  
  # Create threat_model schema if it doesn't exist
  psql -U $current_user -d postgres -c "CREATE SCHEMA IF NOT EXISTS threat_model;"
  
  log "PostgreSQL database setup completed." "SUCCESS"
}

# Function to install and configure Redis
install_redis() {
  if ! command_exists redis-server; then
    log "Installing Redis..." "INFO"
    brew install redis
    
    # Start Redis service
    brew services start redis
    
    log "Redis installed successfully." "SUCCESS"
  else
    log "Redis is already installed: $(redis-server --version)" "INFO"
    
    # Ensure Redis service is running
    if ! brew services list | grep redis | grep started > /dev/null; then
      log "Starting Redis service..." "INFO"
      brew services start redis
    fi
  fi
}

# Function to install application dependencies
install_app_dependencies() {
  log "Installing application dependencies..." "INFO"
  
  # Navigate to application directory
  cd "$(dirname "$0")/.." || exit
  
  # Install npm dependencies
  npm install
  
  log "Application dependencies installed successfully." "SUCCESS"
}

# Function to set up environment variables
setup_environment() {
  log "Setting up environment variables..." "INFO"
  
  # Check if .env file exists
  if [ ! -f .env ]; then
    log "Creating .env file from template..." "INFO"
    cp setup/env.template .env
    
    # Generate random session secret
    local session_secret=$(openssl rand -hex 32)
    sed -i '' "s/SESSION_SECRET=.*/SESSION_SECRET=$session_secret/" .env
    
    log ".env file created successfully." "SUCCESS"
  else
    log ".env file already exists. Skipping creation." "INFO"
  fi
}

# Function to run database migrations
run_migrations() {
  log "Running database migrations..." "INFO"
  
  # Navigate to application directory
  cd "$(dirname "$0")/.." || exit
  
  # Run component relations migration
  node database/runMigration.js database/migrations/component_relations.sql
  
  # Run vulnerability tables migration
  node database/runVulnerabilityMigration.js
  
  # Run safeguards migration
  node database/runSafeguardsMigration.js
  
  # Run vulnerabilities columns migration
  node database/runVulnerabilitiesColumnsMigration.js
  
  log "Database migrations completed successfully." "SUCCESS"
}

# Function to set up mock Rapid7 server
setup_mock_rapid7() {
  log "Setting up mock Rapid7 server..." "INFO"
  
  # Navigate to application directory
  cd "$(dirname "$0")/.." || exit
  
  # Check if mock-rapid7 directory exists
  if [ ! -d "mock-rapid7" ]; then
    log "Creating mock-rapid7 directory..." "INFO"
    mkdir -p mock-rapid7
    
    # Create mock Rapid7 server files
    cp setup/mock-rapid7/* mock-rapid7/
    
    # Install dependencies for mock server
    cd mock-rapid7
    npm init -y
    npm install express cors
    cd ..
    
    log "Mock Rapid7 server setup completed." "SUCCESS"
  else
    log "Mock Rapid7 server already exists. Skipping setup." "INFO"
  fi
}

# Main installation function
main() {
  log "Starting TModel MK7 installation..." "INFO"
  
  # Check system requirements
  check_system_requirements
  
  # Install dependencies
  install_homebrew
  install_node
  install_postgres
  install_redis
  
  # Set up application
  install_app_dependencies
  setup_environment
  run_migrations
  setup_mock_rapid7
  
  log "TModel MK7 installation completed successfully!" "SUCCESS"
  log "To start the application, run: npm start" "INFO"
  log "To start the mock Rapid7 server, run: node mock-rapid7/server.js" "INFO"
}

# Run the main function
main
