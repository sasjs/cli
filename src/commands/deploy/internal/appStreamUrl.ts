import { ServerType } from '@sasjs/utils'

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

/**
 * Says where a streamed build opens.
 *
 * A streamed app opens at its entry page on its own appLoc, the same way a Viya
 * or SAS 9 build does - the page names every asset through the server's file
 * route, so the folder the deploy published is not an address of its own and is
 * not reported. The folder still carries a copy of the frontend whose links
 * point at the same appLoc, so opening it is a second door to one app rather
 * than a second address an operator has to know.
 */
export const reportStreamedApp = (
  serverUrl: string,
  serverType: ServerType,
  appLoc: string,
  streamServiceName: string,
  info?: (message: string) => void
): void => {
  info?.(
    `Web app is available at ${streamedAppUrl(
      serverUrl,
      serverType,
      appLoc,
      streamServiceName
    )}`
  )
}
