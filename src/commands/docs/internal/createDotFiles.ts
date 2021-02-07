import path from 'path'
import shelljs from 'shelljs'
import chalk from 'chalk'
import ora from 'ora'

import { createFolder } from '../../../utils/file'
import { getList, getBrief, readFile, createFile } from '../../../utils/file'

import { getDotFileContent } from './getDotFileContent'

export async function createDotFiles(
  folderList: string[],
  outDirectory: string,
  serverUrl: string
) {
  const spinner = ora(
    chalk.greenBright('Generating Dot files', chalk.cyanBright(outDirectory))
  )
  spinner.start()

  await createFolder(outDirectory)

  const dotFileContent = await getDotFileContent(folderList, serverUrl)
  const dotFilePath = path.join(outDirectory, 'generated_code.dot')
  const dotGraphPath = path.join(outDirectory, 'graph_diagram.svg')

  await createFile(dotFilePath, dotFileContent)

  const { stderr, code } = shelljs.exec(
    `dot -Tsvg -o ${dotGraphPath} ${dotFilePath}`,
    {
      silent: true
    }
  )
  spinner.stop()
}
