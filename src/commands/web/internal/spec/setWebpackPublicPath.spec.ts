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
