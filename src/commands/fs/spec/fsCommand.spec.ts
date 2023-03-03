import { Logger, LogLevel, ServerType, Target } from '@sasjs/utils'
import { ReturnCode } from '../../../types/command'
import { FSCommand } from '../fsCommand'
import { setConstants } from '../../../utils'
import * as FSModule from '@sasjs/utils/fs'
import * as FileModule from '@sasjs/utils/file'
import * as configUtils from '../../../utils/config'
import * as executeCodeModule from '../internal/executeCode'

const defaultArgs = ['node', 'sasjs', 'fs']

const target = new Target({
  name: 'test',
  appLoc: '/Public/test/',
  serverType: ServerType.Sasjs
})

describe('FSCommand', () => {
  beforeAll(async () => {
    await setConstants()
    process.projectDir = __dirname
  })

  describe('compile', () => {
    beforeEach(() => {
      jest
        .spyOn(FSModule, 'generateCompileProgram')
        .mockImplementation(() => Promise.resolve(''))

      process.logger = new Logger(LogLevel.Off)
      jest.spyOn(process.logger, 'error')
    })

    it('should compile a sas program for creating a copy of local folder on remote server', async () => {
      jest
        .spyOn(FileModule, 'createFile')
        .mockImplementation(() => Promise.resolve())

      jest
        .spyOn(configUtils, 'findTargetInConfiguration')
        .mockImplementation(() =>
          Promise.resolve({ target: target, isLocal: true })
        )

      const returnCode = await executeCommandWrapper([
        'compile',
        'localFolder',
        '-o',
        'compiledProgram'
      ])
      expect(returnCode).toEqual(ReturnCode.Success)
    })

    it('should display an error message', async () => {
      jest
        .spyOn(FileModule, 'createFile')
        .mockImplementation(() => Promise.reject())

      jest
        .spyOn(configUtils, 'findTargetInConfiguration')
        .mockImplementation(() =>
          Promise.resolve({ target: target, isLocal: true })
        )

      const returnCode = await executeCommandWrapper(['compile', 'localFolder'])
      expect(returnCode).toEqual(ReturnCode.InternalError)
      expect(process.logger.error).toHaveBeenCalledWith(
        'An error has occurred when creating program file.\n'
      )
    })
  })

  describe('deploy', () => {
    beforeEach(() => {
      process.logger = new Logger(LogLevel.Off)
      jest.spyOn(process.logger, 'error')
      jest.spyOn(process.logger, 'info')

      jest
        .spyOn(configUtils, 'findTargetInConfiguration')
        .mockImplementation(() =>
          Promise.resolve({ target: target, isLocal: true })
        )

      jest
        .spyOn(FSModule, 'generateCompileProgram')
        .mockImplementation(() => Promise.resolve(''))

      jest
        .spyOn(FileModule, 'createFile')
        .mockImplementation(() => Promise.resolve())

      jest
        .spyOn(executeCodeModule, 'executeCode')
        .mockImplementation(() => Promise.resolve({ log: '' }))
    })

    it('should compile and deploy a local directory tree to a remote sas server', async () => {
      jest
        .spyOn(FileModule, 'createFile')
        .mockImplementation(() => Promise.resolve())

      const returnCode = await executeCommandWrapper([
        'deploy',
        'localFolder',
        'remoteFolder'
      ])
      expect(returnCode).toEqual(ReturnCode.Success)
    })

    it('should return an internal error return code', async () => {
      jest
        .spyOn(FileModule, 'createFile')
        .mockImplementationOnce(() => Promise.reject({}))

      const returnCode = await executeCommandWrapper([
        'deploy',
        'localFolder',
        'remoteFolder'
      ])
      expect(returnCode).toEqual(ReturnCode.InternalError)
    })
  })

  describe('sync', () => {
    beforeEach(() => {
      process.logger = new Logger(LogLevel.Off)
      jest.spyOn(process.logger, 'info')

      jest
        .spyOn(FileModule, 'createFile')
        .mockImplementation(() => Promise.resolve())

      jest
        .spyOn(configUtils, 'findTargetInConfiguration')
        .mockImplementation(() =>
          Promise.resolve({ target: target, isLocal: true })
        )

      jest
        .spyOn(FSModule, 'generateProgramToGetRemoteHash')
        .mockImplementation(() => Promise.resolve(''))

      jest
        .spyOn(FSModule, 'generateProgramToSyncHashDiff')
        .mockImplementation(() => Promise.resolve(''))

      jest
        .spyOn(executeCodeModule, 'executeCode')
        .mockImplementation(() => Promise.resolve({ log: '' }))

      jest.spyOn(FSModule, 'getHash').mockImplementation(() =>
        Promise.resolve({
          absolutePath: '',
          relativePath: '',
          hash: '',
          isFile: false,
          members: []
        })
      )

      jest.spyOn(FSModule, 'compareHashes').mockImplementation(() => ({
        absolutePath: '',
        relativePath: '',
        hash: '',
        isFile: false,
        members: []
      }))
    })

    it('should sync a local folder with folder on remote server', async () => {
      jest.spyOn(FSModule, 'extractHashArray').mockImplementationOnce(() => [
        {
          FILE_PATH: 'mocked-file',
          FILE_HASH: 'hashOfMockedFile'
        }
      ])

      jest.spyOn(FSModule, 'extractHashArray').mockImplementationOnce(() => [
        {
          FILE_PATH: 'synced-file',
          FILE_HASH: 'hashOfSyncedFile'
        }
      ])

      const returnCode = await executeCommandWrapper([
        'sync',
        '-l',
        'localFolder',
        '-r',
        'remoteFolder'
      ])
      expect(returnCode).toEqual(ReturnCode.Success)
      expect(process.logger.info).toHaveBeenCalledWith(
        'generating program to get remote hash'
      )
      expect(process.logger.info).toHaveBeenCalledWith(
        'executing program to get remote hash'
      )
      expect(process.logger.info).toHaveBeenCalledWith(
        'extracting hashes from log'
      )
      expect(process.logger.info).toHaveBeenCalledWith(
        'creating the hash of local folder'
      )
      expect(process.logger.info).toHaveBeenCalledWith(
        'Extract differences from local and remote hash'
      )
      expect(process.logger.info).toHaveBeenCalledWith(
        'generating program to sync differences'
      )
      expect(process.logger.info).toHaveBeenCalledWith(
        'executing program to sync differences'
      )
    })

    it('should not execute sync program when local and remote folders are already in sync', async () => {
      jest.spyOn(FSModule, 'extractHashArray').mockImplementation(() => [
        {
          FILE_PATH: 'mocked-file',
          FILE_HASH: 'hashOfMockedFile'
        }
      ])

      jest.spyOn(FSModule, 'getHash').mockImplementation(() =>
        Promise.resolve({
          absolutePath: '',
          relativePath: FileModule.getRelativePath(
            'remoteFolder',
            'mocked-file'
          ),
          hash: 'hashOfMockedFile',
          isFile: true,
          members: []
        })
      )

      const returnCode = await executeCommandWrapper([
        'sync',
        '-l',
        'localFolder',
        '-r',
        'remoteFolder'
      ])
      expect(returnCode).toEqual(ReturnCode.Success)
      expect(process.logger.info).toHaveBeenCalledWith(
        'There are no differences between Remote and Local directory. Already synced.'
      )
    })
  })

  describe('invalid subCommand', () => {
    it('should return ReturnCode.InvalidCommand when subCommand is unknown', async () => {
      const returnCode = await executeCommandWrapper(['subCommand'])
      expect(returnCode).toEqual(ReturnCode.InvalidCommand)
    })
  })
})

const executeCommandWrapper = async (additionalParams: string[]) => {
  const args = [...defaultArgs, ...additionalParams]

  const command = new FSCommand(args)
  return await command.execute()
}
