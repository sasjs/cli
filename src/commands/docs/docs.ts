import path from 'path'
import shelljs from 'shelljs'
import chalk from 'chalk'
import ora from 'ora'

import { createFolder } from '../../utils/file'
import { getConstants } from '../../constants'

export async function docs(outDirectory: string) {
  const { doxyContent, buildDestinationDocsFolder } = getConstants()
  if (!outDirectory) outDirectory = buildDestinationDocsFolder

  await createFolder(outDirectory)

  const spinner = ora(
    chalk.greenBright('Generating docs', chalk.cyanBright(outDirectory))
  )

  const doxyConfigPath = path.join(doxyContent, 'Doxyfile')

  spinner.start()
  const DOXY_INPUT = './sasjs/'
  const HTML_HEADER = path.join(doxyContent, 'new_header.html')
  const HTML_FOOTER = path.join(doxyContent, 'new_footer.html')
  const HTML_EXTRA_STYLESHEET = path.join(doxyContent, 'new_stylesheet.css')
  const LAYOUT_FILE = path.join(doxyContent, 'DoxygenLayout.xml')
  const PROJECT_LOGO = path.join(doxyContent, 'Macro_core_website_1.png')

  const doxyParams =
    `HTML_HEADER=${HTML_HEADER} ` +
    `HTML_FOOTER=${HTML_FOOTER} ` +
    `HTML_EXTRA_STYLESHEET=${HTML_EXTRA_STYLESHEET} ` +
    `LAYOUT_FILE=${LAYOUT_FILE}` +
    `PROJECT_LOGO=${PROJECT_LOGO}` +
    `DOXY_INPUT=${DOXY_INPUT} DOXY_HTML_OUTPUT=${outDirectory}`

  shelljs.exec(`${doxyParams} doxygen ${doxyConfigPath}`, {
    silent: true
  })
  spinner.stop()
}
