/**
 * Mock Rapid7 Assets Data
 */

module.exports = [
  {
    "id": "asset-001",
    "name": "Web Application Server",
    "hostname": "webapp-server-01",
    "ip_address": "10.0.1.10",
    "operating_system": "Ubuntu 22.04 LTS",
    "site_id": "site-001",
    "risk_score": 85,
    "last_scan_date": "2025-03-24T12:00:00Z",
    "tags": ["production", "web", "critical"]
  },
  {
    "id": "asset-002",
    "name": "Database Server",
    "hostname": "db-server-01",
    "ip_address": "10.0.1.11",
    "operating_system": "Red Hat Enterprise Linux 9",
    "site_id": "site-001",
    "risk_score": 78,
    "last_scan_date": "2025-03-24T12:30:00Z",
    "tags": ["production", "database", "critical"]
  },
  {
    "id": "asset-003",
    "name": "API Gateway",
    "hostname": "api-gateway-01",
    "ip_address": "10.0.1.12",
    "operating_system": "Amazon Linux 2",
    "site_id": "site-002",
    "risk_score": 65,
    "last_scan_date": "2025-03-24T13:00:00Z",
    "tags": ["production", "api", "critical"]
  },
  {
    "id": "asset-004",
    "name": "Authentication Server",
    "hostname": "auth-server-01",
    "ip_address": "10.0.1.13",
    "operating_system": "Ubuntu 22.04 LTS",
    "site_id": "site-002",
    "risk_score": 72,
    "last_scan_date": "2025-03-24T13:30:00Z",
    "tags": ["production", "auth", "critical"]
  },
  {
    "id": "asset-005",
    "name": "Development Server",
    "hostname": "dev-server-01",
    "ip_address": "10.0.2.10",
    "operating_system": "Ubuntu 22.04 LTS",
    "site_id": "site-001",
    "risk_score": 45,
    "last_scan_date": "2025-03-24T14:00:00Z",
    "tags": ["development", "web"]
  },
  {
    "id": "asset-006",
    "name": "Test Database Server",
    "hostname": "test-db-01",
    "ip_address": "10.0.2.11",
    "operating_system": "PostgreSQL on Ubuntu 22.04",
    "site_id": "site-001",
    "risk_score": 38,
    "last_scan_date": "2025-03-24T14:30:00Z",
    "tags": ["test", "database"]
  },
  {
    "id": "asset-007",
    "name": "Load Balancer",
    "hostname": "lb-01",
    "ip_address": "10.0.1.5",
    "operating_system": "NGINX on Ubuntu 22.04",
    "site_id": "site-002",
    "risk_score": 55,
    "last_scan_date": "2025-03-24T15:00:00Z",
    "tags": ["production", "network"]
  },
  {
    "id": "asset-008",
    "name": "Monitoring Server",
    "hostname": "monitor-01",
    "ip_address": "10.0.1.20",
    "operating_system": "Ubuntu 22.04 LTS",
    "site_id": "site-002",
    "risk_score": 42,
    "last_scan_date": "2025-03-24T15:30:00Z",
    "tags": ["production", "monitoring"]
  },
  {
    "id": "asset-009",
    "name": "CI/CD Server",
    "hostname": "jenkins-01",
    "ip_address": "10.0.2.20",
    "operating_system": "Jenkins on Ubuntu 22.04",
    "site_id": "site-001",
    "risk_score": 58,
    "last_scan_date": "2025-03-24T16:00:00Z",
    "tags": ["development", "ci-cd"]
  },
  {
    "id": "asset-010",
    "name": "Storage Server",
    "hostname": "storage-01",
    "ip_address": "10.0.1.30",
    "operating_system": "Ubuntu 22.04 LTS",
    "site_id": "site-002",
    "risk_score": 48,
    "last_scan_date": "2025-03-24T16:30:00Z",
    "tags": ["production", "storage"]
  }
];
