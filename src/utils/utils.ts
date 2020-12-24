import shelljs from 'shelljs'
import chalk from 'chalk'
import path from 'path'
import ora from 'ora'
import { fileExists, createFile, readFile } from './file'

async function inExistingProject(folderPath: string) {
  const packageJsonExists = await fileExists(
    path.join(process.projectDir, folderPath, 'package.json')
  )
  return packageJsonExists
}

export function diff(x: any[], y: any[]) {
  return x.filter((a) => !y.includes(a))
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
  const { stdout, stderr, code } = shelljs.exec(
    `git ls-remote https://username:password@github.com/sasjs/template_${template}.git`,
    {
      silent: true
    }
  )

  if (stderr.includes('Repository not found') || code) {
    throw `Template "${template}" is not sasjs template`
  }

  if (!stdout) {
    throw `Unable to fetch template "${template}"`
  }

  return new Promise<void>(async (resolve, _) => {
    createApp(folderPath, `https://github.com/sasjs/template_${template}.git`)
    return resolve()
  })
}

function createApp(
  folderPath: string,
  repoUrl: string,
  installDependencies = true
) {
  const spinner = ora(
    chalk.greenBright('Creating web app in', chalk.cyanBright(folderPath))
  )
  spinner.start()
  shelljs.exec(`cd ${folderPath} && git clone ${repoUrl} . && rm -rf .git`, {
    silent: true
  })
  spinner.stop()
  if (installDependencies) {
    spinner.text = chalk.greenBright('Installing dependencies...')
    spinner.start()
    shelljs.exec(`cd ${folderPath} && npm install`, {
      silent: true
    })
    spinner.stop()
  }
}

export async function setupNpmProject(folderPath: string): Promise<void> {
  folderPath = path.join(process.projectDir, folderPath)
  return new Promise(async (resolve, _) => {
    const isExistingProject = await inExistingProject(folderPath)
    if (!isExistingProject) {
      console.log(
        chalk.greenBright(
          'Initialising NPM project in',
          chalk.cyanBright(folderPath)
        )
      )
      shelljs.exec(`cd ${folderPath} && npm init --yes`, {
        silent: true
      })
    } else {
      console.log(chalk.greenBright('Existing NPM project detected.\n'))
    }
    console.log(chalk.greenBright('Installing @sasjs/core'))
    shelljs.exec(`cd ${folderPath} && npm i @sasjs/core --save`, {
      silent: true
    })
    return resolve()
  })
}

export async function setupGitIgnore(folderPath: string): Promise<void> {
  const gitIgnoreFilePath = path.join(
    process.projectDir,
    folderPath,
    '.gitignore'
  )
  const gitIgnoreExists = await fileExists(gitIgnoreFilePath)
  if (gitIgnoreExists) {
    const gitIgnoreContent = await readFile(gitIgnoreFilePath)
    await createFile(gitIgnoreFilePath, `${gitIgnoreContent}\nsasjsbuild/\n`)
    console.log(chalk.greenBright('Existing .gitignore has been updated.'))
  } else {
    shelljs.exec(`cd ${folderPath} && git init`, {
      silent: true
    })
    await createFile(gitIgnoreFilePath, 'node_modules/\nsasjsbuild/\n.env\n')
    console.log(chalk.greenBright('.gitignore file has been created.'))
  }
}

export async function asyncForEach(
  array: any[],
  callback: (item: any, index: number, originalArray: any[]) => any
) {
  for (let index = 0; index < array.length; index++) {
    await callback(array[index], index, array)
  }
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
      console.error(chalk.redBright('Error:\n'), chalk.red(result.stderr))
      reject(result.code)
      throw new Error(chalk.cyanBright('Ended with code ' + result.code))
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

/**
 * Returns a timestamp in YYYYMMDDSS format
 */
export function generateTimestamp(): string {
  const date = new Date()
  const timestamp = `${date.getUTCFullYear()}${
    date.getUTCMonth() + 1
  }${date.getUTCDate()}${date.getUTCHours()}${date.getUTCMinutes()}${date.getUTCSeconds()}`

  return timestamp
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
    console.log(
      chalk.redBright(
        'SASjs CLI requires at least NodeJS version 12. Please upgrade NodeJS and try again.'
      )
    )
    process.exit(1)
  }
}
