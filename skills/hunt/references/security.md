# Security

Based on OWASP Top 10 2025 and OWASP API Security Top 10, adapted for TypeScript/JavaScript.

## Injection (OWASP A03:2025)

### SQL Injection
- String interpolation in SQL: `\`SELECT * FROM ${table}\`` — even from internal sources, fragile
- Template literals containing SQL keywords (SELECT, INSERT, WHERE)
- Missing parameterized queries (prepared statements / bound parameters, whatever the driver provides)

**Grep**: Template literals containing SQL keywords.

### Command Injection
- Subprocess spawns (`child_process.exec`, `Deno.Command`, etc.) with user-controlled arguments
- Shell commands from variables without escaping

### Path Traversal
- File paths from user input without sanitization
- `../` sequences not validated

## Broken Access Control (OWASP A01:2025)
- API endpoints without user identity/role checks
- Object-level: can user A access user B's data by changing an ID?
- Function-level: are admin endpoints protected?
- Sequential/predictable IDs that could be enumerated

## Sensitive Data Exposure (OWASP A02:2025)
- API keys, tokens, passwords in source code
- `.env` files committed to git
- Secrets in error messages or logs
- PII logged in plain text
- Internal details (SQL errors, stack traces) in API responses

**Grep**: `password`, `secret`, `token`, `api_key`, `API_KEY`, `Bearer`

## Security Misconfiguration
- Wildcard `*` CORS origin in production
- Missing security headers (CSP, X-Frame-Options)
- Debug mode in production config
- Development routes accessible in production

## Dependency Vulnerabilities
- Known CVEs in packages
- Imports from URLs without integrity checks

## Error Handling as Security (OWASP A10:2025)
- Stack traces in API responses
- Different error messages for "not found" vs "wrong password" (oracle)
- Auth that defaults to "allow" on error (fail-open)
