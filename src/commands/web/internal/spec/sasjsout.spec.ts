import { appLocExpression, appLocPattern, sasjsout } from '../sasjsout'

/**
 * How the SAS 9 helper recovers an asset program's appLoc.
 *
 * The rule is baked into the emitted program as a `prxchange` expression. It is
 * evaluated here with the same pattern, so the behaviour is tested rather than
 * the text that carries it: `appLocPattern` is the one source of the pattern, and
 * `appLocExpression` wraps it for SAS.
 */
const resolvedAppLoc = (program: string, streamWebFolder: string) => {
  const match = program.match(new RegExp(appLocPattern(streamWebFolder)))

  return match === null ? undefined : match[1]
}

describe('the appLoc an asset program resolves to', () => {
  it.each([
    ['/Public/app/web/main-js', 'web', '/Public/app'],
    // an appLoc holding a segment with the folder's name: the LAST match wins
    ['/Public/web/app/web/main-js', 'web', '/Public/web/app'],
    // a nested asset folder
    ['/Public/app/web/assets/main-js', 'web/assets', '/Public/app'],
    ['/Public/web/app/web/assets/main-js', 'web/assets', '/Public/web/app'],
    ['/Public/web/web/main-js', 'web', '/Public/web']
  ])('resolves %s with folder %s to %s', (program, folder, expected) => {
    expect(resolvedAppLoc(program, folder)).toEqual(expected)
  })

  it('matches nothing when the program is outside the folder', () => {
    // the SAS falls back to dropping the program's own name in this case
    expect(resolvedAppLoc('/Public/app/other/main-js', 'web')).toBeUndefined()
  })

  it('treats a regex character in the folder as text', () => {
    expect(appLocPattern('web(1)')).toContain('web\\(1\\)')
    expect(resolvedAppLoc('/Public/app/web(1)/main-js', 'web(1)')).toEqual(
      '/Public/app'
    )
  })
})

describe('the SAS 9 stream helper', () => {
  beforeAll(() => {
    process.sasjsConstants = {
      ...process.sasjsConstants,
      sas9GUID: 'abc123'
    } as any
  })

  it('bakes the appLoc expression into the program', () => {
    expect(sasjsout('web')).toContain(appLocExpression('web'))
    expect(sasjsout('web/assets')).toContain(appLocExpression('web/assets'))
  })

  it('applies it with prxchange and falls back when it does not match', () => {
    const macro = sasjsout('web')

    expect(macro).toContain('prxchange("s#^(.*)/web/[^/]*$#$1#",1,pgm)')
    expect(macro).toContain(
      "if appLoc=pgm then appLoc=prxchange('s#/[^/]+$##',1,pgm);"
    )
  })
})
