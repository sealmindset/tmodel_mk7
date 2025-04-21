#!/bin/bash

# Setup script for the Mock Rapid7 API Server
# This script creates and configures the mock Rapid7 API server for testing

# Color codes for output formatting
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}Setting up Mock Rapid7 API Server...${NC}"

# Create mock-rapid7 directory if it doesn't exist
if [ ! -d "../mock-rapid7" ]; then
  echo "Creating mock-rapid7 directory..."
  mkdir -p ../mock-rapid7/data
fi

# Copy mock data files
echo "Copying mock data files..."
mkdir -p ../mock-rapid7/mock-data
cp -r ./mock-rapid7/mock-data/* ../mock-rapid7/mock-data/

# Copy server.js
echo "Copying server.js..."
cp ./mock-rapid7/server.js ../mock-rapid7/

# Create package.json if it doesn't exist
if [ ! -f "../mock-rapid7/package.json" ]; then
  echo "Creating package.json..."
  cd ../mock-rapid7
  npm init -y
  cd ../setup
fi

# Install dependencies
echo "Installing dependencies..."
cd ../mock-rapid7
npm install express cors --save
cd ../setup

echo -e "${GREEN}Mock Rapid7 API Server setup completed!${NC}"
echo "To start the mock server, run: node mock-rapid7/server.js"
