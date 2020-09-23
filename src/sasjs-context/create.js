import SASjs from '@sasjs/adapter/node'
import { displayResult } from '../utils/displayResult'
import { getAccessToken } from '../utils/config-utils'

export async function create(config, target) {
  const sasjs = new SASjs({
    serverUrl: target.serverUrl,
    serverType: target.serverType
  })

  const accessToken = await getAccessToken(target).catch((err) => {
    displayResult(err)
  })

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
