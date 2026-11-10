/**
 * The address an app is served on, from the answer a deploy got back.
 *
 * A server that indexes apps answers the app it just published, and its id is the
 * URL: `/app/<id>/`. A server that still keys its index by label answers a stream
 * name instead, and `/AppStream/<name>` is the address that works there. The
 * deploy prints whichever it was given, so the CLI works against both while the
 * index moves to ids.
 */
export interface DeployAppAnswer {
  app?: { id?: string }
  streamServiceName?: string
}

export const webAppStreamUrl = (
  serverUrl: string,
  answer: DeployAppAnswer | undefined
): string | undefined => {
  const id = answer?.app?.id

  if (id) return `${serverUrl}/app/${id}/`

  return answer?.streamServiceName
    ? `${serverUrl}/AppStream/${answer.streamServiceName}`
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
