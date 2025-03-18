# Security Policy

As an Enterprise tool, security is taken seriously by the SASjs team. In general we look to minimise third party dependencies, and we distinguish between production dependencies and development dependencies whenever possible.

In addition we take the following steps:

- Use of Dependabot for automated reporting of security issues.
- Locking versions to prevent upgrades unless explicitly applied.
- We run `npm run audit` as part of the CI build to ensure the dependency tree is clear from warnings. At the moment we ignore the reported Cross-Site Request Forgery vulnerability in Axios because it is mainly related to the browsers and it does not apply to @sasjs/cli.

## Supported Versions

We support only the latest version with security updates. If you would like an earlier version supported, then do [get in touch](https://sasapps.io/contact-us).

## Reporting a Vulnerability

We welcome reponsible disclosures and will act immediately. Please report [here](https://sasapps.io/contact-us) with full details of the vulnerability.
