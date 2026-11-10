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
