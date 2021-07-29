import { folder } from '../index'
import * as deleteFolderModule from '../delete'
import { Target, generateTimestamp } from '@sasjs/utils'
import { removeFromGlobalConfig } from '../../../utils/config'
import { Command } from '../../../utils/command'
import {
  createTestGlobalTarget,
  resetTestAppAndReuse,
  APP_NAMES
} from '../../../utils/test'

jest.mock('../delete')

const mockDeleteFolder = () => {
  jest
    .spyOn(deleteFolderModule, 'deleteFolder')
    .mockImplementation((folderPath, adapter, _) =>
      Promise.resolve(folderPath as any)
    )
}

describe('sasjs folder delete', () => {
  const targetName = `cli-tests-folder-delete-${generateTimestamp()}`
  let target: Target

  beforeAll(async () => {
    target = await createTestGlobalTarget(
      targetName,
      `/Public/app/cli-tests/${targetName}`
    )
    await resetTestAppAndReuse(APP_NAMES.MINIMAL_SEED_APP)
  })

  afterAll(async () => {
    await removeFromGlobalConfig(targetName)
  })

  it('should append appLoc to relative folder paths', async () => {
    const timestamp = generateTimestamp()
    const relativeFolderPath = `test-${timestamp}`

    mockDeleteFolder()

    await expect(
      folder(
        new Command(['folder', 'delete', relativeFolderPath, '-t', targetName])
      )
    ).resolves.toEqual(`${target.appLoc}/test-${timestamp}`)
  })

  it('should leave absolute file paths unaltered', async () => {
    const timestamp = generateTimestamp()
    const absoluteFolderPath = `${target.appLoc}/test-${timestamp}`

    mockDeleteFolder()

    await expect(
      folder(
        new Command(['folder', 'delete', absoluteFolderPath, '-t', targetName])
      )
    ).resolves.toEqual(`${target.appLoc}/test-${timestamp}`)
  })
})
