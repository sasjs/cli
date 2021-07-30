/**
 * @jest-environment jsdom
 */

import path from 'path'
import {
  createFolder,
  deleteFolder,
  generateTimestamp,
  readFile,
  ServerType,
  Target
} from '@sasjs/utils'
import { updateTagSource } from '..'
import { isWindows } from '../../../utils/command'

describe('updateTagSource', () => {
  let destinationPath: string

  beforeAll(async () => {
    destinationPath = path.join(
      __dirname,
      `cli-test-web-updateTagSource-${generateTimestamp()}`
    )
    await createFolder(destinationPath)
    process.projectDir = destinationPath
  })

  afterAll(async () => {
    await deleteFolder(destinationPath)
  })

  it(`should create program for SAS9 having base64 encoded content`, async () => {
    const scriptTag: HTMLLinkElement = document.createElement('link')

    const sourcePath = '../testFiles'
    const target = { serverType: ServerType.Sas9 } as any as Target
    const assetPathMap = []

    const endlineBase64 = isWindows() ? '0K' : 'o='

    const script1Filename = 'script1.js'
    const script1SASProgramName = 'script1-js.sas'
    const script1Base64 = `O1sn4pWQJywgJ+KVpCcsICfilZQnLCAn4pWXJywgJ+KVkCcsICfilacnLCAn4pWaJywgJ+KVnScsICfilZEnLCAn4pWfJywgJ+KUgCcsICfilLwnLCAn4pWRJywgJ+KVoicsICfilIInXQ${endlineBase64}`

    scriptTag.setAttribute('src', script1Filename)
    const sasProgramScript1Path = path.join(
      destinationPath,
      script1SASProgramName
    )
    assetPathMap.push({
      source: script1Filename,
      target: sasProgramScript1Path
    })

    await updateTagSource(
      scriptTag,
      sourcePath,
      destinationPath,
      target,
      assetPathMap
    )
    expect(scriptTag.getAttribute('src')).toEqual(sasProgramScript1Path)

    const content1 = await readFile(sasProgramScript1Path)
    expect(content1).toEqual(expect.stringContaining(`put '${script1Base64}'`))

    const script2Filename = './script2.js'
    const script2SASProgramName = 'script2-js.sas'
    const script2Base64 = `O1snxKYnLCAnxpUnLCAn0qInLCAn0ronLCAn04cnLCAn1IonXQ${endlineBase64}`
    scriptTag.setAttribute('src', script2Filename)
    const sasProgramScript2Path = path.join(
      destinationPath,
      script2SASProgramName
    )
    assetPathMap.push({
      source: script2Filename,
      target: sasProgramScript2Path
    })

    await updateTagSource(
      scriptTag,
      sourcePath,
      destinationPath,
      target,
      assetPathMap
    )
    expect(scriptTag.getAttribute('src')).toEqual(sasProgramScript2Path)

    const content2 = await readFile(sasProgramScript2Path)
    expect(content2).toEqual(expect.stringContaining(`put '${script2Base64}'`))
  })
})
