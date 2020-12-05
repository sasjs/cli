import {
  createFolder,
  deleteFolder,
  fileExists,
  createFile,
  readFile,
  copy
} from '../../../src/utils/file-utils'
import dotenv from 'dotenv'
import path from 'path'
import rimraf from 'rimraf'
import {
  createFileStructure,
  compileBuildDeployServices
} from '../../../src/main'
import { generateTimestamp } from '../../../src/utils/utils'

describe('sasjs cbd', () => {
  const targetName = 'cli-tests-cbd'
  beforeAll(async () => {
    dotenv.config()
    await addToGlobalConfigs({
      name: targetName,
      serverType: process.env.SERVER_TYPE,
      serverUrl: process.env.SERVER_URL,
      appLoc: '/Public/app/cli-tests',
      tgtServices: ['../../test/commands/cbd/testJob'],
      jobs: ['../../test/commands/cbd/testJob'],
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
      jobInit: '../../test/commands/cbd/testServices/serviceinit.sas',
      jobTerm: '../../test/commands/cbd/testServices/serviceterm.sas',
      tgtServiceInit: '../../test/commands/cbd/testServices/serviceinit.sas',
      tgtServiceTerm: '../../test/commands/cbd/testServices/serviceterm.sas'
    })
  })
  describe('cbd', () => {
    it(
      'should compile, build and deploy',
      async () => {
        const timestamp = generateTimestamp()
        const parentFolderNameTimeStamped = `test-app-cbd-${timestamp}`
        process.projectDir = path.join(
          process.cwd(),
          parentFolderNameTimeStamped
        )
        await createFolder(process.projectDir)

        const macroCores = path.join(process.cwd(), 'node_modules', '@sasjs')
        const macroCoresDestination = path.join(
          process.projectDir,
          'node_modules',
          '@sasjs'
        )

        await createFolder(macroCoresDestination)
        await copy(macroCores, macroCoresDestination)

        const command = `cbd ${targetName} -f`.split(' ')
        const servicePath = path.join(
          process.projectDir,
          'sasjsbuild/services/testJob/job.sas'
        )
        const jobPath = path.join(
          process.projectDir,
          'sasjsbuild/jobs/testJob/job.sas'
        )
        const buildJsonPath = path.join(
          process.projectDir,
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

  afterAll(async () => {
    rimraf.sync('./test-app-cbd-*')
    await removeFromGlobalConfigs(targetName)
  })
})

describe('sasjs cbd (creating new app)', () => {
  const targetName = 'cli-tests-cbd-with-app'
  const testConfigPath = './test/commands/cbd/testConfig/config.json'
  const testScriptPath = './test/commands/cbd/testScript/copyscript.sh'
  let server_type = 'SASVIYA'
  let server_url = 'https://sas.analytium.co.uk'

  beforeAll(async () => {
    dotenv.config()
    server_type = process.env.SERVER_TYPE
    server_url = process.env.SERVER_URL
    const envConfig = dotenv.parse(
      await readFile(path.join(process.cwd(), '.env.example'))
    )
    for (const k in envConfig) {
      process.env[k] = envConfig[k]
    }
  })

  describe('deployServicePack is true', () => {
    it(
      `should deploy through servicepack using .env`,
      async () => {
        const timestamp = generateTimestamp()
        const parentFolderNameTimeStamped = `cli-tests-cbd-with-app-${timestamp}`
        const targetName = 'cli-tests-cbd-with-app'

        process.projectDir = path.join(
          process.cwd(),
          parentFolderNameTimeStamped
        )

        const configContent = await readFile(
          path.join(process.cwd(), testConfigPath)
        )
        const configJSON = JSON.parse(configContent)
        configJSON.targets[0] = {
          name: targetName,
          serverType: server_type,
          serverUrl: server_url,
          appLoc: '/Public/app/cli-tests',
          tgtDeployScripts: ['sasjs/build/copyscript.sh'],
          deployServicePack: false
        }
        const scriptContent = await readFile(
          path.join(process.cwd(), testScriptPath)
        )

        await createFolder(process.projectDir)

        await createFileStructure(`create --template minimal`)

        await createFile(
          path.join(process.projectDir, 'sasjs', 'sasjsconfig.json'),
          JSON.stringify(configJSON, null, 2)
        )

        await createFolder(path.join(process.projectDir, 'sasjs', 'build'))
        await createFile(
          path.join(process.projectDir, 'sasjs', 'build', 'copyscript.sh'),
          scriptContent
        )

        const command = `cbd ${targetName} -f`.split(' ')
        await expect(compileBuildDeployServices(command)).resolves.toEqual(true)
      },
      2 * 60 * 1000
    )
    it(
      `deploy should fail for no .env`,
      async () => {
        const timestamp = generateTimestamp()
        const parentFolderNameTimeStamped = `cli-tests-cbd-with-app-${timestamp}`
        const targetName = 'cli-tests-cbd-with-app'

        const configContent = await readFile(
          path.join(process.cwd(), testConfigPath)
        )
        const configJSON = JSON.parse(configContent)
        configJSON.targets[0] = {
          name: targetName,
          serverType: server_type,
          serverUrl: server_url,
          appLoc: '/Public/app/cli-tests',
          deployServicePack: true
        }

        process.projectDir = path.join(
          process.cwd(),
          parentFolderNameTimeStamped
        )

        await createFolder(process.projectDir)

        await createFileStructure(`create --template minimal`)

        await createFile(
          path.join(process.projectDir, 'sasjs', 'sasjsconfig.json'),
          JSON.stringify(configJSON, null, 2)
        )

        const command = `cbd ${targetName} -f`.split(' ')
        await expect(compileBuildDeployServices(command)).resolves.toThrow(
          `Deployment failed. Request is not authenticated.\nPlease add the following variables to your .env file:\nCLIENT, SECRET, ACCESS_TOKEN, REFRESH_TOKEN`
        )
      },
      2 * 60 * 1000
    )
  })

  describe('deployServicePack is false', () => {
    it(
      `should deploy with deploy script`,
      async () => {
        const timestamp = generateTimestamp()
        const parentFolderNameTimeStamped = `cli-tests-cbd-with-app-${timestamp}`
        const targetName = 'cli-tests-cbd-with-app'

        process.projectDir = path.join(
          process.cwd(),
          parentFolderNameTimeStamped
        )

        const configContent = await readFile(
          path.join(process.cwd(), testConfigPath)
        )
        const configJSON = JSON.parse(configContent)
        configJSON.targets[0] = {
          name: targetName,
          serverType: server_type,
          serverUrl: server_url,
          appLoc: '/Public/app/cli-tests',
          tgtDeployScripts: ['sasjs/build/copyscript.sh'],
          deployServicePack: false
        }
        const scriptContent = await readFile(
          path.join(process.cwd(), testScriptPath)
        )

        await createFolder(process.projectDir)

        await createFileStructure(`create --template minimal`)

        await createFile(
          path.join(process.projectDir, 'sasjs', 'sasjsconfig.json'),
          JSON.stringify(configJSON, null, 2)
        )

        await createFolder(path.join(process.projectDir, 'sasjs', 'build'))
        await createFile(
          path.join(process.projectDir, 'sasjs', 'build', 'copyscript.sh'),
          scriptContent
        )

        const command = `cbd ${targetName} -f`.split(' ')
        await expect(compileBuildDeployServices(command)).resolves.toEqual(true)
      },
      2 * 60 * 1000
    )
    it(
      `deploy should fail for no deploy script`,
      async () => {
        const timestamp = generateTimestamp()
        const parentFolderNameTimeStamped = `cli-tests-cbd-with-app-${timestamp}`
        const targetName = 'cli-tests-cbd-with-app'

        process.projectDir = path.join(
          process.cwd(),
          parentFolderNameTimeStamped
        )

        const configContent = await readFile(
          path.join(process.cwd(), testConfigPath)
        )
        const configJSON = JSON.parse(configContent)
        configJSON.targets[0] = {
          name: targetName,
          serverType: server_type,
          serverUrl: server_url,
          appLoc: '/Public/app/cli-tests',
          deployServicePack: false
        }

        await createFolder(process.projectDir)

        await createFileStructure(`create --template minimal`)

        await createFile(
          path.join(process.projectDir, 'sasjs', 'sasjsconfig.json'),
          JSON.stringify(configJSON, null, 2)
        )

        const command = `cbd ${targetName} -f`.split(' ')
        await expect(compileBuildDeployServices(command)).resolves.toThrow(
          `Deployment failed. Enable 'deployServicePack' option or add deployment script to 'tgtDeployScripts'.`
        )
      },
      2 * 60 * 1000
    )
  })

  afterAll(async () => {
    rimraf.sync('./cli-tests-cbd-with-app-*')
  }, 60 * 1000)
})
