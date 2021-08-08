import path from 'path'
import { createFile } from '@sasjs/utils'
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
      process.logger?.error(
        `An error has occurred while fetching context ${contextName}: `,
        err
      )
      throw err
    })

  if (context && context.id) {
    const contextAllAttributes = await sasjs
      .getComputeContextById(context.id, accessToken)
      .catch((err) => {
        process.logger?.error(
          `An error has occurred while fetching context ${contextName}: `,
          err
        )
        throw err
      })

    if (contextAllAttributes) {
      delete (contextAllAttributes as any).links

      let output

      try {
        output = JSON.stringify(contextAllAttributes, null, 2)
      } catch (error) {
        process.logger?.error('Error stringifying context JSON: ', error)
        throw error
      }

      const outputFileName = sanitizeFileName(contextName) + '.json'
      const outputPath = path.join(process.cwd(), outputFileName)

      await createFile(outputPath, output).catch((err) => {
        process.logger?.error('Error creating context JSON file: ', err)
        throw err
      })

      process.logger?.success(
        `Context successfully exported to '${outputPath}'.`
      )
    }
  }
}
