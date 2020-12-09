import { displayResult } from '../../utils/displayResult'
import path from 'path'
import { createFile, sanitizeFileName } from '../../utils/file'

/**
 * Export compute context to json file in current folder.
 * @param {string} contextName - name of the context to export.
 * @param {object} sasjs - configuration object of SAS adapter.
 * @param {string} accessToken - an access token for an authorized user.
 */
export async function exportContext(contextName, sasjs, accessToken) {
  const context = await sasjs
    .getComputeContextByName(contextName, accessToken)
    .catch((err) => {
      displayResult(err, '', null)
    })

  let result

  if (context && context.id) {
    const contextAllAttributes = await sasjs
      .getComputeContextById(context.id, accessToken)
      .catch((err) => displayResult(err, '', null))

    if (contextAllAttributes) {
      delete contextAllAttributes.links

      result = true

      let output

      try {
        output = JSON.stringify(contextAllAttributes, null, 2)
      } catch (error) {
        displayResult(null, null, 'Context has bad format.')

        return false
      }

      const outputFileName = sanitizeFileName(contextName) + '.json'
      const outputPath = path.join(process.cwd(), outputFileName)

      await createFile(outputPath, output).catch((err) => {
        result = err
      })

      displayResult(
        null,
        null,
        `Context successfully exported to '${outputPath}'.`
      )
    }
  }

  return result
}
