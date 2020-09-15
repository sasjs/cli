import SASjs from '@sasjs/adapter/node'
import { displayResult } from '../utils/displayResult'

export async function remove(config, target) {
  const sasjs = new SASjs({
    serverUrl: target.serverUrl,
    serverType: target.serverType
  })

  const accessToken = target.authInfo.access_token
  const { name } = config

  const deletedContext = await sasjs
    .deleteContext(name, accessToken)
    .catch((err) => {
      displayResult(
        err,
        `An error has occurred when deleting context '${name}'.`,
        null
      )
    })

  if (deletedContext) {
    displayResult(null, null, `Context '${name}' has been deleted!`)
  }
}
