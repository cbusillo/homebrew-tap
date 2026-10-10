# Security Policy

## Supported Versions

Security fixes target the current `main` branch. There are no separate
supported release lines.

## Reporting a Vulnerability

Report suspected vulnerabilities privately through GitHub's
[Report a vulnerability](https://github.com/cbusillo/homebrew-tap/security/advisories/new)
form. Do not open a public issue for a vulnerability.

Include the formula name, the commit, the impact, and the smallest steps
that reproduce it.

Do not send credentials, tokens, or other personal data. Use redacted or
made-up values.

This is a single-maintainer project. Reports are handled on a best-effort
basis, and I aim to reply within seven days.

## Scope

Relevant reports include:

- a formula downloading from an unexpected source or without checksum
  verification;
- install steps that change files outside the Homebrew prefix; and
- GitHub Actions supply-chain problems in this tap.

Problems in an installed program itself belong to that program's project,
for example [BD_to_AVP](https://github.com/cbusillo/BD_to_AVP/security).
Problems in Homebrew itself should go to Homebrew.
