/**
 * The chalk instance shared by every part of the CLI.
 *
 * chalk 6 publishes an ES module only: `"type": "module"`, an `exports` map and
 * no CommonJS build. This project compiles to CommonJS, and Node resolves an ES
 * module from `require()` since 22.12 - the floor declared in `engines` - so the
 * package is loaded through the real `require` rather than a static import.
 *
 * `createRequire` is deliberate: inside Jest the module-scoped `require` is the
 * test runner's, which cannot load an ES module on Node 22.
 *
 * The type comes from chalk's own declarations through an attributed import
 * type, because `exports`-only types are invisible to this project's
 * `moduleResolution`.
 */
import { createRequire } from 'module'
import type { ChalkInstance } from 'chalk' with { 'resolution-mode': 'import' }

const requireFromCommonJs = createRequire(__filename)

const chalk: ChalkInstance = requireFromCommonJs('chalk').default

export default chalk
