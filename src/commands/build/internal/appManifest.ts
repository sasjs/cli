import { FileTree, MemberType, StreamConfig } from '@sasjs/utils'

/**
 * The file, at the root of a deployment, that says the folder is an app.
 *
 * A SASjs Server that indexes apps reads this from the deployed tree: it is what
 * makes one upload both the deployment and the publish, instead of a deploy that
 * succeeds and a publish call that can fail on its own afterwards. The file is
 * metadata, not an asset - the server takes it out of the tree before writing, so
 * it never appears under `/app/<id>/`.
 *
 * The name is the contract with `@sasjs/api` (`APP_MANIFEST`), and the two must
 * stay the same string: this package cannot import the file name from a package
 * the deployment does not ship.
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
