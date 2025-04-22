#!/bin/bash
# Complete Installation Script for Threat Model Generator MK7

# Parse command line arguments
VERIFY_ONLY=false

for arg in "$@"
do
  case $arg in
    --verify)
      VERIFY_ONLY=true
      shift
      ;;
    -h|--help)
      echo "Usage: ./install.sh [options]"
      echo "Options:"
      echo "  --verify   Run verification only without installing"
      echo "  --help     Show this help message"
      exit 0
      ;;
  esac
done

# Display header
echo "======================================================"
if [ "$VERIFY_ONLY" = true ]; then
  echo "  Threat Model Generator MK7 - Installation Verification"
else
  echo "  Threat Model Generator MK7 - Installation Script"
fi
echo "======================================================"
echo

# Ensure we're in the project directory
cd "$(dirname "$0")"

# Function to check if a command exists
command_exists() {
  command -v "$1" >/dev/null 2>&1
}

# Check prerequisites
echo "Checking prerequisites..."
if ! command_exists node; then
  echo "❌ Node.js is not installed. Please install Node.js before continuing."
  exit 1
fi

if ! command_exists npm; then
  echo "❌ npm is not installed. Please install npm before continuing."
  exit 1
fi

# Check Node version
NODE_VERSION=$(node -v | cut -d 'v' -f 2)
MAJOR_VERSION=$(echo $NODE_VERSION | cut -d '.' -f 1)

if [ "$MAJOR_VERSION" -lt 14 ]; then
  echo "❌ Node.js version $NODE_VERSION is too old. Please install Node.js 14 or newer."
  exit 1
fi

echo "✅ Node.js v$NODE_VERSION detected"

# Run verification first
echo
echo "Running installation verification..."
npm run verify

# Check if verification was successful
if [ $? -ne 0 ]; then
  echo "❌ Verification failed. Please fix the issues before proceeding."
  exit 1
fi

# If verify-only flag is set, exit here
if [ "$VERIFY_ONLY" = true ]; then
  echo
  echo "======================================================"
  echo "✅ Verification completed. Your system appears ready for installation."
  echo "======================================================"
  echo
  echo "To proceed with installation, run:"
  echo "./install.sh"
  exit 0
fi

# Install dependencies
echo
echo "Installing dependencies..."
npm install

# Check if installation was successful
if [ $? -ne 0 ]; then
  echo "❌ Failed to install dependencies. Please check the error message above."
  exit 1
fi

echo "✅ Dependencies installed successfully"

# Run the setup script
echo
echo "Running setup script..."
npm run setup

# Check if setup was successful
if [ $? -ne 0 ]; then
  echo "❌ Setup failed. Please check the error message above."
  exit 1
fi

echo
echo "======================================================"
echo "✅ Installation completed successfully!"
echo "======================================================"
echo
echo "You can now start the application with:"
echo "npm start"
echo
echo "Or run in development mode with:"
echo "npm run dev"

exit 0
