import dotenv from 'dotenv'
import { ServerType, Target, generateTimestamp, AuthConfig } from '@sasjs/utils'
import { getAuthConfig } from '../../../utils/config'
import { contextName, setConstants } from '../../../utils'
import SASjs from '@sasjs/adapter/node'
import { list } from '../list'
import { create } from '../create'
import { move } from '../move'
import { deleteFolder } from '../delete'

describe('sasjs folder with Viya', () => {
  dotenv.config()
  const timestamp = generateTimestamp()
  const targetName = `cli-tests-folder-${timestamp}`
  const target: Target = new Target({
    name: targetName,
    appLoc: `/Public/app/cli-tests/${targetName}`,
    serverType: ServerType.SasViya,
    contextName,
    serverUrl: process.env.VIYA_SERVER_URL,
    authConfig: {
      client: process.env.CLIENT as string,
      secret: process.env.SECRET as string,
      access_token: process.env.ACCESS_TOKEN as string,
      refresh_token: process.env.REFRESH_TOKEN as string
    }
  })
  const sasjs: SASjs = new SASjs({
    serverUrl: target.serverUrl,
    httpsAgentOptions: target.httpsAgentOptions,
    appLoc: target.appLoc,
    serverType: target.serverType
  })
  let authConfig: AuthConfig

  beforeAll(async () => {
    process.projectDir = process.cwd()
    await setConstants()

    authConfig = await getAuthConfig(target)
  })

  it('lists folder children', async () => {
    const timestamp = generateTimestamp()
    const testFolderPath = `/Public/app/cli-tests/cli-tests-folder-${timestamp}`

    await createTestFolder(testFolderPath, sasjs, authConfig.access_token)

    const folderList: string = (await list(
      '/Public/app/cli-tests',
      sasjs,
      authConfig.access_token
    )) as string

    /**
     * This regex function will pass only if it matches the whole word.
     * It will ignore whitespaces.
     */
    const regex = new RegExp(`(?<!\S)cli-tests-folder-${timestamp}(?!\S)`, 'gm')

    expect(regex.test(folderList)).toBe(true)

    await deleteTestFolder(testFolderPath, sasjs, authConfig.access_token)
  })

  it('move folders keeping the folder name', async () => {
    const timestamp = generateTimestamp()
    const testFolderPath = `/Public/app/cli-tests/cli-tests-folder-${timestamp}`

    await createTestFolder(testFolderPath, sasjs, authConfig.access_token)

    const folderList: string = (await list(
      '/Public/app/cli-tests',
      sasjs,
      authConfig.access_token
    )) as string

    /**
     * This regex function will pass only if it matches the whole word.
     * It will ignore whitespaces.
     */
    const regex = new RegExp(`(?<!\S)cli-tests-folder-${timestamp}(?!\S)`, 'gm')

    expect(regex.test(folderList)).toBe(true)

    await create(
      `${testFolderPath}/temp/test`,
      sasjs,
      authConfig.access_token,
      false
    )

    await create(
      `${testFolderPath}/test2`,
      sasjs,
      authConfig.access_token,
      false
    )

    await move(
      `${testFolderPath}/temp`,
      `${testFolderPath}/test2`,
      sasjs,
      authConfig.access_token
    )

    // Check if operations are executed correctly
    const newFolderList: string = (await list(
      `${testFolderPath}/test2`,
      sasjs,
      authConfig.access_token
    )) as string

    /**
     * This regex function will pass only if it matches the whole word.
     * It will ignore whitespaces.
     */
    const regex2 = new RegExp(`(?<!\S)temp(?!\S)`, 'gm')

    expect(regex2.test(newFolderList)).toBe(true)

    const newSubfolderList: string = (await list(
      `${testFolderPath}/test2/temp`,
      sasjs,
      authConfig.access_token
    )) as string

    /**
     * This regex function will pass only if it matches the whole word.
     * It will ignore whitespaces.
     */
    const regex3 = new RegExp(`(?<!\S)test(?!\S)`, 'gm')

    expect(regex3.test(newSubfolderList)).toBe(true)

    await deleteTestFolder(testFolderPath, sasjs, authConfig.access_token)
  })

  it('move folder to the same location and rename it', async () => {
    const timestamp = generateTimestamp()
    const testFolderPath = `/Public/app/cli-tests/cli-tests-folder-${timestamp}`

    await createTestFolder(testFolderPath, sasjs, authConfig.access_token)

    const folderList: string = (await list(
      '/Public/app/cli-tests',
      sasjs,
      authConfig.access_token
    )) as string

    /**
     * This regex function will pass only if it matches the whole word.
     * It will ignore whitespaces.
     */
    const regex = new RegExp(`(?<!\S)cli-tests-folder-${timestamp}(?!\S)`, 'gm')

    expect(regex.test(folderList)).toBe(true)

    await create(
      `${testFolderPath}/temp/test`,
      sasjs,
      authConfig.access_token,
      false
    )

    await move(
      `${testFolderPath}/temp/test`,
      `${testFolderPath}/temp/test_renamed`,
      sasjs,
      authConfig.access_token
    )

    // Check if operations are executed correctly
    const newFolderList: string = (await list(
      `${testFolderPath}/temp`,
      sasjs,
      authConfig.access_token
    )) as string

    /**
     * This regex function will pass only if it matches the whole word.
     * It will ignore whitespaces.
     */
    const regex2 = new RegExp(`(?<!\S)test_renamed(?!\S)`, 'gm')

    expect(regex2.test(newFolderList)).toBe(true)

    await deleteTestFolder(testFolderPath, sasjs, authConfig.access_token)
  })

  it('move folder to different location renaming the folder', async () => {
    const timestamp = generateTimestamp()
    const testFolderPath = `/Public/app/cli-tests/cli-tests-folder-${timestamp}`

    await createTestFolder(testFolderPath, sasjs, authConfig.access_token)

    const folderList: string = await list(
      '/Public/app/cli-tests',
      sasjs,
      authConfig.access_token
    )

    /**
     * This regex function will pass only if it matches the whole word.
     * It will ignore whitespaces.
     */
    const regex = new RegExp(`(?<!\S)cli-tests-folder-${timestamp}(?!\S)`, 'gm')

    expect(regex.test(folderList)).toBe(true)

    await create(
      `${testFolderPath}/temp/test`,
      sasjs,
      authConfig.access_token,
      false
    )
    await create(
      `${testFolderPath}/test2`,
      sasjs,
      authConfig.access_token,
      false
    )

    await move(
      `${testFolderPath}/temp`,
      `${testFolderPath}/test2/test_renamed`,
      sasjs,
      authConfig.access_token
    )

    // Check if operations are executed correctly
    const newFolderList: string = await list(
      `${testFolderPath}/test2`,
      sasjs,
      authConfig.access_token
    )

    /**
     * This regex function will pass only if it matches the whole word.
     * It will ignore whitespaces.
     */
    const regex2 = new RegExp(`(?<!\S)test_renamed(?!\S)`, 'gm')

    expect(regex2.test(newFolderList)).toBe(true)

    await deleteTestFolder(testFolderPath, sasjs, authConfig.access_token)
  })
})

const createTestFolder = async (
  testFolderPath: string,
  sasjs: SASjs,
  accessToken: string
) => {
  await create(testFolderPath, sasjs, accessToken, false)
}

const deleteTestFolder = async (
  testFolderPath: string,
  sasjs: SASjs,
  accessToken: string
) => {
  await deleteFolder(testFolderPath, sasjs, accessToken)
}
