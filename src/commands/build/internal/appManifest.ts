import { APP_MANIFEST } from '@sasjs/api'
import { StreamConfig } from '@sasjs/utils'

// The file name is `@sasjs/api`'s own constant, imported rather than copied: the
// names on both sides have to match, and the package the CLI builds against is
// the one a server reads the manifest with.
export { APP_MANIFEST }

/** What a bundle states about the app it publishes. */
export interface AppManifest {
  /** The label the app is listed under, and so `apps/<name>`. */
  name?: string
  /** The folder the bundle's `backend/` is written to. */
  appLoc?: string
  /** An asset inside the published frontend, used as its tile image. */
  logo?: string
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
