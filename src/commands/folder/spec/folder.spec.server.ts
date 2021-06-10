import dotenv from 'dotenv'
import { folder } from '../index'
import { ServerType, Target, generateTimestamp } from '@sasjs/utils'
import {
  removeFromGlobalConfig,
  saveToGlobalConfig
} from '../../../utils/config'
import { Command } from '../../../utils/command'

describe('sasjs folder operations', () => {
  let target: Target

  beforeAll(async () => {
    target = await createGlobalTarget()
    process.projectDir = process.cwd()

  })

  afterAll(async () => {
    await removeFromGlobalConfig(target.name)
  })

  it('list folder children', async () => {
    const timestamp = generateTimestamp()
    const testFolderPath = `/Public/app/cli-tests/cli-tests-folder-${timestamp}`

    await createTestFolder(testFolderPath, target.name)

    const commandList = new Command(
      `folder list /Public/app/cli-tests -t ${target.name}`
    )
    const list: string = (await folder(commandList)) as string

    /**
     * This regex function will pass only if it matches the whole word.
     * It will ignore whitespaces.
     */
    const regex = new RegExp(`(?<!\S)cli-tests-folder-${timestamp}(?!\S)`, 'gm')

    expect(regex.test(list)).toBe(true)

    await deleteTestFolder(testFolderPath, target.name)
  })

  it('move folders keeping the folder name', async () => {
    const timestamp = generateTimestamp()
    const testFolderPath = `/Public/app/cli-tests/cli-tests-folder-${timestamp}`

    await createTestFolder(testFolderPath, target.name)

    const commandList1 = new Command(
      `folder list /Public/app/cli-tests -t ${target.name}`
    )
    const list: string = (await folder(commandList1)) as string

    /**
     * This regex function will pass only if it matches the whole word.
     * It will ignore whitespaces.
     */
    const regex = new RegExp(`(?<!\S)cli-tests-folder-${timestamp}(?!\S)`, 'gm')

    expect(regex.test(list)).toBe(true)

    const commandCreate2 = new Command(
      `folder create ${testFolderPath}/temp/test -t ${target.name}`
    )
    await folder(commandCreate2)

    const commandCreate3 = new Command(
      `folder create ${testFolderPath}/test2 -t ${target.name}`
    )
    await folder(commandCreate3)

    const commandMove = new Command(
      `folder move ${testFolderPath}/temp ${testFolderPath}/test2 -t ${target.name}`
    )
    await folder(commandMove)

    // Check if operations are executed correctly
    const folderList1: string = (await folder(
      new Command(`folder list ${testFolderPath}/test2 -t ${target.name}`)
    )) as string

    /**
     * This regex function will pass only if it matches the whole word.
     * It will ignore whitespaces.
     */
    const regex2 = new RegExp(`(?<!\S)temp(?!\S)`, 'gm')

    expect(regex2.test(folderList1)).toBe(true)

    const folderList2: string = (await folder(
      new Command(`folder list ${testFolderPath}/test2/temp -t ${target.name}`)
    )) as string

    /**
     * This regex function will pass only if it matches the whole word.
     * It will ignore whitespaces.
     */
    const regex3 = new RegExp(`(?<!\S)test(?!\S)`, 'gm')

    expect(regex3.test(folderList2)).toBe(true)

    await deleteTestFolder(testFolderPath, target.name)
  })

  it('move folder to the same location and rename it', async () => {
    const timestamp = generateTimestamp()
    const testFolderPath = `/Public/app/cli-tests/cli-tests-folder-${timestamp}`

    await createTestFolder(testFolderPath, target.name)

    const commandList1 = new Command(
      `folder list /Public/app/cli-tests -t ${target.name}`
    )
    const list1: string = (await folder(commandList1)) as string

    /**
     * This regex function will pass only if it matches the whole word.
     * It will ignore whitespaces.
     */
    const regex = new RegExp(`(?<!\S)cli-tests-folder-${timestamp}(?!\S)`, 'gm')

    expect(regex.test(list1)).toBe(true)

    const commandCreate2 = new Command(
      `folder create ${testFolderPath}/temp/test -t ${target.name}`
    )
    await folder(commandCreate2)

    const commandMove1 = new Command(
      `folder move ${testFolderPath}/temp/test ${testFolderPath}/temp/test_renamed -t ${target.name}`
    )
    await folder(commandMove1)

    // Check if operations are executed correctly
    const folderList1: string = (await folder(
      new Command(`folder list ${testFolderPath}/temp -t ${target.name}`)
    )) as string

    /**
     * This regex function will pass only if it matches the whole word.
     * It will ignore whitespaces.
     */
    const regex2 = new RegExp(`(?<!\S)test_renamed(?!\S)`, 'gm')

    expect(regex2.test(folderList1)).toBe(true)

    await deleteTestFolder(testFolderPath, target.name)
  })

  it('move folder to different location renaming the folder', async () => {
    const timestamp = generateTimestamp()
    const testFolderPath = `/Public/app/cli-tests/cli-tests-folder-${timestamp}`

    await createTestFolder(testFolderPath, target.name)

    const commandList1 = new Command(
      `folder list /Public/app/cli-tests -t ${target.name}`
    )
    const list1: string = (await folder(commandList1)) as string

    /**
     * This regex function will pass only if it matches the whole word.
     * It will ignore whitespaces.
     */
    const regex = new RegExp(`(?<!\S)cli-tests-folder-${timestamp}(?!\S)`, 'gm')

    expect(regex.test(list1)).toBe(true)

    const commandCreate2 = new Command(
      `folder create ${testFolderPath}/temp/test -t ${target.name}`
    )
    await folder(commandCreate2)

    const commandCreate3 = new Command(
      `folder create ${testFolderPath}/test2 -t ${target.name}`
    )
    await folder(commandCreate3)

    const commandMove1 = new Command(
      `folder move ${testFolderPath}/temp ${testFolderPath}/test2/test_renamed -t ${target.name}`
    )
    await folder(commandMove1)

    // Check if operations are executed correctly
    const folderList1: string = (await folder(
      new Command(`folder list ${testFolderPath}/test2 -t ${target.name}`)
    )) as string

    /**
     * This regex function will pass only if it matches the whole word.
     * It will ignore whitespaces.
     */
    const regex2 = new RegExp(`(?<!\S)test_renamed(?!\S)`, 'gm')

    expect(regex2.test(folderList1)).toBe(true)

    await deleteTestFolder(testFolderPath, target.name)
  })
})

const createGlobalTarget = async () => {
  dotenv.config()
  const timestamp = generateTimestamp()
  const targetName = `cli-tests-folder-${timestamp}`

  const serverType: ServerType =
    process.env.SERVER_TYPE === ServerType.SasViya
      ? ServerType.SasViya
      : ServerType.Sas9
  const target = new Target({
    name: targetName,
    appLoc: `/Public/app/cli-tests/${targetName}`,
    serverType,
    serverUrl: process.env.SERVER_URL as string,
    authConfig: {
      client: process.env.CLIENT as string,
      secret: process.env.SECRET as string,
      access_token: process.env.ACCESS_TOKEN as string,
      refresh_token: process.env.REFRESH_TOKEN as string
    }
  })
  await saveToGlobalConfig(target)
  return target
}

const createTestFolder = async (testFolderPath: string, targetName: string) => {
  const commandCreate1 = new Command(
    `folder create ${testFolderPath} -t ${targetName}`
  )
  await folder(commandCreate1)
}

const deleteTestFolder = async (testFolderPath: string, targetName: string) => {
  const commandDelete = new Command(
    `folder delete ${testFolderPath} -t ${targetName}`
  )
  await folder(commandDelete)
}
