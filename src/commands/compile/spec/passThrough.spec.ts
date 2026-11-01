import path from 'path'
import { ServerType, Target } from '@sasjs/utils'
import { createFile, createFolder, deleteFolder, readFile } from '@sasjs/utils'
import { generateUniqueTimestamp } from '../../../utils/test'
import { setConstants } from '../../../utils'
import { compileFile, getCompileTree, shouldPassThrough } from '../internal'

const jsService = `/**
  @file getdata.js
  @brief returns rows for a dropdown
**/

const nodePath = require('path')

function rows() {
  return [{ LIBDS: 'SASControlTable' }]
}
`

const buildTarget = (serverType: ServerType, name: string) =>
  ({
    name,
    appLoc: '/Public/app',
    serverType,
    serviceConfig: {},
    jobConfig: {},
    buildConfig: {}
  }) as unknown as Target

describe('pass-through files', () => {
  beforeAll(async () => {
    await setConstants(false)
  })

  describe('shouldPassThrough', () => {
    it('passes a .js file through', () => {
      expect(shouldPassThrough('getdata.js')).toBe(true)
    })

    it('passes a file with no extension through', () => {
      expect(shouldPassThrough('payload')).toBe(true)
    })

    it('does not pass a .sas file through', () => {
      expect(shouldPassThrough('getdata.sas')).toBe(false)
    })
  })

  describe('compileFile', () => {
    let folderPath: string
    let filePath: string

    beforeEach(async () => {
      folderPath = path.join(
        __dirname,
        `cli-tests-pass-through-${generateUniqueTimestamp()}`
      )
      await createFolder(folderPath)
      filePath = path.join(folderPath, 'getdata.js')
      await createFile(filePath, jsService)
    })

    afterEach(async () => {
      await deleteFolder(folderPath)
    })

    // The same project must produce the same pack whatever the target: a file
    // that is not SAS is shipped as written, not reinterpreted per server type.
    for (const serverType of [
      ServerType.Sasjs,
      ServerType.SasViya,
      ServerType.Sas9
    ]) {
      it(`leaves the file untouched on ${serverType}`, async () => {
        const target = buildTarget(serverType, 'pass-through-test')

        await compileFile(
          target,
          filePath,
          [],
          [],
          undefined,
          getCompileTree(target),
          'service' as any,
          folderPath
        )

        await expect(readFile(filePath)).resolves.toEqual(jsService)
      })
    }
  })
})
