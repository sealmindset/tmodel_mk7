/**
 * Mock Rapid7 Sites Data
 */

module.exports = [
  {
    "id": "site-001",
    "name": "Corporate Headquarters",
    "description": "Main corporate headquarters infrastructure",
    "importance": "Critical",
    "asset_count": 6,
    "vulnerability_count": 24,
    "risk_score": 78,
    "last_scan_date": "2025-03-24T16:30:00Z"
  },
  {
    "id": "site-002",
    "name": "Data Center",
    "description": "Primary data center infrastructure",
    "importance": "Critical",
    "asset_count": 4,
    "vulnerability_count": 18,
    "risk_score": 65,
    "last_scan_date": "2025-03-24T17:00:00Z"
  },
  {
    "id": "site-003",
    "name": "Development Environment",
    "description": "Development and testing environment",
    "importance": "Medium",
    "asset_count": 3,
    "vulnerability_count": 12,
    "risk_score": 45,
    "last_scan_date": "2025-03-24T17:30:00Z"
  },
  {
    "id": "site-004",
    "name": "Remote Office",
    "description": "Remote office infrastructure",
    "importance": "Low",
    "asset_count": 2,
    "vulnerability_count": 8,
    "risk_score": 35,
    "last_scan_date": "2025-03-24T18:00:00Z"
  }
];
