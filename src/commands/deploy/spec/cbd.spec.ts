import {
  createFolder,
  deleteFolder,
  fileExists,
  createFile,
  copy,
  readFile
} from '../../../utils/file'
import dotenv from 'dotenv'
import path from 'path'
import { createFileStructure, compileBuildDeployServices } from '../../../main'
import { folder } from '../../folder/index'
import { generateTimestamp } from '../../../utils/utils'
import { ServerType, Target } from '@sasjs/utils/types'
import {
  removeFromGlobalConfig,
  saveToGlobalConfig
} from '../../../utils/config-utils'
import { createTestApp } from '../../../utils/test'

// describe('sasjs cbd with global config', () => {
//   let target: Target

//   beforeAll(async () => {
//     target = await createTarget()
//   })

//   it(
//     'should compile, build and deploy',
//     async () => {
//       const timestamp = generateTimestamp()
//       const appName = `test-app-cbd-${timestamp}`
//       await createTestApp(__dirname, appName)
//       await copyJobsAndServices(appName)

//       const command = `cbd -t ${target.name} -f`.split(' ')
//       const servicePath = path.join(
//         __dirname,
//         appName,
//         'sasjsbuild/services/testJob/job.sas'
//       )
//       const jobPath = path.join(
//         __dirname,
//         appName,
//         'sasjsbuild/jobs/testJob/job.sas'
//       )
//       const buildJsonPath = path.join(
//         __dirname,
//         appName,
//         `sasjsbuild/${target.name}.json`
//       )
//       await expect(compileBuildDeployServices(command)).resolves.toEqual(true)
//       await expect(fileExists(servicePath)).resolves.toEqual(true)
//       await expect(fileExists(jobPath)).resolves.toEqual(true)
//       /**
//        * test to ensure that jobs do not have web service pre code
//        */
//       const jobContent = await readFile(jobPath)
//       expect(jobContent).not.toEqual('')
//       expect(/^\* Dependencies start;*/.test(jobContent)).toEqual(true)
//       expect(jobContent.includes(`* JobInit start;`)).toEqual(true)
//       expect(jobContent.includes(`* JobTerm start;`)).toEqual(true)
//       /**
//        * test to ensure that services are deployed as direct subfolders, not in a subfolder of a folder called services
//        *  */
//       const jsonContent = JSON.parse(await readFile(buildJsonPath))
//       expect(
//         !!jsonContent.members.find((x: any) => x.name === 'services')
//       ).toEqual(false)
//       /**
//        * test to ensure that web services do have pre code
//        */
//       const serviceContent = await readFile(servicePath)
//       expect(serviceContent).not.toEqual('')
//       expect(/^\* Service Variables start;*/.test(serviceContent)).toEqual(
//         false
//       )
//       expect(serviceContent.includes(`* ServiceInit start;`)).toEqual(true)
//       expect(serviceContent.includes(`* ServiceTerm start;`)).toEqual(true)
//     },
//     60 * 1000
//   )

//   afterAll(async () => {
//     await deleteFolder(path.join(__dirname, 'test-app-cbd-*'))
//     await removeFromGlobalConfig(target.name)

//     await folder(`folder delete ${target.appLoc} -t ${target.name}`)
//   }, 60 * 1000)
// })

describe('sasjs cbd with local config', () => {
  const targetName = 'cli-tests-cbd-with-app'
  const testConfigPath = './src/commands/deploy/spec/testConfig/config.json'
  const testScriptPath = './src/commands/deploy/spec/testScript/copyscript.sh'
  let target: Target
  let access_token: string

  beforeAll(async () => {
    dotenv.config()
    const timestamp = generateTimestamp()
    const serverType: ServerType =
      process.env.SERVER_TYPE === ServerType.SasViya
        ? ServerType.SasViya
        : ServerType.Sas9
    target = new Target({
      name: targetName,
      serverType: serverType,
      serverUrl: process.env.SERVER_URL as string,
      appLoc: `/Public/app/cli-tests/${targetName}-${timestamp}`
    })
    access_token = process.env.ACCESS_TOKEN as string
    const envConfig = dotenv.parse(
      await readFile(path.join(process.cwd(), '.env.example'))
    )
    for (const k in envConfig) {
      process.env[k] = envConfig[k]
    }
  })

  it(
    `should deploy servicepack using .env when deployServicePack is true`,
    async () => {
      const timestamp = generateTimestamp()
      const appName = `test-app-cbd-with-app-${timestamp}`
      const targetName = `cli-tests-cbd-with-app-${timestamp}`
      await createTestApp(__dirname, appName)
      await copyJobsAndServices(appName)

      const configContent = await readFile(testConfigPath)

      const configJSON = JSON.parse(configContent)
      configJSON.targets[0] = {
        ...target.toJson(),
        authConfig: {
          ...target.authConfig,
          access_token
        },
        deployConfig: {
          deployScripts: ['sasjs/build/copyscript.sh'],
          deployServicePack: true
        }
      }
      const scriptContent = await readFile(
        path.join(process.cwd(), testScriptPath)
      )

      await createFile(
        path.join(process.projectDir, 'sasjs', 'sasjsconfig.json'),
        JSON.stringify(configJSON, null, 2)
      )

      await createFolder(path.join(process.projectDir, 'sasjs', 'build'))
      await createFile(
        path.join(process.projectDir, 'sasjs', 'build', 'copyscript.sh'),
        scriptContent
      )

      const command = `cbd -t ${targetName} -f`.split(' ')
      await expect(compileBuildDeployServices(command)).resolves.toEqual(true)
    },
    2 * 60 * 1000
  )
})

// describe('sasjs cbd (creating new app having local config)', () => {
//   const targetName = 'cli-tests-cbd-with-app'
//   const testConfigPath = './src/commands/deploy/spec/testConfig/config.json'
//   const testScriptPath = './src/commands/deploy/spec/testScript/copyscript.sh'
//   let target: Target
//   let access_token: string

//   beforeAll(async () => {
//     dotenv.config()

//     const timestamp = generateTimestamp()
//     const serverType: ServerType =
//       process.env.SERVER_TYPE === ServerType.SasViya
//         ? ServerType.SasViya
//         : ServerType.Sas9
//     target = new Target({
//       name: targetName,
//       serverType: serverType,
//       serverUrl: process.env.SERVER_URL as string,
//       appLoc: `/Public/app/cli-tests/${targetName}-${timestamp}`
//     })
//     access_token = process.env.ACCESS_TOKEN as string

//     const envConfig = dotenv.parse(
//       await readFile(path.join(process.cwd(), '.env.example'))
//     )
//     for (const k in envConfig) {
//       process.env[k] = envConfig[k]
//     }
//   })

//   describe('deployServicePack is true', () => {
//     it(
//       `should deploy through servicepack using .env`,
//       async () => {
//         const timestamp = generateTimestamp()
//         const parentFolderNameTimeStamped = `test-app-cbd-with-app-${timestamp}`
//         const targetName = 'cli-tests-cbd-with-app'

//         process.projectDir = path.join(
//           process.cwd(),
//           parentFolderNameTimeStamped
//         )

//         const configContent = await readFile(
//           path.join(process.cwd(), testConfigPath)
//         )
//         const configJSON = JSON.parse(configContent)
//         configJSON.targets[0] = {
//           ...target.toJson(),
//           authConfig: {
//             ...target.authConfig,
//             access_token
//           },
//           tgtDeployScripts: ['sasjs/build/copyscript.sh'],
//           deployServicePack: true
//         }
//         const scriptContent = await readFile(
//           path.join(process.cwd(), testScriptPath)
//         )

//         await createFolder(process.projectDir)

//         await createFileStructure(`create --template minimal`)

//         await createFile(
//           path.join(process.projectDir, 'sasjs', 'sasjsconfig.json'),
//           JSON.stringify(configJSON, null, 2)
//         )

//         await createFolder(path.join(process.projectDir, 'sasjs', 'build'))
//         await createFile(
//           path.join(process.projectDir, 'sasjs', 'build', 'copyscript.sh'),
//           scriptContent
//         )

//         const command = `cbd ${targetName} -f`.split(' ')
//         await expect(compileBuildDeployServices(command)).resolves.toEqual(true)
//       },
//       2 * 60 * 1000
//     )
//     it(
//       `deploy should fail for no .env`,
//       async () => {
//         const timestamp = generateTimestamp()
//         const parentFolderNameTimeStamped = `test-app-cbd-with-app-${timestamp}`
//         const targetName = 'cli-tests-cbd-with-app'

//         const configContent = await readFile(
//           path.join(process.cwd(), testConfigPath)
//         )
//         const configJSON = JSON.parse(configContent)
//         configJSON.targets[0] = {
//           ...target,
//           deployServicePack: true
//         }

//         process.projectDir = path.join(
//           process.cwd(),
//           parentFolderNameTimeStamped
//         )

//         await createFolder(process.projectDir)

//         await createFileStructure(`create --template minimal`)

//         await createFile(
//           path.join(process.projectDir, 'sasjs', 'sasjsconfig.json'),
//           JSON.stringify(configJSON, null, 2)
//         )

//         const command = `cbd ${targetName} -f`.split(' ')
//         await expect(compileBuildDeployServices(command)).resolves.toThrow(
//           `Deployment failed. Request is not authenticated.\nPlease add the following variables to your .env file:\nCLIENT, SECRET, ACCESS_TOKEN, REFRESH_TOKEN`
//         )
//       },
//       2 * 60 * 1000
//     )
//   })

//   describe('deployServicePack is false', () => {
//     it(
//       `should deploy with deploy script`,
//       async () => {
//         const timestamp = generateTimestamp()
//         const parentFolderNameTimeStamped = `test-app-cbd-with-app-${timestamp}`
//         const targetName = 'cli-tests-cbd-with-app'

//         process.projectDir = path.join(
//           process.cwd(),
//           parentFolderNameTimeStamped
//         )

//         const configContent = await readFile(
//           path.join(process.cwd(), testConfigPath)
//         )
//         const configJSON = JSON.parse(configContent)
//         configJSON.targets[0] = {
//           ...target,
//           tgtDeployScripts: ['sasjs/build/copyscript.sh'],
//           deployServicePack: false
//         }
//         const scriptContent = await readFile(
//           path.join(process.cwd(), testScriptPath)
//         )

//         await createFolder(process.projectDir)

//         await createFileStructure(`create --template minimal`)

//         await createFile(
//           path.join(process.projectDir, 'sasjs', 'sasjsconfig.json'),
//           JSON.stringify(configJSON, null, 2)
//         )

//         await createFolder(path.join(process.projectDir, 'sasjs', 'build'))
//         await createFile(
//           path.join(process.projectDir, 'sasjs', 'build', 'copyscript.sh'),
//           scriptContent
//         )

//         const command = `cbd ${targetName} -f`.split(' ')
//         await expect(compileBuildDeployServices(command)).resolves.toEqual(true)
//       },
//       2 * 60 * 1000
//     )
//     it(
//       `deploy should fail for no deploy script`,
//       async () => {
//         const timestamp = generateTimestamp()
//         const parentFolderNameTimeStamped = `test-app-cbd-with-app-${timestamp}`
//         const targetName = 'cli-tests-cbd-with-app'

//         process.projectDir = path.join(
//           process.cwd(),
//           parentFolderNameTimeStamped
//         )

//         const configContent = await readFile(
//           path.join(process.cwd(), testConfigPath)
//         )
//         const configJSON = JSON.parse(configContent)
//         configJSON.targets[0] = {
//           ...target,
//           deployServicePack: false
//         }

//         await createFolder(process.projectDir)

//         await createFileStructure(`create --template minimal`)

//         await createFile(
//           path.join(process.projectDir, 'sasjs', 'sasjsconfig.json'),
//           JSON.stringify(configJSON, null, 2)
//         )

//         const command = `cbd ${targetName} -f`.split(' ')
//         await expect(compileBuildDeployServices(command)).resolves.toThrow(
//           `Deployment failed. Enable 'deployServicePack' option or add deployment script to 'tgtDeployScripts'.`
//         )
//       },
//       2 * 60 * 1000
//     )
//   })

//   afterAll(async () => {
//     await deleteFolder('./test-app-cbd-with-app-*')

//     await folder(`folder delete ${target.appLoc} -t ${targetName}`)
//   }, 60 * 1000)
// })

const createTarget = async () => {
  dotenv.config()
  const timestamp = generateTimestamp()
  const targetName = `cli-tests-cbd-${timestamp}`

  const serverType: ServerType =
    process.env.SERVER_TYPE === ServerType.SasViya
      ? ServerType.SasViya
      : ServerType.Sas9
  const target = new Target({
    name: targetName,
    serverType,
    serverUrl: process.env.SERVER_URL as string,
    appLoc: `/Public/app/cli-tests/${targetName}-${timestamp}`,
    serviceConfig: {
      serviceFolders: ['testJob'],
      initProgram: 'testServices/serviceinit.sas',
      termProgram: 'testServices/serviceterm.sas',
      macroVars: {}
    },
    jobConfig: {
      jobFolders: ['testJob'],
      initProgram: 'testServices/serviceinit.sas',
      termProgram: 'testServices/serviceterm.sas',
      macroVars: {}
    },
    authConfig: {
      client: process.env.CLIENT as string,
      secret: process.env.SECRET as string,
      access_token: process.env.ACCESS_TOKEN as string,
      refresh_token: process.env.REFRESH_TOKEN as string
    },
    deployConfig: {
      deployServicePack: true,
      deployScripts: []
    }
  })
  await saveToGlobalConfig(target)
  return target
}

const copyJobsAndServices = async (appName: string) => {
  await copy(
    path.join(__dirname, 'testJob'),
    path.join(__dirname, appName, 'sasjs', 'testJob')
  )
  await copy(
    path.join(__dirname, 'testServices'),
    path.join(__dirname, appName, 'sasjs', 'testServices')
  )
}
