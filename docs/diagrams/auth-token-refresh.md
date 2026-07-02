# Access/refresh token & auth config logic (SAS Viya)

Scope: `src/utils/auth.ts`, `src/utils/config.ts`. Two entry points resolve
credentials for a `Target`; they differ in one critical way (persistence). Read the
"Critical invariant" section before touching either.

## Entry points comparison

```mermaid
flowchart TD
    subgraph getAuthConfig["getAuthConfig(target) — config.ts:600 — use this from any command"]
        A1["read access_token: target.authConfig.access_token\nelse overrideEnvVariables(target.name) + process.env.ACCESS_TOKEN"] --> A2["read client/secret/refresh_token\ntarget.authConfig.* else process.env.CLIENT/SECRET/REFRESH_TOKEN"]
        A2 --> A3{"client missing?"}
        A3 -->|yes| A3E["throw 'Client ID was not found...'"]
        A3 -->|no| A4{"secret missing?"}
        A4 -->|yes, not Sasjs server| A4E["throw 'Client secret was not found...'"]
        A4 -->|no| A5{"isAccessTokenExpiring(access_token)\nauth.ts:37 — exp - now <= 1hr"}
        A5 -->|no| A6["return {access_token, refresh_token, client, secret}"]
        A5 -->|yes| A7{"isRefreshTokenExpiring(refresh_token)\nauth.ts:54 — exp - now <= 30s"}
        A7 -->|yes: refresh token dead too| A8["getNewAccessToken(...) auth.ts:79\nINTERACTIVE: prompts user for auth code via browser URL"]
        A7 -->|no: refresh token still valid| A9["refreshTokens(sasjs, client, secret, refresh_token) auth.ts:64\ncalls sasjsInstance.refreshTokens → NEW access_token + NEW refresh_token"]
        A8 --> A10["saveTokens(target.name, client, secret, access_token, refresh_token) config.ts:684\n★ persists new pair to .env.{target} (local) or ~/.sasjsrc authConfig (global)"]
        A9 --> A10
        A10 --> A6
    end
```

```mermaid
flowchart TD
    subgraph getAccessToken["getAccessToken(target) — config.ts:772 — test-cleanup only"]
        B1["read accessToken: target.authConfig.access_token\nelse overrideEnvVariables(target.name) + process.env.ACCESS_TOKEN"] --> B2{"accessToken still empty?"}
        B2 -->|yes| B2E["throw 'A valid access token was not found...'"]
        B2 -->|no| B3{"checkIfExpiring && isAccessTokenExpiring(accessToken)"}
        B3 -->|no| B6["return accessToken"]
        B3 -->|yes| B4["read client/secret/refresh_token from\ntarget.authConfig.* or process.env.*\n(throws if client/secret missing, same messages as getAuthConfig)"]
        B4 --> B5{"isRefreshTokenExpiring(refresh_token)"}
        B5 -->|yes| B7["getNewAccessToken(...) — interactive"]
        B5 -->|no| B8["refreshTokens(...) → NEW access_token + NEW refresh_token"]
        B7 --> B9["accessToken = tokens.access_token\nnew refresh_token is not written to disk"]
        B8 --> B9
        B9 --> B6
    end
```

## Callers

```mermaid
flowchart LR
    deploy["deployToSasViyaWithServicePack.ts"] --> getAuthConfig
    folder["folderCommand.ts"] --> getAuthConfig
    job["job/internal/execute/viya.ts"] --> getAuthConfig
    request["request.ts / flow / context"] --> getAuthConfig
    testCleanup["utils/test.ts: removeTestServerFolder()"] --> getAccessToken
```

## Critical invariant

- **Any code path that can be invoked again in a later, separate process** (i.e. any
  real CLI command) **must persist a refreshed token pair** — use `getAuthConfig()`.
  SAS Viya issues single-use, rotating refresh tokens: every `refreshTokens()` call
  invalidates the refresh token it was given and returns a new one, so the new pair
  has to be written back to disk or the next invocation has nothing valid to use.
- **`getAccessToken()` never persists.** Safe only for same-process, one-shot use that
  nothing else depends on afterward — currently only `removeTestServerFolder()` in
  `src/utils/test.ts:94` (test cleanup).
- Expiry thresholds: access token refreshed if `exp - now <= 3600s` (1hr);
  refresh token considered dead if `exp - now <= 30s`.
- If the refresh token is dead, both entry points fall back to `getNewAccessToken()`,
  which is **interactive** (prints a URL, prompts for an auth code) — unsuitable for
  unattended/CI use.
- Persistence target depends on where the target lives: local `sasjsconfig.json` →
  writes `.env.{targetName}`; global `~/.sasjsrc` → writes into that target's
  `authConfig` object directly (`saveTokens`, config.ts:684).
