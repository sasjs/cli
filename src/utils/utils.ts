import shelljs from 'shelljs'
import path from 'path'
import os from 'os'
import ora from 'ora'
import {
  fileExists,
  folderExists,
  createFile,
  readFile,
  copy,
  LogLevel,
  Target
} from '@sasjs/utils'
import SASjs from '@sasjs/adapter/node'
import { displayError } from './displayResult'
import dotenv from 'dotenv'

export async function inExistingProject(folderPath: string) {
  const packageJsonExists = await fileExists(
    path.join(process.projectDir, folderPath, 'package.json')
  )

  return packageJsonExists
}

export function diff(a: any[], b: any[]) {
  const notInA = a.filter((item) =>
    typeof item === 'object'
      ? !JSON.stringify(b).includes(JSON.stringify(item))
      : !b.includes(item)
  )
  const notInB = b.filter((item) =>
    typeof item === 'object'
      ? !JSON.stringify(a).includes(JSON.stringify(item))
      : !a.includes(item)
  )

  return [...notInA, ...notInB]
}

export async function createReactApp(folderPath: string): Promise<void> {
  return new Promise(async (resolve, _) => {
    createApp(folderPath, 'https://github.com/sasjs/react-seed-app.git')

    return resolve()
  })
}

export async function createAngularApp(folderPath: string): Promise<void> {
  return new Promise(async (resolve, _) => {
    createApp(folderPath, 'https://github.com/sasjs/angular-seed-app.git')
    return resolve()
  })
}

export async function createMinimalApp(folderPath: string): Promise<void> {
  return new Promise(async (resolve, _) => {
    createApp(folderPath, 'https://github.com/sasjs/minimal-seed-app.git')
    return resolve()
  })
}

export async function createTemplateApp(folderPath: string, template: string) {
  return new Promise<void>(async (resolve, reject) => {
    const { stdout, stderr, code } = shelljs.exec(
      `git ls-remote https://username:password@github.com/sasjs/template_${template}.git`,
      {
        silent: true
      }
    )

    if (stderr.includes('Repository not found') || code) {
      return reject(new Error(`Template "${template}" is not a SASjs template`))
    }

    if (!stdout) {
      return reject(new Error(`Unable to fetch template "${template}"`))
    }

    createApp(folderPath, `https://github.com/sasjs/template_${template}.git`)
    return resolve()
  })
}

function createApp(
  folderPath: string,
  repoUrl: string,
  installDependencies = true
) {
  const spinner = ora(`Creating SASjs project in ${folderPath}.`)
  spinner.start()

  const gitBranch = repoUrl.includes('template_sasonly')
    ? 'master'
    : repoUrl.includes('template_jobs')
    ? 'master'
    : 'main'

  shelljs.exec(
    `cd "${folderPath}" && git clone --depth 1 -b ${gitBranch} ${repoUrl} .`,
    {
      silent: true
    }
  )

  shelljs.rm('-rf', path.join(folderPath, '.git'))

  spinner.stop()
  if (installDependencies) {
    spinner.text = 'Installing dependencies...'
    spinner.start()
    shelljs.exec(`cd "${folderPath}" && npm install`, {
      silent: true
    })
    spinner.stop()
  }
}

export async function setupNpmProject(folderName: string): Promise<void> {
  const folderPath = path.join(process.projectDir, folderName)
  return new Promise(async (resolve, _) => {
    const isExistingProject = await inExistingProject(folderPath)
    if (!isExistingProject) {
      process.logger?.info(`Initialising NPM project in ${folderPath}`)
      shelljs.exec(`cd "${folderPath}" && npm init --yes`, {
        silent: true
      })
    } else {
      process.logger?.success('Existing NPM project detected.')
    }
    process.logger?.info('Installing @sasjs/core')
    shelljs.exec(`cd "${folderPath}" && npm i @sasjs/core --save`, {
      silent: true
    })
    return resolve()
  })
}

export async function setupGitIgnore(folderName: string): Promise<void> {
  const gitIgnoreFilePath = path.join(
    process.projectDir,
    folderName,
    '.gitignore'
  )
  const gitIgnoreExists = await fileExists(gitIgnoreFilePath)

  if (gitIgnoreExists) {
    const gitIgnoreContent = await readFile(gitIgnoreFilePath)
    let newgitIgnoreContent = gitIgnoreContent

    const regExpSasjsBuild = new RegExp(`^sasjsbuild\/`, 'gm')
    newgitIgnoreContent = newgitIgnoreContent.match(regExpSasjsBuild)
      ? newgitIgnoreContent
      : `${newgitIgnoreContent ? newgitIgnoreContent + '\n' : ''}sasjsbuild/\n`

    const regExpSasjsResults = new RegExp(`^sasjsresults\/`, 'gm')
    newgitIgnoreContent = newgitIgnoreContent.match(regExpSasjsResults)
      ? newgitIgnoreContent
      : `${
          newgitIgnoreContent ? newgitIgnoreContent + '\n' : ''
        }sasjsresults/\n`

    const regExpNodeModules = new RegExp(`^node_modules\/`, 'gm')
    newgitIgnoreContent = newgitIgnoreContent.match(regExpNodeModules)
      ? newgitIgnoreContent
      : `${newgitIgnoreContent + '\n'}node_modules/\n`

    if (gitIgnoreContent !== newgitIgnoreContent) {
      await createFile(gitIgnoreFilePath, newgitIgnoreContent)
      process.logger?.success('Existing .gitignore has been updated.')
    }
  } else {
    await createFile(
      gitIgnoreFilePath,
      'node_modules/\nsasjsbuild/\nsasjsresults/\n.env*\n'
    )

    process.logger?.success('.gitignore file has been created.')
  }

  const folderPath = path.join(process.projectDir, folderName)
  const gitDirectoryExists = await folderExists(path.join(folderPath, '.git'))
  if (!gitDirectoryExists) {
    shelljs.exec(`cd ${folderName} && git init`, {
      silent: true
    })
  }
}

export async function setupGhooks(folderName: string) {
  const folderPath = path.join(process.projectDir, folderName)

  process.logger?.info('Installing ghooks')
  shelljs.exec(`cd "${folderPath}" && npm i ghooks --save-dev`, {
    silent: true
  })

  try {
    const packageJsonPath = path.join(folderPath, 'package.json')
    const packageJsonContent = await readFile(packageJsonPath)
    const packageJson = JSON.parse(packageJsonContent)

    if (!packageJson.config) packageJson.config = {}

    if (!packageJson.config.ghooks) packageJson.config.ghooks = {}

    let preCommitCmd = 'sasjs lint'
    if (packageJson.config.ghooks['pre-commit']) {
      preCommitCmd = ' && sasjs lint'
    } else {
      packageJson.config.ghooks['pre-commit'] = ''
    }

    if (!/sasjs lint/.test(packageJson.config.ghooks['pre-commit']))
      packageJson.config.ghooks['pre-commit'] += preCommitCmd

    await createFile(packageJsonPath, JSON.stringify(packageJson, null, 2))
  } catch (e) {}
}

export async function setupDoxygen(folderPath: string): Promise<void> {
  const doxyFilesPath = '../doxy'
  const doxyFolderPathSource = path.join(__dirname, doxyFilesPath)
  const doxyFolderPath = path.join(
    process.projectDir,
    folderPath,
    'sasjs',
    'doxy'
  )
  await copy(doxyFolderPathSource, doxyFolderPath)
}

/**
 * Removes comments from a given block of text.
 * Preserves single line block comments and inline comments.
 * @param {string} text - the text to remove comments from.
 */
export function removeComments(text: string) {
  if (!text) return ''

  const lines = text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((l) => l.trimEnd())

  const linesWithoutComment: string[] = []
  let inCommentBlock = false
  lines.forEach((line) => {
    if (line.includes('/*') && line.includes('*/')) {
      linesWithoutComment.push(line)
    } else {
      if (line.startsWith('/*') && !line.endsWith('*/')) {
        inCommentBlock = true
      }
      if (!inCommentBlock) {
        linesWithoutComment.push(line)
      }
      if (line.endsWith('*/') && !line.includes('/*') && inCommentBlock) {
        inCommentBlock = false
      }
    }
  })
  return linesWithoutComment.filter((l) => !!l.trim()).join('\n')
}

export function getUniqServicesObj(services: string[]) {
  let returnObj: any = {}
  if (!services) return returnObj
  services.forEach((service) => {
    const serviceName = service.split('/').pop()
    if (returnObj[serviceName!]) return
    returnObj[serviceName!] = service
  })
  return returnObj
}

export async function executeShellScript(
  filePath: string,
  logFilePath: string
) {
  return new Promise(async (resolve, reject) => {
    // fix for cli test executions
    // using cli, process.cwd() and process.projectDir should be same
    const currentCWD = process.cwd()
    const result = shelljs.exec(
      `cd ${process.projectDir} && bash ${filePath} && cd ${currentCWD}`,
      {
        silent: true,
        async: false
      }
    )
    if (result.code) {
      process.logger?.error(`Error: ${result.stderr}`)
      reject(result.code)
      throw new Error('Error executing shell script: Code ' + result.code)
    } else {
      if (logFilePath) {
        await createFile(logFilePath, result.stdout)
      }
      resolve(result.stdout)
    }
  })
}

export function chunk(text: string, maxLength = 220) {
  if (text.length <= maxLength) {
    return [text]
  }
  return (text.match(new RegExp('.{1,' + maxLength + '}', 'g')) || []).filter(
    (m) => !!m
  )
}

/**
 * Extracts plain text job log from fetched json log
 * @param {object} logJson
 */
export function parseLogLines(logJson: { items: { line: string }[] }) {
  let logLines = ''

  for (let item of logJson.items) {
    logLines += `${item.line}\n`
  }

  return logLines
}

export const arrToObj = (arr: any[]): any =>
  arr.reduce((o, key) => ({ ...o, [key]: key }), {})

export const millisecondsToDdHhMmSs = (milliseconds: number): string => {
  if (typeof milliseconds !== 'number') throw 'Not supported attribute type.'

  milliseconds = Math.abs(milliseconds)

  const days = Math.floor(milliseconds / 1000 / 60 / 60 / 24)
  const hours = Math.floor(milliseconds / 1000 / 60 / 60) % 24
  const minutes = Math.floor(milliseconds / 1000 / 60) % 60
  const seconds = Math.floor(milliseconds / 1000) % 60

  return `${days} day(s); ${hours} hour(s); ${minutes} minute(s); ${seconds} second(s)`
}

export function checkNodeVersion() {
  const nodeVersion = process.versions.node
  const majorVersion = parseInt(nodeVersion.substr(0, 2))
  if (majorVersion < 12) {
    process.logger?.error(
      'SASjs CLI requires at least NodeJS version 12. Please upgrade NodeJS and try again.'
    )
    process.exit(1)
  }
}

export function getAdapterInstance(target: Target): SASjs {
  if (!target) {
    throw new Error('Unable to create SASjs adapter instance: Invalid target.')
  }

  if (!target.serverUrl) {
    throw new Error(
      `Unable to create SASjs adapter instance: Target ${target.name} is missing a \`serverUrl\`.`
    )
  }

  if (!target.serverType) {
    throw new Error(
      `Unable to create SASjs adapter instance: Target ${target.name} is missing a \`serverType\`.`
    )
  }

  const sasjs = new SASjs({
    serverUrl: target.serverUrl,
    serverType: target.serverType,
    allowInsecureRequests: target.allowInsecureRequests,
    contextName: target.contextName,
    useComputeApi: true,
    debug: process.env.LOG_LEVEL === LogLevel.Debug
  })

  return sasjs
}

export function displaySasjsRunnerError(username: string) {
  const sasjsRunnerCode = `
filename mc url "https://raw.githubusercontent.com/sasjs/core/main/all.sas";
%inc mc;
filename ft15f001 temp;
parmcards4;
%macro sasjs_runner();
%if %symexist(_webin_fileref) %then %do;
%inc &_webin_fileref;
%end;
%mend sasjs_runner;
%sasjs_runner()
;;;;
%mm_createwebservice(path=/User Folders/&sysuserid/My Folder/sasjs,name=runner)
`

  const message = `The SASjs runner was not found in your user folder at /User Folders/${username}/My Folder/sasjs/runner.`
  displayError(message, 'An error occurred while executing the request.')
  process.logger?.info(
    `Please deploy the SASjs runner by running the code below and try again:\n${sasjsRunnerCode}`
  )
}

export const getAbsolutePath = (providedPath: string, relativePath: string) =>
  path.isAbsolute(providedPath) || /^~/.exec(providedPath)
    ? path.normalize(providedPath.replace(/^~/, os.homedir()))
    : path.join(relativePath, providedPath)

export const loadEnvVariables = async (fileName: string) => {
  const envFileExistsInCurrentPath = await fileExists(
    path.join(process.cwd(), fileName)
  )
  const envFileExistsInParentPath = await fileExists(
    path.join(process.cwd(), '..', fileName)
  )
  const envFilePath = envFileExistsInCurrentPath
    ? path.join(process.cwd(), fileName)
    : envFileExistsInParentPath
    ? path.join(process.cwd(), '..', fileName)
    : null
  if (envFilePath) {
    dotenv.config({ path: envFilePath })
  }
}

export function prefixAppLoc(appLoc = '', path = '') {
  if (!path) return null

  if (!/^\//.test(appLoc)) appLoc = '/' + appLoc

  if (Array.isArray(path)) path = path.join(' ')

  return path
    .split(' ')
    .map((p) => (/^\//.test(p) ? p : `${appLoc}/${p}`))
    .join(' ')
}

export const isWindows = () => process.platform === 'win32'
