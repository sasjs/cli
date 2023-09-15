import {
  AuthConfig,
  AuthConfigSas9,
  ServerType,
  Target,
  decodeFromBase64
} from '@sasjs/utils'
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
import { VerboseMode } from '@sasjs/adapter/node'
import SASjs from '@sasjs/adapter/node'

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
      'If present, CLI will return status 0 when the job state is warning.'
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
  // returnStatusOnly flag is deprecated and is left to display warning if used
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
  },
  verbose: {
    type: 'string',
    alias: 'v',
    default: false,
    description: `If present, CLI will return status 0, 1 or 2 together with HTTP response summaries. If set to 'bleached', HTTP response summaries will be logged without extra colors.`
  }
}

export class JobCommand extends TargetCommand {
  private jobSubCommands: any[]
  private verbose?: VerboseMode
  private sasjs: SASjs = new SASjs()
  private authConfig?: AuthConfig | AuthConfigSas9

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

    this.verbose = getVerbose(args, this.parsed.verbose)
  }

  /**
   * Method responsible for command execution.
   * @returns - promise that resolves into return code.
   */
  public async execute() {
    // returnStatusOnly flag is deprecated and is left to display warning if used
    const returnStatusOnly = !!this.parsed.returnStatusOnly
    if (returnStatusOnly) {
      process.logger.warn('--returnStatusOnly (-r) flag is deprecated.')
    }

    const { target } = await this.getTargetInfo()

    const sasjsAndAuthConfig = await getSASjsAndAuthConfig(target).catch(
      (err) => {
        // handle getting instance of @sasjs/adapter and auth config failure
        process.logger?.error(
          'Unable to execute job. Error fetching auth config: ',
          err
        )

        return {
          sasjs: getSASjs(target),
          authConfig: undefined,
          authConfigSas9: undefined
        }
      }
    )

    const sasjs = sasjsAndAuthConfig.sasjs
    const authConfig = sasjsAndAuthConfig.authConfig
    const authConfigSas9 = (
      sasjsAndAuthConfig as { authConfigSas9: AuthConfigSas9 }
    ).authConfigSas9

    if (!sasjs || (!authConfig && !authConfigSas9)) {
      return ReturnCode.InternalError
    }

    this.sasjs = sasjs
    this.authConfig = authConfig || authConfigSas9

    if (this.verbose) this.sasjs.setVerboseMode(this.verbose)

    // use execution function based on server type
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

  /**
   * Executes job on SASJS server.
   * @param target - SASJS server configuration.
   * @returns - promise that resolves into return code.
   */
  async executeJobSasjs(target: Target) {
    // use command attributes to get to get required details for job execution
    const jobPath = prefixAppLoc(target.appLoc, this.parsed.jobPath as string)
    const log = getLogFilePath(this.parsed.log, jobPath)

    const output = (this.parsed.output as string)?.length
      ? (this.parsed.output as string)
      : undefined

    const returnCode = await executeJobSasjs(
      this.sasjs,
      target,
      jobPath,
      log,
      output,
      this.authConfig as AuthConfig
    )
      .then(() => ReturnCode.Success)
      .catch((err) => {
        // handle job execution failure
        process.logger?.error('Error executing job: ', err)

        return ReturnCode.InternalError
      })

    return returnCode
  }

  /**
   * Executes job on SAS9 server.
   * @param target - SAS9 server configuration.
   * @returns - promise that resolves into return code.
   */
  async executeJobSas9(target: Target) {
    // use command attributes to get to get required details for job execution
    const jobPath = prefixAppLoc(target.appLoc, this.parsed.jobPath as string)
    const log = getLogFilePath(this.parsed.log, jobPath)
    const source = this.parsed.source as string

    const output = (this.parsed.output as string)?.length
      ? (this.parsed.output as string)
      : undefined

    this.authConfig = this.authConfig as AuthConfigSas9

    const userName = this.authConfig.userName
    const password = decodeFromBase64(this.authConfig.password)

    const returnCode = await executeJobSas9(
      this.sasjs,
      { userName, password },
      jobPath,
      log,
      output,
      source
    )
      .then(() => ReturnCode.Success)
      .catch((err) => {
        // handle job execution failure
        process.logger?.error('Error executing job: ', err)

        return ReturnCode.InternalError
      })

    return returnCode
  }

  /**
   * Executes job on Viya server.
   * @param target - Viya server configuration.
   * @returns - promise that resolves into return code.
   */
  async executeJobViya(target: Target) {
    // use command attributes to get to get required details for job execution
    const jobPath = prefixAppLoc(target.appLoc, this.parsed.jobPath as string)
    const statusFile = getStatusFilePath(this.parsed.statusFile)
    const log = getLogFilePath(this.parsed.log, jobPath)
    const ignoreWarnings = !!this.parsed.ignoreWarnings
    const streamLog = !!this.parsed.streamLog
    const source = this.parsed.source as string
    let wait = (this.parsed.wait as boolean) || !!log

    const output = (this.parsed.output as string)?.length
      ? (this.parsed.output as string)
      : (this.parsed.output as string)?.length === 0
      ? true
      : false

    if (!!this.verbose && !wait) wait = true

    const returnCode = await executeJobViya(
      this.sasjs,
      this.authConfig as AuthConfig,
      jobPath,
      target,
      wait,
      output,
      log,
      statusFile,
      ignoreWarnings,
      source,
      streamLog
    )
      .then(() => ReturnCode.Success)
      .catch((err) => {
        // handle job execution failure
        process.logger?.error('Error executing job: ', err)

        return ReturnCode.InternalError
      })

    return returnCode
  }
}

/**
 * Gets status file path.
 * @param statusFileArg - file path provided as command attribute.
 * @returns - absolute status file path or undefined if command attribute wasn't provided.
 */
const getStatusFilePath = (statusFileArg: unknown) => {
  if (statusFileArg) {
    const currentDirPath = path.isAbsolute(statusFileArg as string)
      ? ''
      : process.projectDir

    return path.join(currentDirPath, statusFileArg as string)
  }

  return undefined
}

/**
 * Determines verbose mode based on command arguments.
 * @param args - command arguments.
 * @param verboseArg - value of the verbose argument.
 * @returns - verbose mode.
 */
const getVerbose = (args: string[], verboseArg: unknown) => {
  const verboseArgPresent = args.includes('-v') || args.includes('--verbose')

  if (verboseArgPresent) {
    // if verboseArg, use the string as verbose mode(any strings not equal to
    // 'bleached' will be ignored)
    if (typeof verboseArg === 'string') return verboseArg as VerboseMode

    return true
  }

  return undefined
}
