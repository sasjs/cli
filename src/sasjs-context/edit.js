import SASjs from '@sasjs/adapter/node'
import { displayResult } from '../utils/displayResult'
import { getAccessToken } from '../utils/config-utils'
import { isAccessTokenExpiring, getNewAccessToken } from '../utils/auth-utils'
import { getVariable } from '../utils/utils'

export async function edit(config, target) {
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

  const { name, updatedContext } = config

  const editedContext = await sasjs
    .editContext(name, updatedContext, accessToken)
    .catch((err) => {
      displayResult(err, 'An error has occurred when processing context.', null)
    })

  if (editedContext) {
    const editedContextName = editedContext.result.name || ''

    displayResult(
      null,
      null,
      `Context '${editedContextName}' successfully updated!`
    )
  }
}
