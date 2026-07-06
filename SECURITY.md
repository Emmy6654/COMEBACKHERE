# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in the COMEBACKHERE Protocol, please
report it responsibly. **Do not open a public issue.**

Send an email to **<security@comebackhere.io>** with the following details:

- A description of the vulnerability and its potential impact.
- Step-by-step instructions to reproduce the issue.
- Any relevant logs, screenshots, or proof-of-concept code.
- Your preferred contact information for follow-up.

You may encrypt your report using our PGP key, available at
`https://comebackhere.io/.well-known/pgp-key.txt`.

## Scope

The following components are in scope for responsible disclosure:

| Component | Repository / Location |
| --- | --- |
| Soroban smart contracts | `COMEBACKHERE-contracts/` and `contracts/` |
| Backend API | `comebackhere-backend` (separate repo) |
| Frontend application | `frontend/` and `comebackhere-frontend/` |
| Deployment scripts | `scripts/` |
| Docker infrastructure | `docker-compose.yml`, `docker-compose.override.yml` |

### Out of Scope

- Third-party dependencies with their own disclosure processes (Stellar, Soroban
  SDK, React, Vite).
- Social engineering or phishing attacks against maintainers.
- Denial-of-service attacks against public testnet or mainnet infrastructure not
  operated by the COMEBACKHERE team.

## Response SLA

| Stage | Timeline |
| --- | --- |
| Acknowledgement of report | Within **48 hours** |
| Initial triage and severity assessment | Within **5 business days** |
| Patch development and internal review | Within **30 days** for critical/high severity |
| Public disclosure (coordinated) | Within **90 days** of the initial report, or sooner if a fix is released |

We will keep you informed of our progress throughout the process. If you do not
receive an acknowledgement within 48 hours, please follow up to confirm we
received your report.

## Severity Classification

We follow a four-tier severity model:

- **Critical** — Loss of funds, unauthorized contract upgrades, private key
  exposure.
- **High** — Escrow bypass, settlement manipulation, authentication bypass.
- **Medium** — Information disclosure, non-critical access control issues.
- **Low** — Configuration weaknesses, minor information leaks.

## Bug Bounty

We offer bounty rewards for verified vulnerabilities based on severity:

| Severity | Reward Range |
| --- | --- |
| Critical | $5,000 – $25,000 |
| High | $2,000 – $5,000 |
| Medium | $500 – $2,000 |
| Low | $100 – $500 |

Bounty amounts are determined at the sole discretion of the COMEBACKHERE team
based on the impact, quality of the report, and whether the vulnerability was
previously known. Rewards are paid in USDC on the Stellar network.

## Eligibility

To be eligible for a bounty:

- You must be the first to report the vulnerability.
- You must not exploit the vulnerability beyond what is necessary to demonstrate
  it.
- You must not publicly disclose the vulnerability before the agreed-upon
  coordination timeline.
- You must comply with all applicable laws.

## Safe Harbor

We consider security research conducted in accordance with this policy to be
authorized. We will not pursue legal action against researchers who:

- Act in good faith and follow this policy.
- Avoid privacy violations, data destruction, and service disruption.
- Report findings promptly and provide reasonable time for remediation.

## Contact

- **Email:** <security@comebackhere.io>
- **PGP Key:** `https://comebackhere.io/.well-known/pgp-key.txt`

## Supported Versions

| Version | Supported |
| --- | --- |
| Latest on `main` | Yes |
| Previous releases | Best-effort, critical fixes only |
