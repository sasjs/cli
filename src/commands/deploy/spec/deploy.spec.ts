import path from 'path'
import {
  FileTree,
  generateTimestamp,
  Logger,
  MemberType,
  ServerType,
  Target
} from '@sasjs/utils'
import { deploy } from '../deploy'
import { createTestApp, removeTestApp } from '../../../utils/test'
import * as deployToSasViyaWithServicePackModule from '../../shared/deployToSasViyaWithServicePack'
import * as deployToSASJSWithServicePackModule from '../internal/deployToSASJSWithServicePack'
import * as executeSasScriptModule from '../internal/executeSasScript'
import * as utilsModule from '../../../utils/utils'

const commonTargetFields = {
  name: 'test',
  serverUrl: 'http://test.sasjs',
  appLoc: '/Public/test/'
}

describe('deploy', () => {
  let appName = ''
  beforeEach(async () => {
    appName = `cli-tests-${generateTimestamp()}`
    await createTestApp(__dirname, appName)
    process.logger = new Logger()
    jest.spyOn(process.logger, 'success')
    jest.spyOn(process.logger, 'error')
    jest.spyOn(process.logger, 'info')
  })

  afterEach(async () => {
    await removeTestApp(__dirname, appName)
  })

  describe('deployServicePack', () => {
    it('should deploy services to SAS Viya as a service pack', async () => {
      const target = new Target({
        ...commonTargetFields,
        serverType: ServerType.SasViya,
        deployConfig: {
          deployServicePack: true
        }
      })

      const fileTree: FileTree = {
        members: [
          {
            name: 'mockedFile',
            type: MemberType.file,
            code: 'mocked code'
          }
        ]
      }

      jest
        .spyOn(
          deployToSasViyaWithServicePackModule,
          'deployToSasViyaWithServicePack'
        )
        .mockImplementation(() => Promise.resolve(fileTree))

      await deploy(target, true)

      expect(process.logger.info).toHaveBeenCalledWith(
        `Deploying service pack to ${target.serverUrl} at location ${target.appLoc} .`
      )
      expect(
        deployToSasViyaWithServicePackModule.deployToSasViyaWithServicePack
      ).toHaveBeenCalledWith(
        path.join(
          process.sasjsConstants.buildDestinationFolder,
          `${target.name}.json`
        ),
        target,
        true,
        true
      )
    })

    it('should deploy services to SASJS as a service pack', async () => {
      const target = new Target({
        ...commonTargetFields,
        serverType: ServerType.Sasjs,
        deployConfig: {
          deployServicePack: true
        }
      })

      jest
        .spyOn(
          deployToSASJSWithServicePackModule,
          'deployToSasjsWithServicePack'
        )
        .mockImplementation(() => Promise.resolve())

      await deploy(target, true)

      expect(process.logger.info).toHaveBeenCalledWith(
        `Deploying service pack to ${target.serverUrl} at location ${target.appLoc} .`
      )
      expect(
        deployToSASJSWithServicePackModule.deployToSasjsWithServicePack
      ).toHaveBeenCalledWith(
        path.join(
          process.sasjsConstants.buildDestinationFolder,
          `${target.name}.json`
        ),
        target,
        { streamServiceName: 'clickme' }
      )
    })

    it('should deploy services to SAS9 by executing sas script which is created in the result of build process', async () => {
      const target = new Target({
        ...commonTargetFields,
        serverType: ServerType.Sas9,
        deployConfig: {
          deployServicePack: true
        }
      })

      jest
        .spyOn(executeSasScriptModule, 'executeSasScript')
        .mockImplementation(() => Promise.resolve())

      await deploy(target, true)

      expect(executeSasScriptModule.executeSasScript).toHaveBeenCalledWith(
        path.join(
          process.sasjsConstants.buildDestinationFolder,
          `${target.name}.sas`
        ),
        target,
        { streamServiceName: 'clickme' }
      )
    })
  })

  describe('deployScripts', () => {
    describe('SAS', () => {
      it('should execute all scripts on SASVIYA', async () => {
        await testSasDeployScripts(ServerType.SasViya)
      })

      it('should execute all scripts on SAS9', async () => {
        await testSasDeployScripts(ServerType.Sas9)
      })
      it('should execute all scripts on SASJS', async () => {
        await testSasDeployScripts(ServerType.Sasjs)
      })
    })

    describe('Non SAS', () => {
      it('should execute shell script', async () => {
        const target = new Target({
          ...commonTargetFields,
          serverType: ServerType.Sasjs,
          deployConfig: {
            deployScripts: ['script.sh']
          }
        })

        jest
          .spyOn(utilsModule, 'executeShellScript')
          .mockImplementation(() => Promise.resolve())

        await deploy(target, true)

        expect(process.logger.info).toHaveBeenCalledWith(
          `Executing shell script ${path.join(
            process.projectDir,
            `script.sh`
          )} ...`
        )

        expect(process.logger.success).toHaveBeenCalledWith(
          `Shell script execution completed! Log is here: ${path.join(
            process.sasjsConstants.buildDestinationFolder,
            'script.log'
          )}`
        )
      })
      it('should execute batch script', async () => {
        const target = new Target({
          ...commonTargetFields,
          serverType: ServerType.Sasjs,
          deployConfig: {
            deployScripts: ['script.bat']
          }
        })

        jest
          .spyOn(utilsModule, 'executeShellScript')
          .mockImplementation(() => Promise.resolve())

        await deploy(target, true)

        expect(process.logger.info).toHaveBeenCalledWith(
          `Executing shell script ${path.join(
            process.projectDir,
            `script.bat`
          )} ...`
        )

        expect(process.logger.success).toHaveBeenCalledWith(
          `Shell script execution completed! Log is here: ${path.join(
            process.sasjsConstants.buildDestinationFolder,
            'script.log'
          )}`
        )
      })
      it('should execute powershell script', async () => {
        const target = new Target({
          ...commonTargetFields,
          serverType: ServerType.Sasjs,
          deployConfig: {
            deployScripts: ['script.ps1']
          }
        })

        jest
          .spyOn(utilsModule, 'executePowerShellScript')
          .mockImplementation(() => Promise.resolve())

        await deploy(target, true)

        expect(process.logger.info).toHaveBeenCalledWith(
          `Executing powershell script ${path.join(
            process.projectDir,
            `script.ps1`
          )} ...`
        )

        expect(process.logger.success).toHaveBeenCalledWith(
          `PowerShell script execution completed! Log is here: ${path.join(
            process.sasjsConstants.buildDestinationFolder,
            'script.log'
          )}`
        )
      })
      it('should show error message when script type is not supported', async () => {
        const target = new Target({
          ...commonTargetFields,
          serverType: ServerType.Sasjs,
          deployConfig: {
            deployScripts: ['script.invalid']
          }
        })

        await deploy(target, true)

        expect(process.logger.error).toHaveBeenCalledWith(
          `Unable to process script located at ${path.join(
            process.projectDir,
            `script.invalid`
          )}`
        )
      })
    })
  })
})

async function testSasDeployScripts(serverType: ServerType) {
  const target = new Target({
    ...commonTargetFields,
    serverType,
    deployConfig: {
      deployScripts: ['script1.sas', 'script2.sas']
    }
  })

  jest
    .spyOn(executeSasScriptModule, 'executeSasScript')
    .mockImplementation(() => Promise.resolve())

  await deploy(target, true)

  expect(executeSasScriptModule.executeSasScript).toHaveBeenNthCalledWith(
    1,
    path.join(process.projectDir, `script1.sas`),
    target,
    { streamServiceName: 'clickme' }
  )

  expect(executeSasScriptModule.executeSasScript).toHaveBeenNthCalledWith(
    2,
    path.join(process.projectDir, `script2.sas`),
    target,
    { streamServiceName: 'clickme' }
  )
}
