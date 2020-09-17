import SASjs from '@sasjs/adapter/node'
import { displayResult } from '../utils/displayResult'
import { getAccessToken } from '../utils/config-utils'
import { isAccessTokenExpiring, getNewAccessToken } from '../utils/auth-utils'
import { getVariable } from '../utils/utils'

export async function remove(contextName, target) {
  const sasjs = new SASjs({
    serverUrl: target.serverUrl,
    serverType: target.serverType
  })

  let accessToken

  try {
    accessToken = getAccessToken(target)
  } catch (err) {
    displayResult(err)
  }

  // REFACTOR
  if (isAccessTokenExpiring(accessToken)) {
    const client = await getVariable('client', target)
    const secret = await getVariable('secret', target)

    const authInfo = await getNewAccessToken(sasjs, client, secret, target)

    accessToken = authInfo.access_token
  }

  const deletedContext = await sasjs
    .deleteContext(contextName, accessToken)
    .catch((err) => {
      displayResult(
        err,
        `An error has occurred when deleting context '${contextName}'.`,
        null
      )
    })

  if (deletedContext) {
    displayResult(null, null, `Context '${contextName}' has been deleted!`)
  }
}
