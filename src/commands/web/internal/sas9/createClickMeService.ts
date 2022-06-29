import path from 'path'
import { chunk, createFile } from '@sasjs/utils'
import { sasjsout } from '../sasjsout'

/**
 * Creates index service file for SAS9 server only.
 * @param {string} indexHtmlContent contents of index source file.
 * @param {string} fileName name of index service file.
 */
export const createClickMeService = async (
  indexHtmlContent: string,
  fileName: string
) => {
  const lines = indexHtmlContent.replace(/\r\n/g, '\n').split('\n')
  let clickMeServiceContent = `${sasjsout()}\nfilename sasjs temp lrecl=99999999;\ndata _null_;\nfile sasjs;\n`

  lines.forEach((line) => {
    const chunkedLines = chunk(line)
    if (chunkedLines.length === 1) {
      if (chunkedLines[0].length == 0) chunkedLines[0] = ' '

      clickMeServiceContent += `put '${chunkedLines[0]
        .split("'")
        .join("''")}';\n`
    } else {
      let combinedLines = ''
      chunkedLines.forEach((chunkedLine, index) => {
        let text = `put '${chunkedLine.split("'").join("''")}'`
        if (index !== chunkedLines.length - 1) {
          text += '@;\n'
        } else {
          text += ';\n'
        }
        combinedLines += text
      })
      clickMeServiceContent += combinedLines
    }
  })
  clickMeServiceContent += 'run;\n%sasjsout(HTML)'
  const { buildDestinationServicesFolder } = process.sasjsConstants
  await createFile(
    path.join(buildDestinationServicesFolder, `${fileName}.sas`),
    clickMeServiceContent
  )
}
