import SASjs from '@sasjs/adapter/node'
import { AuthConfig, ServerType, Target, decodeFromBase64 } from '@sasjs/utils'
import path from 'path'
import { CommandExample, ReturnCode } from '../../types/command'
import { TargetCommand } from '../../types/command/targetCommand'
import { getAuthConfig } from '../../utils'
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
    let sasjs = new SASjs({
      serverUrl: target.serverUrl,
      httpsAgentOptions: target.httpsAgentOptions,
      appLoc: target.appLoc,
      serverType: target.serverType,
      debug: true
    })

    switch (target.serverType) {
      case ServerType.SasViya:
        const authConfig = await getAuthConfig(target).catch((err) => {
          process.logger?.error(
            'Unable to execute job. Error fetching auth config: ',
            err
          )
          return null
        })

        if (!authConfig) return ReturnCode.InternalError

        return this.jobSubCommands.includes(this.parsed.subCommand)
          ? await this.executeJobViya(target, sasjs, authConfig)
          : ReturnCode.InvalidCommand

      case ServerType.Sas9:
        let username: any
        let password: any
        if (target.authConfigSas9) {
          username = target.authConfigSas9.userName
          password = target.authConfigSas9.password
        } else {
          username = process.env.SAS_USERNAME
          password = process.env.SAS_PASSWORD
        }
        if (!username || !password) {
          process.logger?.error(
            'Unable to execute job. username and password not found'
          )
          return ReturnCode.InternalError
        }
        password = decodeFromBase64(password)

        return this.jobSubCommands.includes(this.parsed.subCommand)
          ? await this.executeJobSas9(sasjs, target, { username, password })
          : ReturnCode.InvalidCommand

      case ServerType.Sasjs:
        sasjs = new SASjs({
          serverType: target.serverType,
          serverUrl: target.serverUrl
        })

        if (typeof this.parsed.jobPath !== 'string')
          return ReturnCode.InvalidCommand

        return this.jobSubCommands.includes(this.parsed.subCommand)
          ? await this.executeJobSasjs(sasjs, target)
          : ReturnCode.InvalidCommand

      default:
        process.logger?.error(
          `This command is not supported for specified server type.\nPlease try again with a different server type.`
        )

        return ReturnCode.InternalError
    }
  }

  async executeJobSasjs(sasjs: SASjs, target: Target) {
    const jobPath = prefixAppLoc(target.appLoc, this.parsed.jobPath as string)

    const returnCode = await executeJobSasjs(
      sasjs,
      jobPath,
      this.parsed.log as string
    )
      .then(() => ReturnCode.Success)
      .catch((err) => {
        process.logger?.error('Error executing job: ', err)

        return ReturnCode.InternalError
      })

    return returnCode
  }

  async executeJobSas9(
    sasjs: SASjs,
    target: Target,
    config: { username: string; password: string }
  ) {
    const jobPath = prefixAppLoc(target.appLoc, this.parsed.jobPath as string)
    const log = await getLogFilePath(this.parsed.log, jobPath)
    const output = (this.parsed.output as string)?.length
      ? (this.parsed.output as string)
      : undefined
    const source = this.parsed.source as string

    const returnCode = await executeJobSas9(
      sasjs,
      config,
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

  async executeJobViya(target: Target, sasjs: SASjs, authConfig: AuthConfig) {
    const jobPath = prefixAppLoc(target.appLoc, this.parsed.jobPath as string)
    const log = await getLogFilePath(this.parsed.log, jobPath)
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
