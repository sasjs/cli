import { StreamConfig } from '@sasjs/utils'

/**
 * The file, at the root of a build, that says the bundle is an app.
 *
 * It carries what the deploy needs to publish a frontend: the label the app is
 * listed under, the appLoc whose services its frontend calls, and an optional
 * logo. The name has to match `APP_MANIFEST` in `@sasjs/api` - `sasjs.app.json`
 * is spelled here rather than imported because a deployment does not ship the
 * package, and the server reads the manifest out of the zip.
 */
export const APP_MANIFEST = 'sasjs.app.json'

export interface AppManifest {
  /** The label the app is listed under, and so `apps/<name>`. */
  name?: string
  /** The folder the bundle's `backend/` is written to. */
  appLoc?: string
  /** An asset inside the published frontend, used as its tile image. */
  logo?: string
  /**
   * Included in iframes under these origins. Absent means the host's own
   * policy; stated, it is the deployment's.
   */
  frameAncestors?: string | string[]
}

/**
 * What a target's stream configuration says about the app it deploys.
 *
 * Only fields the deployer actually set are written: a manifest that states
 * `"logo": undefined` is not JSON, and one that states a default the server also
 * defaults would freeze that default into every deployment.
 *
 * `appLoc` comes from the target rather than the stream configuration, which is
 * why it is passed in: it is where the backend goes, not how it streams.
 */
export const appManifest = (
  streamConfig: StreamConfig,
  appLoc?: string
): AppManifest => ({
  ...(streamConfig.streamServiceName
    ? { name: streamConfig.streamServiceName }
    : {}),
  ...(appLoc ? { appLoc } : {}),
  ...(streamConfig.streamLogo ? { logo: streamConfig.streamLogo } : {})
})
