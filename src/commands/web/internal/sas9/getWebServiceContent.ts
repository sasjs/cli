import { chunk } from '@sasjs/utils'
import { sasjsout } from '../sasjsout'

/**
 * Prepares service code for SAS9 server only.
 * @param {string} contentBase64 source code in base64.
 * @param {string} type extension of source code's file in uppercase.
 * @returns {string} service contents of provided source code.
 */
export const getWebServiceContent = async (
  contentBase64: string,
  type = 'JS'
) => {
  let lines = [contentBase64]

  // Encode to base64 *.svg, *.js and *.css files if target server type is SAS 9.
  const typesToEncode: { [key: string]: string } = {
    JS: 'JS64',
    CSS: 'CSS64',
    SVG: 'SVG64'
  }

  let serviceContent = `${sasjsout()}\nfilename sasjs temp lrecl=99999999;
data _null_;
file sasjs;
`

  lines.forEach((line) => {
    const chunkedLines = chunk(line)
    if (chunkedLines.length === 1) {
      serviceContent += `put '${chunkedLines[0].split("'").join("''")}';\n`
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
      serviceContent += combinedLines
    }
  })

  if (typesToEncode.hasOwnProperty(type)) {
    serviceContent += `\nrun;\n%sasjsout(${typesToEncode[type]})`
  }

  return serviceContent
}
