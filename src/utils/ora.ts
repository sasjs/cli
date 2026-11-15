/**
 * The ora factory used to render progress spinners.
 *
 * ora 10 publishes an ES module only: `"type": "module"`, an `exports` map and
 * no CommonJS build. This project compiles to CommonJS, and Node resolves an ES
 * module from `require()` since 22.12 - the floor declared in `engines` - so the
 * package is loaded through the real `require` rather than a static import.
 *
 * `createRequire` is deliberate: inside Jest the module-scoped `require` is the
 * test runner's, which cannot load an ES module on Node 22.
 *
 * The type comes from ora's own declarations through an attributed import type,
 * so a change to the spinner API is a compile error here.
 */
import { createRequire } from 'module'
type OraFactory = (typeof import('ora', {
  with: { 'resolution-mode': 'import' }
}))['default']

const requireFromCommonJs = createRequire(__filename)

const ora: OraFactory = requireFromCommonJs('ora').default

export default ora
