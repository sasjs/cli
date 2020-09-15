import SASjs from '@sasjs/adapter/node'
import { displayResult } from '../utils/displayResult'

export async function edit(config, target) {
  const sasjs = new SASjs({
    serverUrl: target.serverUrl,
    serverType: target.serverType
  })

  const accessToken = target.authInfo.access_token
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
