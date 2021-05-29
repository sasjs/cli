import { displayError, displaySuccess } from '../../utils/displayResult'
import path from 'path'
import { createFile } from '@sasjs/utils/file'
import { sanitizeFileName } from '../../utils/file'
import SASjs from '@sasjs/adapter/node'

/**
 * Export compute context to json file in current folder.
 * @param {string} contextName - name of the context to export.
 * @param {object} sasjs - configuration object of SAS adapter.
 * @param {string} accessToken - an access token for an authorized user.
 */
export async function exportContext(
  contextName: string,
  sasjs: SASjs,
  accessToken: string
) {
  const context = await sasjs
    .getComputeContextByName(contextName, accessToken)
    .catch((err) => {
      displayError(
        err,
        `An error has occurred while fetching context ${contextName}`
      )
    })

  let result

  if (context && context.id) {
    const contextAllAttributes = await sasjs
      .getComputeContextById(context.id, accessToken)
      .catch((err) => {
        displayError(
          err,
          `An error has occurred while fetching context ${contextName}`
        )
      })

    if (contextAllAttributes) {
      delete (contextAllAttributes as any).links

      result = true

      let output

      try {
        output = JSON.stringify(contextAllAttributes, null, 2)
      } catch (error) {
        displayError(null, 'Error parsing context JSON.')

        return false
      }

      const outputFileName = sanitizeFileName(contextName) + '.json'
      const outputPath = path.join(process.cwd(), outputFileName)

      await createFile(outputPath, output).catch((err) => {
        result = err
      })

      displaySuccess(`Context successfully exported to '${outputPath}'.`)
    }
  }

  return result
}
