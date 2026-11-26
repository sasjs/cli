# The three web artefacts a SASjs build can produce

A project with a frontend has up to three outputs, and they are not
interchangeable. Two are deployed to a server; one is a local site that runs in a
browser with no server at all. Each has its own setting, its own location, and
its own way of being opened.

| Setting | What it is | Where it is built | Where it goes |
| --- | --- | --- | --- |
| `streamWeb: true` | the frontend streamed through the SAS web tier | `<build>/web` and `<build>/<streamServiceName>.html` | `<appLoc>/web/...` and `<appLoc>/<streamServiceName>.html` |
| `streamWeb: true` on `serverType: SASJS` | the compiled frontend published by the SASjs Server app stream | `<build>/publish` | `apps/<streamServiceName>`, opened at `/app/<id>/` |
| `mockWeb: true` | a standalone site whose "backend" is a service worker in the browser | `sasjsresults/mock` by default | nowhere - it is served locally and never deployed |

`mockWeb` is not the server's frontend and is never published. A target may set
both `streamWeb` and `mockWeb`: it then gets all three artefacts.

## Streamed frontend (`streamWeb`)

`compile` (and therefore `cbd`) copies the built app into `<build>/<streamWebFolder>`
- `web` by default - and writes the entry page at the root of the build. After a
deploy:

- the entry page is `<appLoc>/<streamServiceName>.html`, or a stored process at
  `<appLoc>/<streamServiceName>` on SAS 9;
- every asset is fetched through the server's own file route, with the appLoc
  baked into the page (`/SASJobExecution?_FILE=<appLoc>/web/...` on Viya,
  `/StoredProgram?_FILE=<appLoc>/web/...` on SASjs Server, and
  `/SASStoredProcess/?_PROGRAM=...` on SAS 9);
- the backend services stay under `<appLoc>/services/`.

`streamWebFolder` still chooses the folder, but it is relative to the appLoc:
`streamWebFolder: "assets"` puts the assets at `<appLoc>/assets/...`.

A streamed app works only at the appLoc it was built against. Moving the
deployed files somewhere else breaks their links; redeploy instead.

## Published frontend (`serverType: SASJS` with `streamWeb`)

`build` copies the compiled frontend from `streamConfig.webSourcePath` into
`<build>/publish`, adjusts it to be served from an app URL rather than the server
root, and packs it as the `web/` half of the deploy bundle. The adjustments are:

- root-absolute asset references become relative: HTML `src`/`href`/`srcset`/
  `poster`/`data` attributes and a `<base href>`;
- CSS `url(...)` and `@import` become relative too, and are computed against the
  stylesheet's own folder (which is what a browser resolves them against): a
  stylesheet in `assets/` naming `/assets/f.woff2` gets `./f.woff2`, one in
  `css/deep/` gets `../../assets/f.woff2`. An inline `<style>` block or a
  `style=""` attribute uses the document, as the browser does;
- a bundler runtime's public path becomes `./`, so chunks load from the app's
  folder;
- the `<sasjs>` adapter tag names the target's `appLoc` and server type.

Anchor `href`s are left alone: navigation is not an asset, and an absolute link
may name the server's API or another site.

The bundle is:

```
sasjs.app.json    {"name": "<streamServiceName>", "appLoc": "<appLoc>"}
web/              the published frontend
backend/          the deployment written to <appLoc> (services, streamed assets, entry page)
```

The server writes `backend/` to the appLoc, publishes `web/` as
`apps/<name>`, and answers with the app's URL (`/app/<id>/`), which `sasjs deploy`
prints. The id survives a redeploy, so the URL does.

This bundle shape needs **sasjs/server v8.6.0 or later** (the release that carries
`@sasjs/api` 0.48.0, whose `splitAppBundle` reads the halves). An older server does
not recognise the bundle: it writes `web/` and `backend/` to the appLoc as ordinary
folders and publishes nothing. Keep a `serverType: SASJS` target with `streamWeb`
on v8.6.0+.

`<build>/publish` is an input to the pack, not deployment content, and the folder
name is reserved: it is never included in a deployment tree.

## Standalone mock (`mockWeb`)

`build` writes the mock site to `sasjsresults/mock` (or `streamConfig.mockWebFolder`
when set). It is a folder of static files that runs the project's services in a
service worker and keeps its drive in IndexedDB. Changes that IndexedDB rejects
are retained in page memory and retried; closing all pages before a successful
retry can lose them. Reset coordinates live pages and fails if a page cannot
clear its stored state; a suspended or nonresponsive page can cause a timeout.
Concurrent tabs do not provide transactional isolation for independent writes.

```
npx http-server sasjsresults/mock     # or any static server
```

Serve it over HTTP: a service worker does not run from `file://`. Without a
service worker (opening index.html directly, or a host that blocks workers) the
app falls back to the real backend, which is not what this site is for.

The site is not a deployment artefact:

- it is never included in `<name>.json`, `<name>.json.zip`, or a service pack;
- it is never published as the server app;
- `sasjs deploy` does not deploy it.

### Viya adapter jobs in a browser mock

A Viya `mockWeb` build can expose selected project-owned JavaScript service twins
through the adapter's JES path (`useComputeApi: false`). Put a JSON array of
extensionless service paths in `<syncFolder>/viya-mock-jobs.json`, for example:

```json
["services/common/appinit", "services/common/getdata"]
```

Each entry must have a corresponding compiled `services/.../*.js` in the drive
seed. Missing, malformed, or unsafe paths fail the build before replacing the
previous site. Entries are registered only for a `SASVIYA` target; without this
manifest the existing emulator behaviour is unchanged. The project supplies the
JavaScript implementations and any fixture data. The worker never executes SAS.

This is not a general JES implementation: it covers registered services, adapter
CSV table uploads, completion polling and webout only. Results are in worker
memory and can disappear if the worker is terminated; debug logs and arbitrary
jobs are not supported. Raw adapter CSV uploads are held in worker memory, not
persisted on the drive; ordinary Viya file uploads still use the drive. Completed
results and raw uploads each expire ten minutes after creation, and each store is
limited to 100 entries and 20 MiB. At capacity new requests receive 429 rather
than evicting an unexpired result or upload that a concurrent request may need.
An oversized result can be refused after the service has run; its drive writes
may already have occurred. Worker termination clears both stores. These limits
are for the intended single-user mock, not a production job service.
The registered JavaScript runs with the existing mock runtime's drive access, so
only register code the project trusts. Responses identify the emulation with
`x-sasjs-emulated`.

A `mockWebFolder` inside the build folder is allowed, but the build refuses one that
overlaps what it wrote - `services`, `jobs`, `tests`, `db`, `docs`, the streamed
assets folder or `publish` - because the mock build deletes its output folder
before writing, and those folders are not its to replace.

`build` excludes a mock site from the pack by its marker file
(`sasjs.mock.json`), so an explicit `mockWebFolder` inside the build folder - or
one an earlier build left there under a path no longer configured - cannot
contaminate a later pack. A site written before the marker existed, when the
default was `<build>/mock`, is recognised by its shape (a service worker at its
root with the `host/` folder beside it) and excluded too. Other project content
in the build folder is untouched.

## Inspecting and changing an artefact between compile and deploy

`compile` writes the build folder and `build` packs it; `deploy` sends the pack.
The boundary matters:

- Editing anything under `<build>` before `sasjs build` changes the pack.
- Editing or deleting `<build>/publish` before `sasjs build` changes only the
  published frontend inside the pack.
- Changing anything after `sasjs build` does not update `<name>.json`,
  `<name>.json.zip`, or what a server already has. Re-run `sasjs build` (or
  `sasjs cbd`) to repack, and `sasjs deploy` to send it.
- Deleting a local folder does not delete a deployed copy. Redeploy, or remove
  the folder on the server.