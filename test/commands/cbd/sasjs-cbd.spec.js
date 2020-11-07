import {
  deleteFolder,
  fileExists,
  readFile
} from '../../../src/utils/file-utils'
import dotenv from 'dotenv'
import path from 'path'
import { compileBuildDeployServices } from '../../../src/main'

describe('sasjs cbd', () => {
  const targetName = 'cli-tests-cbd'

  beforeAll(async () => {
    dotenv.config()

    await addToGlobalConfigs({
      name: targetName,
      serverType: process.env.SERVER_TYPE,
      serverUrl: process.env.SERVER_URL,
      appLoc: '/Public/app/cli-tests',
      tgtServices: ['../test/commands/cbd/testJob'],
      jobs: ['../test/commands/cbd/testJob'],
      authInfo: {
        client: process.env.CLIENT,
        secret: process.env.SECRET,
        access_token: process.env.ACCESS_TOKEN,
        refresh_token: process.env.REFRESH_TOKEN
      },
      deployServicePack: true,
      tgtDeployVars: {
        client: process.env.CLIENT,
        secret: process.env.SECRET
      },
      tgtDeployScripts: [],
      jobInit: '../test/commands/cbd/testServices/serviceinit.sas',
      jobTerm: '../test/commands/cbd/testServices/serviceterm.sas',
      tgtServiceInit: '../test/commands/cbd/testServices/serviceinit.sas',
      tgtServiceTerm: '../test/commands/cbd/testServices/serviceterm.sas'
    })

    process.projectDir = path.join(process.cwd())
  })

  describe('cbd', () => {
    it(
      'should compile, build and deploy',
      async () => {
        const command = `cbd ${targetName} -f`.split(' ')
        const servicePath = path.join(
          process.cwd(),
          'sasjsbuild/services/testJob/job.sas'
        )
        const jobPath = path.join(
          process.cwd(),
          'sasjsbuild/jobs/testJob/job.sas'
        )

        const buildJsonPath = path.join(
          process.cwd(),
          `sasjsbuild/${targetName}.json`
        )

        await expect(compileBuildDeployServices(command)).resolves.toEqual(true)
        await expect(fileExists(servicePath)).resolves.toEqual(true)
        await expect(fileExists(jobPath)).resolves.toEqual(true)

        /**
         * test to ensure that jobs do not have web service pre code
         */
        const jobContent = await readFile(jobPath)
        expect(jobContent).not.toEqual('')
        expect(/^\* Dependencies start;*/.test(jobContent)).toEqual(true)
        expect(jobContent.includes(`* JobInit start;`)).toEqual(true)
        expect(jobContent.includes(`* JobTerm start;`)).toEqual(true)

        /**
         * test to ensure that services are deployed as direct subfolders, not in a subfolder of a folder called services
         *  */
        const jsonContent = JSON.parse(await readFile(buildJsonPath))
        expect(
          !!jsonContent.members.find((x) => x.name === 'services')
        ).toEqual(false)

        /**
         * test to ensure that web services do have pre code
         */
        const serviceContent = await readFile(servicePath)
        expect(serviceContent).not.toEqual('')
        expect(/^\* Service Variables start;*/.test(serviceContent)).toEqual(
          false
        )
        expect(serviceContent.includes(`* ServiceInit start;`)).toEqual(true)
        expect(serviceContent.includes(`* ServiceTerm start;`)).toEqual(true)
      },
      60 * 1000
    )
  })

  afterEach(async () => {
    const sasjsBuildDirPath = path.join(process.projectDir, 'sasjsbuild')

    await deleteFolder(sasjsBuildDirPath)
  }, 60 * 1000)
  afterAll(async () => {
    await removeFromGlobalConfigs(targetName)
  })
})
