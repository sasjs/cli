import dotenv from 'dotenv'
import { folder } from '../../folder/index'
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

  it('should list a folders for given path', async (done) => {
    const command = new Command(`folder list /Public -t ${target.name}`)

    let folderList = await folder(command)

    expect(folderList).toContain('app')

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
