# Plan: username/password (password-grant) auth for Viya targets

Status: **implemented and verified end-to-end** against https://nextviya.emea.sas.com (2026-08-17): `sasjs auth login -t nextviya` followed by `sasjs run test.sas -t nextviya` executed SAS code and fetched the log, with **no client/secret anywhere**. See 'Live verification findings' below. Lets `sasjs run`, `sasjs deploy` (and every other authenticated command) work against Viya **without a registered OAuth client/secret**.

## Problem

Every authenticated Viya flow in the CLI funnels through `getAuthConfig()` (`src/utils/config.ts`), which previously hard-required a `client` and `secret` (target `authConfig`, `.env.{target}`, or `~/.sasjsrc`). Getting a client/secret requires a SAS administrator to register an OAuth client in SASLogon - a common blocker on shared/demo/customer estates where the person deploying is a regular SAS user.

Verified behaviour (macro-dash, nextviya.emea.sas.com, 2026-08):

- `sasjs cbd -t viya` compiles and builds fine, then fails at deploy: `Deployment failed. Request is not authenticated. Client ID was not found.`
- Meanwhile a plain SAS username/password **is sufficient for every REST operation the deploy needs**: the password grant against the built-in `sas.cli` client (`POST /SASLogon/oauth/token`, `grant_type=password`, basic auth `sas.cli:` with empty secret) returns a full user-impersonation token, and the entire `sasjsbuild/viya.sas` deploy script was successfully executed through the compute REST API (`POST /compute/contexts/{id}/sessions`, `POST /compute/sessions/{id}/jobs`) with that token alone. The only failing call was OAuth client registration (403 - correctly admin-only).

So the gap was not capability, it was purely the CLI's auth plumbing insisting on client/secret.

## Implemented design

The original proposal (storing `VIYA_USER`/`VIYA_PASS` and wiring a password grant into `getAuthConfig`'s credential matrix) was **rejected** during design review:

- Storing a password (even base64) on disk is strictly worse than storing tokens; base64 is obfuscation, not protection.
- `saveTokens()` persists client/secret, so a password-grant branch would either write fake `CLIENT=sas.cli` values (poisoning subsequent runs) or need invasive changes.
- `AuthConfig.client`/`secret` are required strings in `@sasjs/utils`; returning a fabricated `sas.cli` would propagate a lie to all consumers.
- Password expiry/rotation gives a poor silent-failure UX compared to an explicit re-login.

Instead, the password grant is a **dedicated login command** that mints and persists a token pair; all other commands consume the token exactly as before. The password is never stored.

### 1. `sasjs auth login -t <target>` (new command)

Files: `src/commands/auth/authCommand.ts`, `src/commands/auth/login.ts`; registered in `commandFactory.ts`, `commandAliases.ts` and the `subCommandMap` in `commandBase.ts`.

- SASVIYA targets only (clear error otherwise).
- Prompts for username (via `getString`) and password (via `prompts` with a masked `password` input; `prompts` added as a direct dependency).
- Mints a token pair via `getTokensWithPasswordGrant()` and verifies it by calling `GET /identities/users/@currentUser`, printing `Logged in as <id> (<name>)`.
- Persists the pair via `saveTokens()` (local `.env.{target}` or global `~/.sasjsrc`, as before).

**Backward compatibility:** `sasjs auth` was previously an alias of `sasjs add cred`. Bare `sasjs auth -t <target>` (no subcommand) retains that behaviour by delegating to `addCredential()`.

### 2. `getTokensWithPasswordGrant()` / `fetchLoggedInUser()` (`src/utils/auth.ts`)

- `POST {serverUrl}/SASLogon/oauth/token`, `Content-Type: application/x-www-form-urlencoded`, body `grant_type=password&username=..&password=..`, HTTP basic `sas.cli:` (empty secret).
- Uses the adapter's `SasjsRequestClient`, so the target's `httpsAgentOptions` are honoured (self-signed estates). The adapter has **no** password-grant helper (`AuthManager.logIn` is a SAS 9 form/cookie login), so the call is made directly in the CLI using the adapter's request client rather than hand-rolled `fetch`.

### 3. `getAuthConfig()` reorder (`src/utils/config.ts`)

A fresh access token is now returned **before** client/secret are required. Previously the function threw `Client ID was not found` even when a valid, non-expiring `ACCESS_TOKEN` was present. When the token is expiring and no client/secret is configured, the error message now points at `sasjs auth login -t <target>`.

This one change also fixes `sasjs deploy` (`deployToSasViyaWithServicePack`) with a pre-minted `ACCESS_TOKEN` - no separate fix was needed there; the "re-authenticates with client credentials" behaviour in the original problem statement was entirely due to this early throw.

### 4. `saveTokens()` - client/secret now optional

`saveTokens(targetName, access_token, refresh_token, client?, secret?)`. When client/secret are absent (password-grant login), only `ACCESS_TOKEN`/`REFRESH_TOKEN` are written - no fake `CLIENT=sas.cli` values poisoning later runs.

## Command coverage

Everything funnels through `getAuthConfig()`, so no per-command changes are needed for `run`, `request`, `job execute`, `flow execute`, `folder`, `fs`, `context`, `servicepack deploy`. Covered by the reorder + token persistence.

## Limitations / notes

- When the access token expires (12h default), re-run `sasjs auth login -t <target>`. Silent refresh via the `sas.cli` public client has **not** been verified; if it works, the stored (rotating) refresh token could be used - follow-up.
- Requires the password grant to be enabled for the `sas.cli` client (the default on Viya 3.5+/Viya 4) and a local/LDAP account - cannot work on SSO/SAML/MFA-only estates.
- ROPC is deprecated in OAuth 2.1; this flow is intended for dev/demo estates. CI pipelines should still use a properly registered client/secret.

## Tests

- `src/utils/spec/config.spec.ts`: `getAuthConfig` returns a fresh token without client/secret; expiring-token error mentions `sasjs auth login`.
- `src/commands/auth/spec/authCommand.spec.ts`: parsing, login dispatch, legacy bare `sasjs auth` delegating to `addCredential`.

## Out of scope

- OAuth client *registration* via the CLI (`POST /SASLogon/oauth/clients` requires an admin token; a `sasjs auth register-client` helper could be a follow-up).
- SAS 9 / SASJS server targets (SAS 9 already uses user/pass; SASJS server has its own token flow).
- Authorization-code-with-PKCE against `sas.cli` (a viable secret-less *interactive* alternative; more moving parts than the password grant).

## Live verification findings (nextviya.emea.sas.com)

1. **Password grant works**: token minted for `viyademo18`, verified via `/identities/users/@currentUser` (prints `Logged in as viyademo18 (Viyademo18)`). Token carries full `*.user_impersonation` scopes.
2. **`sas.cli` accepts refresh-token grants with an empty secret** - silent refresh was therefore added to `getAuthConfig()`: when no client is configured but a refresh token exists (SASVIYA only), it refreshes via `sas.cli` and re-persists the rotated pair. Verified live.
3. **Estate quirk - 1h access-token TTL** (per-client SASLogon config; `sas.cli` gets 3599s here, not the 12h default). This equals the 1-hour safety margin in both CLI and adapter, so every token is always 'expiring' and every command refreshes. Works, but chatty.
4. **Estate quirk - opaque (non-JWT) refresh tokens**: `isRefreshTokenExpiring()` crashes `jwtDecode` on them. Guarded in the CLI (undecodable = treated as usable; server rejects if actually expired).
5. **Adapter fix required for release**: the adapter's internal `getTokens()` (used by `executeScript` etc.) (a) crashes on opaque refresh tokens and (b) refreshes with `client=undefined` when no client/secret exist. A two-line patch in `node_modules` (guard `isTokenExpiring` decode; default client to `sas.cli` with empty secret) made `sasjs run` fully pass end-to-end. This needs a proper PR against `@sasjs/utils` (auth) / `@sasjs/adapter` and a version bump - without it, `sasjs run` fails on this estate with `Invalid token specified`.
6. **Compute context authorization matters**: `POST /compute/contexts/{id}/sessions` returns instant 403 for this user on `SAS Job Execution compute context`, but works (9s warm session creation) on `SAS Studio compute context`. Fix: set `contextName: 'SAS Studio compute context'` on the target. UX follow-up: `sasjs run` could probe contexts and suggest/fall back to an accessible one.
7. **Cold-start hazard**: the first compute session creations took 8-18 minutes (pod spin-up) and the proxy silently dropped the held POST responses - clients hang forever. Warm creations take ~9s. Nothing the CLI can fix, but worth a note in docs (first `sasjs run` on a cold estate may appear to hang).
8. Confirmed working against the live estate: `auth login`, `context list` (with silent refresh), `run` (twice consecutively - refresh rotation survived the CLI+adapter double-refresh on this estate).

## Open questions

1. ~~Can `sas.cli` refresh?~~ **Answered: yes** - implemented as silent refresh in `getAuthConfig()`.
2. Should `sasjs run` (or `context list`) probe for an *accessible* compute context and fall back to `SAS Studio compute context` when the configured one 403s?
3. Should `sasjs add cred` *offer* `sasjs auth login` when the user has no client/secret? (Currently only advertised via error messages.)
4. `sasjs auth logout` (delete stored tokens) - not implemented.
5. Adapter/utils PR needed before release (see finding 5 above) - without it, `run` on estates with short-TTL `sas.cli` tokens or opaque refresh tokens fails inside the adapter.
