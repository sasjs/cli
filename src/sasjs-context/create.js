import SASjs from '@sasjs/adapter/node'
import { displayResult } from '../utils/displayResult'
import { getAccessToken } from '../utils/config-utils'
import { isAccessTokenExpiring, getNewAccessToken } from '../utils/auth-utils'
import { getVariable } from '../utils/utils'

export async function create(config, target) {
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

  const {
    name,
    launchName,
    sharedAccountId,
    autoExecLines,
    authorizedUsers
  } = config

  const createdContext = await sasjs
    .createContext(
      name,
      launchName,
      sharedAccountId,
      autoExecLines,
      authorizedUsers,
      accessToken
    )
    .catch((err) => {
      displayResult(err, 'An error has occurred when processing context.', null)
    })

  if (createdContext) {
    displayResult(
      null,
      null,
      `Context '${name}' with id '${createdContext.id}' successfully created!`
    )
  }
}
