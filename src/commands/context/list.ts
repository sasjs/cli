import ora from 'ora'
import { AuthConfig, Target } from '@sasjs/utils/types'
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
  const startTime = new Date().getTime()

  const spinner = ora(
    `Checking the compute contexts on ${target.serverUrl} ...\n`
  )

  spinner.start()

  const contexts = await sasjs
    .getExecutableContexts(authConfig)
    .catch((err) => {
      spinner.stop()
      process.logger?.error('Error listing contexts: ', err)
      throw err
    })

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
        spinner.stop()
        process.logger?.error('Error listing contexts: ', err)
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
      process.logger?.success(
        'Accessible contexts:\n' +
          accessibleContexts.map((c, i) => `${i + 1}. ${c.name}\n`).join('')
      )
    }

    if (inaccessibleContexts.length) {
      process.logger?.success(
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
}
