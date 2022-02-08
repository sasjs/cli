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
import { updateScriptTag } from '../updateScriptTag'
import { setConstants } from '../../../../utils'

describe('updateScriptTag', () => {
  let destinationPath: string

  beforeAll(async () => {
    destinationPath = path.join(
      __dirname,
      `cli-test-web-updateScriptTag-${generateTimestamp()}`
    )
    await createFolder(destinationPath)
    process.projectDir = destinationPath
    await setConstants()
  })

  afterAll(async () => {
    await deleteFolder(destinationPath)
  })

  it(`should create program for SAS9 having base64 encoded content`, async () => {
    const scriptTag: HTMLScriptElement = document.createElement('script')

    const sourcePath = path.join(__dirname, 'testFiles')
    const target = { serverType: ServerType.Sas9 } as any as Target
    const assetPathMap = []

    const script1Filename = 'script1.js'
    const script1SASProgramName = 'script1-js.sas'
    const script1Base64 = `O1sn4pWQJywgJ+KVpCcsICfilZQnLCAn4pWXJywgJ+KVkCcsICfilacnLCAn4pWaJywgJ+KVnScsICfilZEnLCAn4pWfJywgJ+KUgCcsICfilLwnLCAn4pWRJywgJ+KVoicsICfilIInXQ`

    scriptTag.setAttribute('src', script1Filename)
    const sasProgramScript1Path = path.join(
      destinationPath,
      script1SASProgramName
    )
    assetPathMap.push({
      source: script1Filename,
      target: sasProgramScript1Path
    })

    await updateScriptTag(
      scriptTag,
      sourcePath,
      destinationPath,
      target.serverType,
      assetPathMap
    )
    expect(scriptTag.getAttribute('src')).toEqual(sasProgramScript1Path)

    const content1 = await readFile(sasProgramScript1Path)
    expect(content1).toEqual(expect.stringContaining(`put '${script1Base64}`))

    const script2Filename = './script2.js'
    const script2SASProgramName = 'script2-js.sas'
    const script2Base64 = `O1snxKYnLCAnxpUnLCAn0qInLCAn0ronLCAn04cnLCAn1IonXQ`
    scriptTag.setAttribute('src', script2Filename)
    const sasProgramScript2Path = path.join(
      destinationPath,
      script2SASProgramName
    )
    assetPathMap.push({
      source: script2Filename,
      target: sasProgramScript2Path
    })

    await updateScriptTag(
      scriptTag,
      sourcePath,
      destinationPath,
      target.serverType,
      assetPathMap
    )
    expect(scriptTag.getAttribute('src')).toEqual(sasProgramScript2Path)

    const content2 = await readFile(sasProgramScript2Path)
    expect(content2).toEqual(expect.stringContaining(`put '${script2Base64}`))
  })

  it(`should update links in js file`, async () => {
    const sourcePath = path.join(__dirname, 'testFiles')
    const gameTestFilePath = path.join(sourcePath, 'script3.js')

    const target = { serverType: ServerType.SasViya } as any as Target

    const assetPathMap = [...gameJSSpriteLinks, ...gameJSSoundLinks]

    const scriptTag: HTMLScriptElement = document.createElement('script')
    scriptTag.innerHTML = await readFile(gameTestFilePath)

    await updateScriptTag(
      scriptTag,
      sourcePath,
      destinationPath,
      target.serverType,
      assetPathMap
    )

    const updatedContent = scriptTag.innerHTML

    gameJSSpriteLinks.forEach((link) =>
      expect(updatedContent).toContain(link.target)
    )
    gameJSSoundLinks.forEach((link) =>
      expect(updatedContent).toContain(link.target)
    )
  })
})

const gameJSSpriteLinks = [
  {
    source: 'sprites/enemy.png',
    target: 'link-to-compiled-webv/sprites/enemy.png'
  },
  {
    source: 'sprites/enemyr.png',
    target: 'link-to-compiled-webv/sprites/enemyr.png'
  },
  {
    source: 'sprites/items.png',
    target: 'link-to-compiled-webv/sprites/items.png'
  },
  {
    source: 'sprites/player.png',
    target: 'link-to-compiled-webv/sprites/player.png'
  },
  {
    source: 'sprites/playerl.png',
    target: 'link-to-compiled-webv/sprites/playerl.png'
  },
  {
    source: 'sprites/tiles.png',
    target: 'link-to-compiled-webv/sprites/tiles.png'
  }
]
const gameJSSoundLinks = [
  {
    source: 'sounds/aboveground_bgm.ogg',
    target: 'link-to-compiled-webv/sounds/aboveground_bgm.ogg'
  },
  {
    source: 'sounds/breakblock.wav',
    target: 'link-to-compiled-webv/sounds/breakblock.wav'
  },
  {
    source: 'sounds/bump.wav',
    target: 'link-to-compiled-webv/sounds/bump.wav'
  },
  {
    source: 'sounds/coin.wav',
    target: 'link-to-compiled-webv/sounds/coin.wav'
  },
  {
    source: 'sounds/fireball.wav',
    target: 'link-to-compiled-webv/sounds/fireball.wav'
  },
  {
    source: 'sounds/flagpole.wav',
    target: 'link-to-compiled-webv/sounds/flagpole.wav'
  },
  {
    source: 'sounds/itemAppear.wav',
    target: 'link-to-compiled-webv/sounds/itemAppear.wav'
  },
  {
    source: 'sounds/jump-small.wav',
    target: 'link-to-compiled-webv/sounds/jump-small.wav'
  },
  {
    source: 'sounds/jump-super.wav',
    target: 'link-to-compiled-webv/sounds/jump-super.wav'
  },
  {
    source: 'sounds/kick.wav',
    target: 'link-to-compiled-webv/sounds/kick.wav'
  },
  {
    source: 'sounds/mariodie.wav',
    target: 'link-to-compiled-webv/sounds/mariodie.wav'
  },
  {
    source: 'sounds/pipe.wav',
    target: 'link-to-compiled-webv/sounds/pipe.wav'
  },
  {
    source: 'sounds/powerup.wav',
    target: 'link-to-compiled-webv/sounds/powerup.wav'
  },
  {
    source: 'sounds/stage_clear.wav',
    target: 'link-to-compiled-webv/sounds/stage_clear.wav'
  },
  {
    source: 'sounds/stomp.wav',
    target: 'link-to-compiled-webv/sounds/stomp.wav'
  },
  {
    source: 'sounds/underground_bgm.ogg',
    target: 'link-to-compiled-webv/sounds/underground_bgm.ogg'
  }
]
