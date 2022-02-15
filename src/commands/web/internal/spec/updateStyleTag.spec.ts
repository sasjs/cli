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
import { updateStyleTag } from '../updateStyleTag'
import { setConstants } from '../../../../utils'

describe('updateStyleTag', () => {
  let destinationPath: string

  beforeAll(async () => {
    destinationPath = path.join(
      __dirname,
      `cli-test-web-updateStyleTag-${generateTimestamp()}`
    )
    await createFolder(destinationPath)
    process.projectDir = destinationPath
    await setConstants()
  })

  afterAll(async () => {
    await deleteFolder(destinationPath)
  })

  it(`should update links in css script`, async () => {
    const sourcePath = path.join(__dirname, 'testFiles')
    const styleFilePath = path.join(sourcePath, 'style1.css')

    const target = { serverType: ServerType.SasViya } as any as Target

    const assetPathMap = [...assetLinks]

    const scriptTag: HTMLStyleElement = document.createElement('style')
    scriptTag.innerHTML = await readFile(styleFilePath)

    await updateStyleTag(
      scriptTag,
      sourcePath,
      destinationPath,
      target.serverType,
      assetPathMap
    )

    const updatedContent = scriptTag.innerHTML

    assetLinks.forEach((link) => expect(updatedContent).toContain(link.target))
  })
})

const assetLinks = [
  {
    source: 'assets/fa-solid-900.ttf',
    target: 'link-to-compiled-webv/assets/fa-solid-900.ttf'
  }
]
