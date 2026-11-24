import { ServerType } from '@sasjs/utils'
import { withoutTrailingSlash } from '../../../utils/url'

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

  // the name is a path segment inside the `_FILE=` value, so it is encoded on its
  // own: `encodeURI` leaves `&`, `?` and `#` as they are, and any of the three in
  // a published name would end the value early or name a different file
  return `${withoutTrailingSlash(serverUrl)}${route}${encodeURI(
    appLoc
  )}/services/${encodeURIComponent(streamServiceName)}.html`
}

/**
 * Says where a streamed build opens.
 *
 * A streamed app opens at its entry page on its own appLoc, the same way a Viya
 * or SAS 9 build does: the page names every asset through the server's file
 * route, so the entry page is the address the artefact answers on. The folder
 * the deploy published carries a copy of that page, and it is not a second door
 * an operator has to learn - but on a SASjs server it IS the app, and the server
 * states the address it serves it on. That address is `reportPublishedApp`'s
 * question, asked from the deploy's answer rather than from the target's config.
 *
 * The tier that answers the entry page is younger than the server itself, so a
 * SASjs deploy says which release carries it: without that, a server that
 * predates the tier prints one address, answers it with a 404, and gives no clue
 * why.
 */
export const reportStreamedApp = (
  serverUrl: string,
  serverType: ServerType,
  appLoc: string,
  streamServiceName: string,
  info?: (message: string) => void
): void => {
  const entryPage = streamedAppUrl(
    serverUrl,
    serverType,
    appLoc,
    streamServiceName
  )

  const requirement =
    serverType === ServerType.Sasjs
      ? ' (needs sasjs/server v7.23.0 or later, the release that serves the /StoredProgram tier)'
      : ''

  info?.(`Web app is available at ${entryPage}${requirement}`)
}

/**
 * What a SASjs server answers about the app a deploy published.
 *
 * The adapter types `deploy` and `deployZipFile` with the fields they were
 * written for, and a server that publishes states one more: the app it indexed,
 * with the id and the address it now serves it on. Read here rather than by
 * widening a dependency's return type, because a server that predates the app
 * stream answers neither field.
 */
export interface DeployAppAnswer {
  app?: { id?: string; name?: string; url?: string }
  /** The label a server published the app under, where it states no app. */
  streamServiceName?: string
}

/**
 * The address of the app a deploy published, from the answer the server gave.
 *
 * A published app lives in a folder under `apps/` on the drive and is served from
 * exactly one address, so the address is taken from the answer wherever the
 * answer states one: an id-bearing server states `url`, and that form
 * (`/app/<uuid>/`) is what makes an app's address survive a redeploy. A relative
 * `url` is joined to the server's; nothing is invented from an id alone, and
 * nothing is invented from the target's configuration.
 *
 * The one address composed here is the fallback, and it is the canonical prefix
 * rather than the newer one. A server that states no `app` but names the label it
 * published is a server from BEFORE the app index - it answered
 * `streamServiceName` and served the app at `/AppStream/<name>/`, and it has no
 * `/app` route at all. `/AppStream/` is the prefix both generations mount (it is
 * `APP_STREAM_PREFIXES` in sasjs/api), so the fallback is the spelling that
 * answers on every server able to reach it.
 */
export const publishedAppUrl = (
  serverUrl: string,
  answer: DeployAppAnswer | undefined
): string | undefined => {
  const stated = answer?.app?.url

  if (stated)
    return /^https?:\/\//i.test(stated)
      ? stated
      : `${withoutTrailingSlash(serverUrl)}${stated}`

  const name = answer?.streamServiceName

  // the label is a path segment, so it is encoded: a name a legacy server
  // published may carry `?` or `#`, and unencoded those are read as a query or a
  // fragment - the printed address would open a different path on the server
  // than the one the app is served from
  return name
    ? `${withoutTrailingSlash(serverUrl)}/AppStream/${encodeURIComponent(
        name
      )}/`
    : undefined
}

/**
 * Names the app a deploy published, when the server published one.
 *
 * Separate from `reportStreamedApp` because the two are asked by different
 * things. The entry page is the BUILD's artefact, so it belongs to a target whose
 * `streamWeb` is set. Whether an app was published is the SERVER's answer, and a
 * deploy can publish without the CLI asking for a stream - a bundle that carries
 * its own `sasjs.app.json`, or one built by an earlier configuration - so gating
 * this on `streamWeb` leaves an app that is on the server and openable nowhere in
 * the output.
 *
 * A streamed target therefore prints two addresses, and they are different facts:
 * the entry page is the artefact that loads the app's assets, and the address
 * here is the folder the server published, which every server release serves.
 */
export const reportPublishedApp = (
  serverUrl: string,
  serverType: ServerType,
  answer: DeployAppAnswer | undefined,
  info?: (message: string) => void
): void => {
  // Viya and SAS 9 have no app stream: an address under `/app/` would be one no
  // route answers
  if (serverType !== ServerType.Sasjs) return

  const published = publishedAppUrl(serverUrl, answer)

  if (published) info?.(`App stream: ${published}`)
}
