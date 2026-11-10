import { FileTree, MemberType, StreamConfig } from '@sasjs/utils'

/**
 * The file, at the root of a deployment, that says the folder is an app.
 *
 * It carries what a deploy payload names for a stream today - the label, the
 * folder the compiled assets are in, the logo - inside the deployment itself, so
 * one upload can be both the deployment and the publish.
 *
 * **This ships ahead of the reader.** The manifest is read by `splitAppBundle` in
 * sasjs/api (PR #65), which takes it out of the tree before the tree is written
 * and indexes the app in the same request; no released `@sasjs/api`, `@sasjs/adapter`
 * or `sasjs/server` knows the file yet, so until a host adopts that package the
 * manifest is deployed as an ordinary file and the publish still comes from the
 * payload's `streamWebFolder` / `streamServiceName`, exactly as now. The name has
 * to match `APP_MANIFEST` in that package - `sasjs.app.json` is spelled here
 * rather than imported because the deployment does not ship the package.
 */
export const APP_MANIFEST = 'sasjs.app.json'

export interface AppManifest {
  /** The label the app is listed under. */
  name?: string
  /** The folder under `services/` holding the compiled web app. */
  streamWebFolder: string
  /** An asset inside the app, used as its tile image. */
  logo?: string
}

/**
 * What a target's stream configuration says about the app it deploys.
 *
 * Only fields the deployer actually set are written: a manifest that states
 * `"logo": undefined` is not JSON, and one that states a default the server also
 * defaults would freeze that default into every deployment.
 */
export const appManifest = (streamConfig: StreamConfig): AppManifest => ({
  ...(streamConfig.streamServiceName
    ? { name: streamConfig.streamServiceName }
    : {}),
  streamWebFolder: streamConfig.streamWebFolder,
  ...(streamConfig.streamLogo ? { logo: streamConfig.streamLogo } : {})
})

/**
 * The deployment tree with the manifest at its root.
 *
 * A tree that already carries a manifest - a build output adjusted by hand, or a
 * bundle built twice - has it replaced rather than duplicated, because two files
 * with one name in one folder is not a tree any host can deploy.
 */
export const withAppManifest = (
  tree: FileTree,
  manifest: AppManifest
): FileTree => ({
  ...tree,
  members: [
    ...tree.members.filter(
      (member) =>
        !(member.type === MemberType.file && member.name === APP_MANIFEST)
    ),
    {
      name: APP_MANIFEST,
      type: MemberType.file,
      code: JSON.stringify(manifest, null, 2)
    }
  ]
})
