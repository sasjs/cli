import SASjs from '@sasjs/adapter/node'
import chalk from 'chalk'
import ora from 'ora'
import { displayResult } from '../utils/displayResult'
import { getAccessToken } from '../utils/config-utils'
import { isAccessTokenExpired, getNewAccessToken } from '../utils/auth-utils'
import { getVariable } from '../utils/utils'

export async function list(target) {
  if (target.serverType !== 'SASVIYA') {
    throw new Error(
      `'context list' command is only supported for SAS Viya build targets.\nPlease check the target name and try again.`
    )
  }

  const sasjs = new SASjs({
    serverUrl: target.serverUrl,
    appLoc: target.appLoc,
    serverType: target.serverType
  })

  const startTime = new Date().getTime()
  let accessToken = getAccessToken(target)

  // REFACTOR
  if (isAccessTokenExpired(accessToken)) {
    const client = await getVariable('client', target)
    const secret = await getVariable('secret', target)

    const authInfo = await getNewAccessToken(sasjs, client, secret, target)

    accessToken = authInfo.access_token
  }

  const spinner = ora(
    `Checking the compute contexts on ${chalk.greenBright(
      target.serverUrl
    )}...\n`
  )

  spinner.start()

  const contexts = await sasjs
    .getExecutableContexts(accessToken)
    .catch((err) => {
      displayResult(
        err,
        'An error has occurred when fetching contexts list.',
        null
      )
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

    const allContexts = await sasjs.getAllContexts(accessToken).catch((err) => {
      displayResult(
        err,
        'An error has occurred when fetching contexts list.',
        null
      )
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
      displayResult(
        null,
        null,
        'Accessible contexts:\n' +
          accessibleContexts.map((c, i) => `${i + 1}. ${c.name}\n`).join('')
      )
    }

    if (inaccessibleContexts.length) {
      displayResult(
        null,
        null,
        'Inaccessible contexts:\n' +
          inaccessibleContexts.map((c, i) => `${i + 1}. ${c.name}\n`).join('')
      )
    }
  }

  spinner.stop()

  const endTime = new Date().getTime()

  console.log(
    chalk.whiteBright(
      `This operation took ${(endTime - startTime) / 1000} seconds`
    )
  )
}
