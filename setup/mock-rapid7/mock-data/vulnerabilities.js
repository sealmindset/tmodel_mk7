/**
 * Mock Rapid7 Vulnerabilities Data
 */

module.exports = [
  {
    "id": "vuln-001",
    "title": "Critical SQL Injection Vulnerability",
    "description": "A SQL injection vulnerability exists in the login form that allows attackers to execute arbitrary SQL commands.",
    "severity": "Critical",
    "cvss_score": 9.8,
    "status": "Open",
    "asset_id": "asset-001",
    "site_id": "site-001",
    "discovered_date": "2025-03-15T10:30:00Z",
    "technical_details": "The login form does not properly sanitize user input before using it in SQL queries. An attacker can use specially crafted input to execute arbitrary SQL commands on the database.",
    "remediation_steps": "1. Implement prepared statements or parameterized queries.\n2. Use an ORM that handles SQL escaping automatically.\n3. Apply input validation and sanitization."
  },
  {
    "id": "vuln-002",
    "title": "Outdated OpenSSL Version",
    "description": "The server is running an outdated version of OpenSSL that contains known vulnerabilities.",
    "severity": "High",
    "cvss_score": 8.5,
    "status": "Open",
    "asset_id": "asset-002",
    "site_id": "site-001",
    "discovered_date": "2025-03-16T14:45:00Z",
    "technical_details": "The server is running OpenSSL version 1.0.1, which is vulnerable to multiple CVEs including Heartbleed (CVE-2014-0160).",
    "remediation_steps": "1. Update OpenSSL to the latest version (1.1.1 or higher).\n2. Regenerate all SSL certificates after the update.\n3. Revoke and reissue any potentially compromised certificates."
  },
  {
    "id": "vuln-003",
    "title": "Cross-Site Scripting (XSS) in Search Function",
    "description": "A stored XSS vulnerability exists in the search function that allows attackers to inject malicious scripts.",
    "severity": "Medium",
    "cvss_score": 6.4,
    "status": "In Progress",
    "asset_id": "asset-001",
    "site_id": "site-001",
    "discovered_date": "2025-03-17T09:15:00Z",
    "technical_details": "The search results page does not properly encode user input before rendering it in the HTML response. This allows attackers to inject malicious JavaScript that will be executed in the context of other users' browsers.",
    "remediation_steps": "1. Implement proper output encoding for all user-controlled data.\n2. Use a Content Security Policy (CSP) to restrict script execution.\n3. Consider using a framework that automatically escapes output."
  },
  {
    "id": "vuln-004",
    "title": "Insecure Direct Object Reference",
    "description": "An insecure direct object reference vulnerability exists in the user profile page.",
    "severity": "Medium",
    "cvss_score": 5.9,
    "status": "Open",
    "asset_id": "asset-003",
    "site_id": "site-002",
    "discovered_date": "2025-03-18T16:20:00Z",
    "technical_details": "The user profile page accepts a user ID parameter without proper authorization checks. An attacker can modify this parameter to access other users' profiles.",
    "remediation_steps": "1. Implement proper access control checks for all user-specific resources.\n2. Use indirect references (e.g., session-based tokens) instead of direct object references.\n3. Validate that the requested resource belongs to the authenticated user."
  },
  {
    "id": "vuln-005",
    "title": "Missing HTTP Strict Transport Security (HSTS) Header",
    "description": "The server does not set the HTTP Strict Transport Security header, which may allow downgrade attacks.",
    "severity": "Low",
    "cvss_score": 3.2,
    "status": "Fixed",
    "asset_id": "asset-002",
    "site_id": "site-001",
    "discovered_date": "2025-03-19T11:10:00Z",
    "technical_details": "The server does not include the Strict-Transport-Security header in HTTPS responses, which could allow an attacker to downgrade connections to HTTP and potentially intercept sensitive data.",
    "remediation_steps": "1. Add the Strict-Transport-Security header to all HTTPS responses.\n2. Use a long max-age value (e.g., 31536000 seconds / 1 year).\n3. Consider adding the includeSubDomains directive if appropriate."
  },
  {
    "id": "vuln-006",
    "title": "Sensitive Data Exposure in Error Messages",
    "description": "Detailed error messages expose sensitive information about the application's internal workings.",
    "severity": "Medium",
    "cvss_score": 5.5,
    "status": "Open",
    "asset_id": "asset-004",
    "site_id": "site-002",
    "discovered_date": "2025-03-20T13:40:00Z",
    "technical_details": "Error messages include detailed stack traces, database queries, and server configuration information. This information could be used by attackers to plan more targeted attacks.",
    "remediation_steps": "1. Implement custom error handling that displays generic error messages to users.\n2. Log detailed error information server-side for debugging purposes.\n3. Configure the web server and application framework to suppress detailed error messages in production."
  },
  {
    "id": "vuln-007",
    "title": "Weak Password Policy",
    "description": "The application's password policy does not enforce sufficient complexity requirements.",
    "severity": "Medium",
    "cvss_score": 5.0,
    "status": "Open",
    "asset_id": "asset-001",
    "site_id": "site-001",
    "discovered_date": "2025-03-21T15:25:00Z",
    "technical_details": "The password policy allows passwords as short as 6 characters and does not require a mix of character types. This makes passwords vulnerable to brute force and dictionary attacks.",
    "remediation_steps": "1. Enforce a minimum password length of at least 12 characters.\n2. Require a mix of uppercase, lowercase, numbers, and special characters.\n3. Implement password strength meters to guide users.\n4. Consider implementing multi-factor authentication."
  },
  {
    "id": "vuln-008",
    "title": "Unpatched Apache Log4j Vulnerability (Log4Shell)",
    "description": "The application uses a vulnerable version of Apache Log4j that is susceptible to remote code execution.",
    "severity": "Critical",
    "cvss_score": 10.0,
    "status": "Open",
    "asset_id": "asset-003",
    "site_id": "site-002",
    "discovered_date": "2025-03-22T08:50:00Z",
    "technical_details": "The application uses Log4j version 2.14.1, which is vulnerable to CVE-2021-44228 (Log4Shell). This vulnerability allows attackers to execute arbitrary code on the server by sending specially crafted requests.",
    "remediation_steps": "1. Update Log4j to version 2.17.1 or higher immediately.\n2. If updating is not immediately possible, set the system property 'log4j2.formatMsgNoLookups=true' or remove the JndiLookup class from the classpath.\n3. Monitor for signs of exploitation and conduct a security review."
  },
  {
    "id": "vuln-009",
    "title": "Insecure Deserialization",
    "description": "The application deserializes untrusted data without proper validation, leading to potential remote code execution.",
    "severity": "High",
    "cvss_score": 8.1,
    "status": "In Progress",
    "asset_id": "asset-004",
    "site_id": "site-002",
    "discovered_date": "2025-03-23T10:05:00Z",
    "technical_details": "The application deserializes Java objects from user-controlled input without proper validation or whitelisting. This could allow attackers to execute arbitrary code by providing specially crafted serialized objects.",
    "remediation_steps": "1. Avoid deserializing data from untrusted sources whenever possible.\n2. If deserialization is necessary, implement integrity checks (e.g., digital signatures) to verify the data hasn't been tampered with.\n3. Use safer alternatives like JSON for data exchange.\n4. Consider using serialization filtering (available in Java 9+) to restrict which classes can be deserialized."
  },
  {
    "id": "vuln-010",
    "title": "Misconfigured CORS Policy",
    "description": "The application's CORS policy is misconfigured to allow requests from any origin.",
    "severity": "Medium",
    "cvss_score": 6.5,
    "status": "Open",
    "asset_id": "asset-002",
    "site_id": "site-001",
    "discovered_date": "2025-03-24T14:30:00Z",
    "technical_details": "The Access-Control-Allow-Origin header is set to '*', allowing any website to make cross-origin requests to the application's API. This could lead to unauthorized data access if authentication relies solely on cookies or session tokens.",
    "remediation_steps": "1. Configure CORS to only allow requests from trusted domains.\n2. Use a whitelist approach rather than wildcard origins.\n3. Ensure that sensitive operations require additional verification beyond session cookies.\n4. Consider implementing CSRF tokens for sensitive operations."
  }
];
