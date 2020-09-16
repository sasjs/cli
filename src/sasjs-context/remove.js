import SASjs from '@sasjs/adapter/node'
import { displayResult } from '../utils/displayResult'
import { getAccessToken } from '../utils/config-utils'

export async function remove(contextName, target) {
  const sasjs = new SASjs({
    serverUrl: target.serverUrl,
    serverType: target.serverType
  })

  const accessToken = getAccessToken(target)

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
