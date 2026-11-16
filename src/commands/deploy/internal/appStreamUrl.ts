import { ServerType } from '@sasjs/utils'

/**
 * The address an app is served on, from the answer a deploy got back.
 *
 * The CLI does not guess it. A server that knows where it serves the app states
 * the `url` on the app it answers, and that is printed - relative to the server
 * URL when it is a path. Failing that, the stream name is the address every
 * server so far has served apps on: `/app/<name>/`. An id is not turned into a URL
 * here, because a server that has ids is a server that can say where it put them.
 */
export interface DeployAppAnswer {
  app?: { id?: string; url?: string }
  streamServiceName?: string
}

/**
 * The address a streamed app's entry page answers on.
 *
 * The build rewrote the app's asset links through the same route, so this is
 * the page that can actually load them: one level above the folder holding the
 * assets, read by name. Viya answers it at the job execution route and SASjs
 * server at its Drive API; the two spellings are fixed here rather than in each
 * deploy path, so the address printed and the address built into the page
 * cannot disagree.
 */
export const streamedAppUrl = (
  serverUrl: string,
  serverType: ServerType,
  appLoc: string,
  streamServiceName: string
): string => {
  const route =
    serverType === ServerType.Sasjs
      ? '/StoredProgram?_FILE='
      : '/SASJobExecution?_FILE='

  return `${serverUrl}${route}${encodeURI(appLoc)}/services/${streamServiceName}.html`
}

export const webAppStreamUrl = (
  serverUrl: string,
  answer: DeployAppAnswer | undefined
): string | undefined => {
  const stated = answer?.app?.url

  if (stated)
    return /^https?:\/\//i.test(stated) ? stated : `${serverUrl}${stated}`

  return answer?.streamServiceName
    ? `${serverUrl}/app/${answer.streamServiceName}/`
    : undefined
}

/**
 * Says where the app is, when the deploy published one.
 *
 * The call is the whole of what a caller has to do, which keeps the uncovered
 * path in the deploy command to one function call rather than a chain of
 * conditions nothing exercises.
 */
export const reportAppUrl = (
  serverUrl: string,
  answer: DeployAppAnswer | undefined,
  info?: (message: string) => void
): string | undefined => {
  const url = webAppStreamUrl(serverUrl, answer)

  if (url) info?.(`Web app is available at ${url}`)

  return url
}
