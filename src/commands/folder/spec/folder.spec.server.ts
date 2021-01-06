import dotenv from 'dotenv'
import { folder } from '../index'
import { generateTimestamp } from '../../../utils/utils'
import { ServerType, Target } from '@sasjs/utils/types'
import {
  removeFromGlobalConfig,
  saveToGlobalConfig
} from '../../../utils/config'
import { Command } from '../../../utils/command'

describe('sasjs job execute', () => {
  let target: Target

  beforeAll(async (done) => {
    target = await createGlobalTarget()
    process.projectDir = process.cwd()

    done()
  })

  afterAll(async (done) => {
    await removeFromGlobalConfig(target.name)
    done()
  })

  it('list folder children', async (done) => {
    const timestamp = generateTimestamp()
    const testFolderPath = `/Public/app/cli-tests/cli-tests-folder-${timestamp}`

    await createTestFolder(testFolderPath, target.name)

    const commandList1 = new Command(
      `folder list /Public/app/cli-tests -t ${target.name}`
    )
    const list1 = await folder(commandList1)
    expect(list1).toContain(`cli-tests-folder-${timestamp}`)

    await deleteTestFolder(testFolderPath, target.name)
    done()
  })

  it('move folders keeping the folder name', async (done) => {
    const timestamp = generateTimestamp()
    const testFolderPath = `/Public/app/cli-tests/cli-tests-folder-${timestamp}`

    await createTestFolder(testFolderPath, target.name)

    const commandList1 = new Command(
      `folder list /Public/app/cli-tests -t ${target.name}`
    )
    const list1 = await folder(commandList1)
    expect(list1).toContain(`cli-tests-folder-${timestamp}`)

    const commandCreate2 = new Command(
      `folder create ${testFolderPath}/temp/test -t ${target.name}`
    )
    await folder(commandCreate2)

    const commandCreate3 = new Command(
      `folder create ${testFolderPath}/test2 -t ${target.name}`
    )
    await folder(commandCreate3)

    const commandMove1 = new Command(
      `folder move ${testFolderPath}/temp ${testFolderPath}/test2 -t ${target.name}`
    )
    await folder(commandMove1)

    // Check if operations are executed correctly
    let folderList1 = await folder(
      new Command(`folder list ${testFolderPath}/test2 -t ${target.name}`)
    )
    expect(folderList1).toContain('temp')

    let folderList2 = await folder(
      new Command(`folder list ${testFolderPath}/test2/temp -t ${target.name}`)
    )
    expect(folderList2).toContain('test')

    await deleteTestFolder(testFolderPath, target.name)
    done()
  })

  it('move folder to same location renaming the folder', async (done) => {
    const timestamp = generateTimestamp()
    const testFolderPath = `/Public/app/cli-tests/cli-tests-folder-${timestamp}`

    await createTestFolder(testFolderPath, target.name)

    const commandList1 = new Command(
      `folder list /Public/app/cli-tests -t ${target.name}`
    )
    const list1 = await folder(commandList1)
    expect(list1).toContain(`cli-tests-folder-${timestamp}`)

    const commandCreate2 = new Command(
      `folder create ${testFolderPath}/temp/test -t ${target.name}`
    )
    await folder(commandCreate2)

    const commandMove1 = new Command(
      `folder move ${testFolderPath}/temp/test ${testFolderPath}/temp/test_renamed -t ${target.name}`
    )
    await folder(commandMove1)

    // Check if operations are executed correctly
    let folderList1 = await folder(
      new Command(`folder list ${testFolderPath}/temp -t ${target.name}`)
    )
    expect(folderList1).toContain('test_renamed')

    await deleteTestFolder(testFolderPath, target.name)
    done()
  })

  it('move folder to different location renaming the folder', async (done) => {
    const timestamp = generateTimestamp()
    const testFolderPath = `/Public/app/cli-tests/cli-tests-folder-${timestamp}`

    await createTestFolder(testFolderPath, target.name)

    const commandList1 = new Command(
      `folder list /Public/app/cli-tests -t ${target.name}`
    )
    const list1 = await folder(commandList1)
    expect(list1).toContain(`cli-tests-folder-${timestamp}`)

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
    let folderList1 = await folder(
      new Command(`folder list ${testFolderPath}/test2 -t ${target.name}`)
    )
    expect(folderList1).toContain('test_renamed')

    await deleteTestFolder(testFolderPath, target.name)
    done()
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
