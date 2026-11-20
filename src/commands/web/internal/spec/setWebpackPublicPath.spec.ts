import { setWebpackPublicPath } from '../setWebpackPublicPath'

/**
 * The public path is what a split bundle joins a chunk's composed file name to,
 * and it is empty in an Angular production build - so every lazily loaded route
 * asks the server root for its chunk. These cases pin the rewrite, and the two
 * refusals that keep it off files that are not a runtime.
 */
describe('setWebpackPublicPath', () => {
  const prefix = '/StoredProgram?_FILE=/Public/app/services/web/'

  it('points a minified Angular runtime at the asset route', () => {
    const runtime =
      '(()=>{var b={};t.u=e=>(76===e?"common":e)+"."+{15:"ba407bec"}[e]+".js",' +
      't.miniCssF=e=>{},t.p="",t.l=(n,o)=>{}})();'

    const updated = setWebpackPublicPath(runtime, prefix)

    expect(updated).toContain(`t.p="${prefix}"`)
    expect(updated).not.toContain('t.p=""')
    // the chunk-name function is untouched: only the prefix changes
    expect(updated).toContain('t.u=e=>(76===e?"common":e)')
  })

  it('replaces a public path the runtime would derive from the document', () => {
    const runtime =
      'var __webpack_require__={};__webpack_require__.u=e=>e+".js";' +
      '__webpack_require__.p="auto";'

    expect(setWebpackPublicPath(runtime, prefix)).toContain(
      `__webpack_require__.p="${prefix}"`
    )
  })

  it('replaces a deploy URL or base href the build carried', () => {
    // `ng build --deploy-url=/deploy/` and a baseHref build both write a literal
    // public path, and a streamed deployment owns where the chunks come from -
    // keeping the build's own answer is the same 404 for a different reason
    const runtime = 'var t={};t.u=e=>e+".js";t.p="/deploy/";'

    expect(setWebpackPublicPath(runtime, prefix)).toContain(`t.p="${prefix}"`)
  })

  it('copies a prefix carrying a `$` instead of reading it as a pattern', () => {
    // a replacement string would read `$&` as the matched text and splice it
    // into the address, corrupting the runtime for an appLoc that holds one
    const runtime = 'var t={};t.u=e=>e+".js";t.p="";'
    const dollarPrefix = '/StoredProgram?_FILE=/Public/$&/services/web/'

    expect(setWebpackPublicPath(runtime, dollarPrefix)).toEqual(
      `var t={};t.u=e=>e+".js";t.p="${dollarPrefix}";`
    )
  })

  it('emits a valid runtime and preserves quotes and backslashes in the prefix', () => {
    const runtime = 'var t={};t.u=e=>e+".js";t.p="";t.p;'
    const configuredPrefix = '/StoredProgram?_FILE=/Public/a"b\\c/services/web/'
    const updated = setWebpackPublicPath(runtime, configuredPrefix)

    expect(require('vm').runInNewContext(updated)).toBe(configuredPrefix)
  })

  it('skips an unrelated assignment preceding the runtime', () => {
    const script = 'var a={};a.p="";var t={};t.u=e=>e+".js";t.p="";'
    expect(setWebpackPublicPath(script, prefix)).toBe(
      `var a={};a.p="";var t={};t.u=e=>e+".js";t.p="${prefix}";`
    )
  })

  it('leaves a file that does not name chunks alone', () => {
    // a public path on its own is not a runtime: something else owns `p` here,
    // and rewriting it would be a change we cannot reason about
    const script = 'var a={};a.p="";console.log(a.p)'

    expect(setWebpackPublicPath(script, prefix)).toEqual(script)
  })

  it('leaves a runtime whose public path belongs to another object alone', () => {
    const script = 'var a={};a.p="";var b={};b.u=e=>e+".js";'

    expect(setWebpackPublicPath(script, prefix)).toEqual(script)
  })

  it('leaves a file with no public path assignment alone', () => {
    const script = 'console.log(1);'

    expect(setWebpackPublicPath(script, prefix)).toEqual(script)
  })
})
