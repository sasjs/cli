import { ServerType, Target, decodeFromBase64 } from '@sasjs/utils'
import path from 'path'
import { CommandExample, ReturnCode } from '../../types/command'
import { TargetCommand } from '../../types/command/targetCommand'
import { getSASjs, getSASjsAndAuthConfig } from '../../utils'
import { getLogFilePath } from '../../utils/getLogFilePath'
import { prefixAppLoc } from '../../utils/prefixAppLoc'
import {
  executeJobViya,
  executeJobSasjs,
  executeJobSas9
} from './internal/execute'

enum JobSubCommand {
  Execute = 'execute',
  Exec = 'exec'
}

const syntax = 'job <subCommand> <jobPath> [options]'
const usage = 'sasjs job <execute> <jobPath> [options]'
const description = 'Performs operations on jobs'
const examples: CommandExample[] = [
  {
    command:
      'sasjs job execute /Public/folder/someJob -l ./jobLog.log -o ./jobOutput.json -t myTarget',
    description:
      'Executes the job at /Public/folder/somJob, saves the logs to jobLog.log and the output to jobOutput.json.'
  }
]

const executeParseOptions = {
  ignoreWarnings: {
    type: 'boolean',
    alias: 'i',
    default: false,
    description:
      'If present and return status only is provided, CLI will return status 0 when the job state is warning.'
  },
  log: {
    type: 'string',
    alias: 'l',
    description:
      'Path where the log of the finished job will be saved. If used, -w is implied.'
  },
  output: {
    type: 'string',
    alias: 'o',
    description:
      'path where output of the finished job execution will be saved.'
  },
  returnStatusOnly: {
    type: 'boolean',
    default: false,
    alias: 'r',
    description:
      'If present and wait flag is provided, CLI will job status only (0 = success, 1 = warning, 2 = error).'
  },
  source: {
    type: 'string',
    alias: 's',
    description: 'Path to an input JSON containing job variables.'
  },
  wait: {
    type: 'boolean',
    alias: 'w',
    default: false,
    description: 'Wait for job completion.'
  },
  statusFile: {
    type: 'string',
    description:
      'Flag indicating if CLI should fetch and save status to the local file. If filepath is not provided, the status is printed to the console.'
  },
  streamLog: {
    type: 'boolean',
    description:
      'Flag indicating whether the logs should be streamed to a local file as the job executes.'
  }
}

export class JobCommand extends TargetCommand {
  private jobSubCommands: any[]

  constructor(args: string[]) {
    const jobSubCommands: string[] = (<any>Object).values(JobSubCommand)
    const subCommand = args[3]
    const parseOptions = jobSubCommands.includes(subCommand)
      ? executeParseOptions
      : {}

    super(args, {
      parseOptions,
      usage,
      description,
      examples,
      syntax
    })

    this.jobSubCommands = jobSubCommands
  }

  public async execute() {
    const { target } = await this.getTargetInfo()

    switch (target.serverType) {
      case ServerType.SasViya:
        return this.jobSubCommands.includes(this.parsed.subCommand)
          ? await this.executeJobViya(target)
          : ReturnCode.InvalidCommand

      case ServerType.Sas9:
        return this.jobSubCommands.includes(this.parsed.subCommand)
          ? await this.executeJobSas9(target)
          : ReturnCode.InvalidCommand

      case ServerType.Sasjs:
        if (typeof this.parsed.jobPath !== 'string')
          return ReturnCode.InvalidCommand

        return this.jobSubCommands.includes(this.parsed.subCommand)
          ? await this.executeJobSasjs(target)
          : ReturnCode.InvalidCommand

      default:
        process.logger?.error(
          `This command is not supported for specified server type.\nPlease try again with a different server type.`
        )

        return ReturnCode.InternalError
    }
  }

  async executeJobSasjs(target: Target) {
    const jobPath = prefixAppLoc(target.appLoc, this.parsed.jobPath as string)

    const log = getLogFilePath(this.parsed.log, jobPath)
    const output = (this.parsed.output as string)?.length
      ? (this.parsed.output as string)
      : undefined

    const returnCode = await executeJobSasjs(target, jobPath, log, output)
      .then(() => ReturnCode.Success)
      .catch((err) => {
        process.logger?.error('Error executing job: ', err)

        return ReturnCode.InternalError
      })

    return returnCode
  }

  async executeJobSas9(target: Target) {
    const jobPath = prefixAppLoc(target.appLoc, this.parsed.jobPath as string)
    const log = getLogFilePath(this.parsed.log, jobPath)
    const output = (this.parsed.output as string)?.length
      ? (this.parsed.output as string)
      : undefined
    const source = this.parsed.source as string

    const { sasjs, authConfigSas9 } = await getSASjsAndAuthConfig(target).catch(
      (err) => {
        process.logger?.error(
          'Unable to execute job. Error fetching auth config: ',
          err
        )

        return { sasjs: getSASjs(target), authConfigSas9: undefined }
      }
    )
    if (!authConfigSas9) return ReturnCode.InternalError

    const userName = authConfigSas9.userName
    const password = decodeFromBase64(authConfigSas9.password)

    const returnCode = await executeJobSas9(
      sasjs,
      { userName, password },
      jobPath,
      log,
      output,
      source
    )
      .then(() => {
        return ReturnCode.Success
      })
      .catch((err) => {
        process.logger?.error('Error executing job: ', err)
        return ReturnCode.InternalError
      })

    return returnCode
  }

  async executeJobViya(target: Target) {
    const jobPath = prefixAppLoc(target.appLoc, this.parsed.jobPath as string)
    const log = getLogFilePath(this.parsed.log, jobPath)
    let wait = (this.parsed.wait as boolean) || !!log
    const output = (this.parsed.output as string)?.length
      ? (this.parsed.output as string)
      : (this.parsed.output as string)?.length === 0
      ? true
      : false
    const statusFile = getStatusFilePath(this.parsed.statusFile)
    const returnStatusOnly = !!this.parsed.returnStatusOnly
    const ignoreWarnings = !!this.parsed.ignoreWarnings
    const source = this.parsed.source as string
    const streamLog = !!this.parsed.streamLog

    if (returnStatusOnly && !wait) wait = true

    if (ignoreWarnings && !returnStatusOnly) {
      process.logger?.warn(
        `Using the 'ignoreWarnings' flag without 'returnStatusOnly' flag will not affect the sasjs job execute command.`
      )
    }

    const { sasjs, authConfig } = await getSASjsAndAuthConfig(target).catch(
      (err) => {
        process.logger?.error(
          'Unable to execute job. Error fetching auth config: ',
          err
        )

        return { sasjs: getSASjs(target), authConfig: undefined }
      }
    )

    if (!authConfig) return ReturnCode.InternalError

    const returnCode = await executeJobViya(
      sasjs,
      authConfig,
      jobPath,
      target,
      wait,
      output,
      log,
      statusFile,
      returnStatusOnly,
      ignoreWarnings,
      source,
      streamLog
    )
      .then(() => {
        return ReturnCode.Success
      })
      .catch((err) => {
        process.logger?.error('Error executing job: ', err)
        return ReturnCode.InternalError
      })

    return returnCode
  }
}

const getStatusFilePath = (statusFileArg: unknown) => {
  if (statusFileArg) {
    const currentDirPath = path.isAbsolute(statusFileArg as string)
      ? ''
      : process.projectDir
    return path.join(currentDirPath, statusFileArg as string)
  }
  return undefined
}
