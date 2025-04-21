# TModel MK7 Installation Guide

This guide provides detailed instructions for installing and configuring the TModel MK7 Enterprise Security Architecture Management Platform on macOS.

## System Requirements

- **Operating System**: macOS (optimized for Apple Silicon M-series chips)
- **Memory**: 8GB minimum, 16GB+ recommended (compatible with 48GB M4 Mac)
- **Disk Space**: At least 2GB of free disk space
- **Internet Connection**: Required for downloading dependencies

## Installation Options

There are two ways to install TModel MK7:

### Option 1: Automated Installation (Recommended)

The automated installation script will handle all the necessary setup steps for you:

1. Open Terminal
2. Navigate to the TModel MK7 directory
3. Run the installation script:

```bash
cd /path/to/tmodel_mk7
chmod +x setup/install.sh
./setup/install.sh
```

The script will:
- Check system requirements
- Install Homebrew (if not already installed)
- Install Node.js (v20)
- Install PostgreSQL (v15)
- Install Redis
- Set up the application database
- Configure environment variables
- Run database migrations
- Set up the mock Rapid7 server for testing

### Option 2: Manual Installation

If you prefer to install components manually, follow these steps:

#### 1. Install Homebrew

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

For Apple Silicon Macs, add Homebrew to your PATH:
```bash
echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zprofile
eval "$(/opt/homebrew/bin/brew shellenv)"
```

#### 2. Install Node.js

```bash
brew install node@20
```

Add Node.js to your PATH:
```bash
# For Apple Silicon
echo 'export PATH="/opt/homebrew/opt/node@20/bin:$PATH"' >> ~/.zprofile
export PATH="/opt/homebrew/opt/node@20/bin:$PATH"

# For Intel Macs
echo 'export PATH="/usr/local/opt/node@20/bin:$PATH"' >> ~/.zprofile
export PATH="/usr/local/opt/node@20/bin:$PATH"
```

#### 3. Install PostgreSQL

```bash
brew install postgresql@15
brew services start postgresql@15
```

Add PostgreSQL to your PATH:
```bash
# For Apple Silicon
echo 'export PATH="/opt/homebrew/opt/postgresql@15/bin:$PATH"' >> ~/.zprofile
export PATH="/opt/homebrew/opt/postgresql@15/bin:$PATH"

# For Intel Macs
echo 'export PATH="/usr/local/opt/postgresql@15/bin:$PATH"' >> ~/.zprofile
export PATH="/usr/local/opt/postgresql@15/bin:$PATH"
```

Create the database and schema:
```bash
createdb postgres
psql -d postgres -c "CREATE SCHEMA IF NOT EXISTS threat_model;"
```

#### 4. Install Redis

```bash
brew install redis
brew services start redis
```

#### 5. Install Application Dependencies

```bash
cd /path/to/tmodel_mk7
npm install
```

#### 6. Configure Environment Variables

```bash
cp setup/env.template .env
```

Edit the `.env` file to set your configuration options.

#### 7. Run Database Migrations

```bash
node database/runMigration.js database/migrations/component_relations.sql
node database/runVulnerabilityMigration.js
node database/runSafeguardsMigration.js
node database/runVulnerabilitiesColumnsMigration.js
```

#### 8. Set Up Mock Rapid7 Server (Optional)

```bash
mkdir -p mock-rapid7/data
cp setup/mock-rapid7/* mock-rapid7/
cd mock-rapid7
npm init -y
npm install express cors
```

## Starting the Application

After installation, start the application:

```bash
cd /path/to/tmodel_mk7
npm start
```

The application will be available at http://localhost:3000

## Starting the Mock Rapid7 Server (Optional)

If you want to test the Rapid7 integration without a real Rapid7 instance:

```bash
cd /path/to/tmodel_mk7
node mock-rapid7/server.js
```

The mock server will be available at http://localhost:3100

## Troubleshooting

If you encounter any issues during installation:

1. Check the installation logs in the `logs` directory
2. Ensure all services are running:
   ```bash
   brew services list
   ```
3. Verify database connectivity:
   ```bash
   psql -d postgres -c "SELECT 1;"
   ```
4. Check Redis connectivity:
   ```bash
   redis-cli ping
   ```

## Additional Configuration

### LLM Integration

TModel MK7 supports integration with both OpenAI and Ollama for LLM capabilities:

- For OpenAI: Set `LLM_PROVIDER=openai` in your `.env` file and provide your API key
- For Ollama: Set `LLM_PROVIDER=ollama` in your `.env` file and ensure Ollama is running locally

### Production Deployment

For production deployments, make sure to:

1. Use strong, unique passwords for all services
2. Configure proper firewall rules
3. Set up SSL/TLS for secure connections
4. Configure regular database backups
5. Set `NODE_ENV=production` in your `.env` file

## Support

If you need assistance, please open an issue in the project repository or contact the development team.
