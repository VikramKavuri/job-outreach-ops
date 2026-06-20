# Security policy

## Supported surface

Security fixes target the current `main` branch and the workflow under `workflows/`.

## Reporting a vulnerability

Do not open a public issue containing credentials, personal data, or exploit details. Use the repository host's private vulnerability-reporting feature when enabled, or contact the repository owner privately.

Include the affected node or file, impact, reproduction steps, and a suggested mitigation if known.

## Secret handling

- Never commit n8n credential objects, OAuth tokens, API keys, webhook secrets, or raw exports.
- Store Google CSE and Apify values in the n8n process environment or a managed secret store.
- Bind Google Sheets, Gmail, and Gemini credentials inside the target n8n installation.
- Run `npm run validate` before every commit.
- Rotate a credential immediately if it appears in a commit, build log, screenshot, issue, or pull request.

The original project artifact contained live-looking Google CSE and Apify values. The repository version is sanitized, but those credentials must still be revoked and replaced because deleting text does not invalidate a secret.

## Data protection

This workflow processes resume data, names, profile URLs, and potentially email addresses. Limit access, define a retention period, avoid logging payloads, and comply with applicable privacy law and source-platform terms. Gmail remains draft-only so a human can verify recipient, claims, tone, and lawful purpose.
