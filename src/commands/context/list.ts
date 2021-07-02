import ora from 'ora'
import { AuthConfig, ServerType, Target } from '@sasjs/utils/types'
import { displayError, displaySuccess } from '../../utils/displayResult'
import SASjs from '@sasjs/adapter/node'

/**
 * Lists all accessible and inaccessible compute contexts.
 * @param {object} target - SAS server configuration.
 * @param {object} sasjs - configuration object of SAS adapter.
 * @param {string} authConfig - an access token, refresh token, client and secret for an authorized user.
 */
export async function list(
  target: Target,
  sasjs: SASjs,
  authConfig: AuthConfig
) {
  if (target.serverType !== ServerType.SasViya) {
    throw new Error(
      `'context list' command is only supported for SAS Viya build targets.\nPlease check the target name and try again.`
    )
  }

  const startTime = new Date().getTime()

  const spinner = ora(
    `Checking the compute contexts on ${target.serverUrl} ...\n`
  )

  spinner.start()

  const contexts = await sasjs
    .getExecutableContexts(authConfig)
    .catch((err) => {
      displayError(err, 'An error has occurred when fetching contexts list.')
    })

  let result

  if (contexts) {
    const accessibleContexts = contexts.map((context) => ({
      createdBy: context.createdBy,
      id: context.id,
      name: context.name,
      version: context.version,
      sysUserId: context.attributes.sysUserId
    }))
    const accessibleContextIds = contexts.map((context) => context.id)

    const allContexts = await sasjs
      .getComputeContexts(authConfig.access_token)
      .catch((err) => {
        displayError(err, 'An error has occurred when fetching contexts list.')
        throw err
      })

    const inaccessibleContexts = allContexts
      .filter((context) => !accessibleContextIds.includes(context.id))
      .map((context) => ({
        createdBy: context.createdBy,
        id: context.id,
        name: context.name,
        version: context.version,
        sysUserId: 'NOT ACCESSIBLE'
      }))

    if (accessibleContexts.length) {
      result = accessibleContexts

      displaySuccess(
        'Accessible contexts:\n' +
          accessibleContexts.map((c, i) => `${i + 1}. ${c.name}\n`).join('')
      )
    }

    if (inaccessibleContexts.length) {
      displaySuccess(
        'Inaccessible contexts:\n' +
          inaccessibleContexts.map((c, i) => `${i + 1}. ${c.name}\n`).join('')
      )
    }
  }

  spinner.stop()

  const endTime = new Date().getTime()

  process.logger?.info(
    `This operation took ${(endTime - startTime) / 1000} seconds`
  )

  return result ? result : false
}
