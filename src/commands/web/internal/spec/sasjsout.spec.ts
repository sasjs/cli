import { sasjsout } from '../sasjsout'

/**
 * The SAS 9 stream helper, as text.
 *
 * It cannot be executed here, so the properties that decide where an asset's
 * links point are pinned by reading: which folder is baked in, and how the appLoc
 * is recovered from `_program`.
 */
describe('the SAS 9 stream helper', () => {
  beforeAll(() => {
    process.sasjsConstants = {
      ...process.sasjsConstants,
      sas9GUID: 'abc123'
    } as any
  })

  it('bakes the stream folder into the program', () => {
    expect(sasjsout('web')).toContain('streamfolder=web')
    expect(sasjsout('assets')).toContain('streamfolder=assets')
  })

  it('finds the LAST occurrence of the stream folder in the program path', () => {
    const macro = sasjsout('web')

    // An appLoc may hold a segment with the folder's name: appLoc
    // /Public/web/app with folder web gives the asset program
    // /Public/web/app/web/main.js. Cutting at the first occurrence would report
    // /Public, so the scan has to walk to the end.
    expect(macro).toContain("folder=cats('/&streamfolder/')")
    expect(macro).toContain('from=pos+1')
    // and not the single-shot lookup that has that bug
    expect(macro).not.toContain('pos=index(pgm,cats(')
  })
})
