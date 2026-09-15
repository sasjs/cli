# Contributing to the SASjs CLI

Thanks for helping improve `@sasjs/cli`. This covers local setup, and the two repo-specific things that are easy to get wrong: CI runs on Windows as well as Linux, and all zip handling goes through `yauzl` / `yazl`.

## Setup

1. Clone the repo and install dependencies (`npm install`).
2. One-time setup: point git at this repo's hooks directory:

```
  git config core.hooksPath ./.git-hooks
```

This enables the pre-commit checks (gitleaks secret scan, 2MB commit size limit). This step is required because the repo's `.npmrc` sets `ignore-scripts=true`, so the `prepare` script that would configure the hooks path automatically never runs on install. If you skip it, your commits are not scanned for secrets and you may push them that way.

Commit messages must follow the [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/#summary) standard - the `commit-msg` hook rejects anything that does not match `type(scope): subject`.

## Running the tests

```
  npm run test:mocked   # jest.config.js - mocked tests, no server needed
  npm run test:server   # jest.server.config.js - runs against a local sasjs/server
  npm test              # both, in that order
```

`npm run lint` runs `prettier --check` over `src` and `test`.

## CI runners - Ubuntu and Windows

Tests run on both `ubuntu-latest` and `windows-latest` (`run-tests.yml` and `run-tests-windows.yml`), so a spec that passes locally on Linux can still fail CI on the Windows leg. `chmod` is a no-op on NTFS and unprivileged symlink creation is blocked, so any spec that asserts unix mode bits (for example the exec bit on a `.git-hooks` file) or creates a symlink must guard the assertion and return early:

```ts
import { isWindows } from '@sasjs/utils'

// chmod exec bits are a no-op on Windows
if (isWindows()) return
```

`src/utils/spec/zip.spec.ts` has working examples of both guards.

## Zip handling - yauzl and yazl, not adm-zip

adm-zip was replaced in #1467 ([GHSA-vwc7-r8mq-g2x9](https://github.com/advisories/GHSA-vwc7-r8mq-g2x9): extraction followed destination symlinks, allowing arbitrary file overwrite) with `yauzl` for extraction and `yazl` for creation.

- Extraction goes through `extractZip(zipPath, destDir, overwrite)` in `src/utils/zip.ts`. It never follows a symlink at the destination - every path component is `lstat`-checked and extraction aborts if a symlink is found where a directory or file is expected - and it preserves unix mode bits, which seed apps need for the `.git-hooks` files that git requires to be executable. Overwriting existing regular files is opt-in (`overwrite` defaults to `false`) and existing symlinks are never written through.
- Zips are written with `yazl` - see `src/utils/compressAndSave.ts`. Specs that need a zip fixture build one in memory with `yazl.ZipFile.addBuffer` rather than committing a binary fixture.
- Do not reintroduce adm-zip while its advisory range (`>= 0.5.9, <= 0.6.0`) has no patched release upstream.
