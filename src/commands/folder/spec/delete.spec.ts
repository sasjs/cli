import { folder } from '../index'
import * as deleteFolderModule from '../delete'
import { generateTimestamp } from '../../../utils/utils'
import { Target } from '@sasjs/utils/types'
import { removeFromGlobalConfig } from '../../../utils/config'
import { Command } from '../../../utils/command'
import {
  createTestGlobalTarget,
  createTestMinimalApp,
  removeTestApp
} from '../../../utils/test'

jest.mock('../delete')

describe('sasjs folder delete', () => {
  const targetName = `cli-tests-folder-delete-${generateTimestamp()}`
  let target: Target

  beforeAll(async (done) => {
    target = await createTestGlobalTarget(
      targetName,
      `/Public/app/cli-tests/${targetName}`
    )
    await createTestMinimalApp(__dirname, targetName)
    jest
      .spyOn(deleteFolderModule, 'deleteFolder')
      .mockImplementation((folderPath, adapter, _) =>
        Promise.resolve(folderPath as any)
      )
    done()
  })

  afterAll(async (done) => {
    await removeFromGlobalConfig(targetName)
    await removeTestApp(__dirname, targetName)
    done()
  })

  it('should append appLoc to relative folder paths', async (done) => {
    const timestamp = generateTimestamp()
    const relativeFolderPath = `test-${timestamp}`

    await expect(
      folder(
        new Command(['folder', 'delete', relativeFolderPath, '-t', targetName])
      )
    ).resolves.toEqual(`${target.appLoc}/test-${timestamp}`)
    done()
  })

  it('should leave absolute file paths unaltered', async (done) => {
    const timestamp = generateTimestamp()
    const absoluteFolderPath = `${target.appLoc}/test-${timestamp}`

    await expect(
      folder(
        new Command(['folder', 'delete', absoluteFolderPath, '-t', targetName])
      )
    ).resolves.toEqual(`${target.appLoc}/test-${timestamp}`)
    done()
  })
})
