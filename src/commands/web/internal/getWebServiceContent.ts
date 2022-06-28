import { ServerType, chunk } from '@sasjs/utils'
import { sasjsout } from './sasjsout'

export const getWebServiceContent = async (
  contentBase64: string,
  type = 'JS',
  serverType: ServerType
) => {
  let lines = [contentBase64]

  // Encode to base64 *.js and *.css files if target server type is SAS 9.
  const typesToEncode: { [key: string]: string } = {
    JS: 'JS64',
    CSS: 'CSS64'
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

  if (serverType === ServerType.Sas9 && typesToEncode.hasOwnProperty(type)) {
    serviceContent += `\nrun;\n%sasjsout(${typesToEncode[type]})`
  } else {
    serviceContent += `\nrun;\n%sasjsout(${type})`
  }

  return serviceContent
}
