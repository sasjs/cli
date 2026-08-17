# Plan: CLI auth hardening for opaque tokens and secret-less configs

Status: **implemented** (branch `cliwarning`, 2026-08-17). Local expiry helpers deleted in favour of `@sasjs/utils/auth`; the try/catch in the `sas.cli` branch and the `as any`/non-null casts are gone (`AuthConfig.client`/`secret` are now optional in utils); `onTokensRefreshed` is threaded through the adapter's compute-execution path and wired to `saveTokens` via `persistTokensRefreshedByAdapter()` for `run`, `fs` and `servicepack deploy`. Dependencies are temporarily installed from local tarballs (`file:../utils/build/...`, `file:../adapter/build/...` in `package.json`) pending release of the utils/adapter PRs - **these must be replaced with released semver ranges before this branch ships**. Follow-up to `PLAN-password-grant-auth.md` (this repo, implemented) and the companion fixes: `PLAN-opaque-refresh-tokens.md` in sasjs/utils (**PR open**: `fix/opaque-refresh-tokens` branch) and `PLAN-public-client-refresh.md` in sasjs/adapter. Findings below verified by reading the current working tree, 2026-08-17.

## Background

`PLAN-password-grant-auth.md` finding 4 states the CLI's token-expiry checks were "guarded" for opaque refresh tokens. That is only **partially true**: the guard exists in exactly one branch of `getAuthConfig()` (the `sas.cli` silent-refresh path, `src/utils/config.ts:665-670`, via a local try/catch). Everywhere else, the CLI's **own copies** of the expiry helpers in `src/utils/auth.ts` still call `jwtDecode` unguarded - and because they are local copies, the `@sasjs/utils` fix does nothing for them.

## Problem 1: unguarded `jwtDecode` call sites remain in the CLI

`src/utils/auth.ts:37` (`isAccessTokenExpiring`) and `src/utils/auth.ts:54` (`isRefreshTokenExpiring`) are duplicates of the `@sasjs/utils/auth` helpers, with the same unguarded decode the utils PR just fixed. Call sites:

- `src/utils/config.ts:648` - `isAccessTokenExpiring(access_token)` at the top of `getAuthConfig`. Unguarded. Low risk today (Viya access tokens are JWTs) but inconsistent, and a crash here kills **every** authenticated command, including the `sas.cli` path whose later refresh-check *is* guarded.
- `src/utils/config.ts:725` - `isRefreshTokenExpiring(refresh_token)` in the **client/secret** branch. Unguarded. An estate that issues opaque refresh tokens *and* has a registered client/secret still crashes here - finding 4's claim does not cover this path.
- `src/utils/config.ts:889` and `:936` (`getAccessToken` / auth-code flow helpers) - unguarded.

**Proposed change**: delete the local copies in `src/utils/auth.ts` and import `isAccessTokenExpiring` / `isRefreshTokenExpiring` from `@sasjs/utils/auth` once the utils release containing the `isTokenExpiring` guard is published and bumped here. Semantics are identical (1h access margin, 30s refresh margin). The try/catch at `config.ts:665-670` can then be dropped - the guarded helper makes it dead code.

Note the behavioural consequence (shared with the utils/adapter changes): for an opaque refresh token, `isRefreshTokenExpiring` / `hasTokenExpired` now return `false`, so the "refresh token has expired" early-errors never fire for opaque tokens - an actually-expired one fails at the server (`invalid_grant`) instead. That is the intended trade-off (the server is the correct authority) but should be called out in the changelog.

## Problem 2: type lies around client/secret-less `AuthConfig`

`AuthConfig` in `@sasjs/utils` declares `client: string` and `secret: string` as **required**. The password-grant flow has neither, and the current code forces it with casts:

- `config.ts:648-653` returns `{ client: client!, secret: undefined as any }` (note the asymmetry: `client` force-unwrapped, `secret` cast to undefined).
- The `sas.cli` branch returns `{ client: undefined as any, secret: undefined as any }`.
- `refresh_token!` non-null assertions in both return paths.

Consequences beyond ugliness:

- The adapter's `getTokens` checks `!client` to decide whether to default to `sas.cli` (per the adapter plan) - that works with `undefined`, but the first return path can yield `client` set with `secret: undefined` (a target with `CLIENT` but no `SECRET` and a fresh token). If the adapter later refreshes with that pair, the basic-auth header becomes `base64("<client>:undefined")`. Edge case, but exactly the class of bug this work is trying to eliminate.
- TypeScript can no longer catch missing-credential bugs in any consumer of `getAuthConfig`.

**Proposed change**: make `client` and `secret` optional (`client?: string`, `secret?: string`) on `AuthConfig` in `@sasjs/utils` (ride along with the opaque-token release or a follow-up minor), then remove the `as any` casts here and let the compiler verify the flows.

## Problem 3: adapter-side refresh rotation is still lost (double-refresh)

Documented in the adapter plan and confirmed live (finding 8): on short-TTL estates (`sas.cli` gets 3599s ≤ the adapter's 3600s margin), the CLI refreshes-and-persists via `getAuthConfig`, then the adapter's internal `getTokens` immediately refreshes **again** and its call sites (`executeOnComputeApi`, `pollJobState`, `SASViyaApiClient`) destructure only `access_token`, discarding the rotated refresh token. The CLI's persisted pair goes stale without the CLI knowing.

It happens to work on nextviya today (verified: consecutive `sasjs run`s succeed), which suggests Viya tolerates brief reuse/overlap of the rotated pair - but that is estate behaviour, not a guarantee, and on a stricter estate the second invocation would fail with `invalid_grant` after the first.

**Proposed change** (after the adapter PR lands): thread the adapter's new `onTokensRefreshed` callback from `getTokens` up through the adapter's public methods the CLI uses (`executeScript`, job polling), and pass a handler from the CLI that calls `saveTokens(target.name, ...)` - the same persistence the CLI already relies on for its own refreshes. Until then, document the hazard in `sasjs auth login --help` output or the auth docs: on short-TTL estates, prefer re-running `sasjs auth login` over assuming a long-lived stored pair.

## Tests

- After delegating to `@sasjs/utils/auth`: opaque refresh token through `getAuthConfig` in the **client/secret** branch (the currently-unguarded `config.ts:725` path) → no `InvalidTokenError`; refresh attempted; rotated pair persisted via `saveTokens`.
- Opaque refresh token in the `sas.cli` branch → unchanged behaviour (the existing try/catch removed, still no throw).
- `getAuthConfig` with `CLIENT` set but no `SECRET` and a fresh token → no `undefined as any` in the returned config (type-level fix, compile check).
- Mock adapter refresh firing `onTokensRefreshed` → CLI handler persists the rotated pair to `.env.{target}` / `~/.sasjsrc`.
- Regression: existing `config.spec.ts` / `authCommand.spec.ts` suites unchanged.

## Sequencing

1. sasjs/utils: merge `fix/opaque-refresh-tokens` (opaque-token guard), optionally with the `AuthConfig` optional-fields change; release.
2. sasjs/adapter: bump utils, implement `sas.cli` default + `onTokensRefreshed` (its own plan); release.
3. This repo: bump both deps; delete local expiry helpers; drop the try/catch and `as any` casts; wire `onTokensRefreshed` → `saveTokens`.

Steps 1-2 unblock the crash fixes; step 3 is this plan.
