import { FileTree, MemberType, StreamConfig } from '@sasjs/utils'

import { APP_MANIFEST, appManifest, withAppManifest } from '../appManifest'

const streamConfig = (over: Partial<StreamConfig> = {}): StreamConfig =>
  ({
    streamWeb: true,
    streamWebFolder: 'web',
    webSourcePath: 'dist',
    streamServiceName: 'mario',
    assetPaths: [],
    ...over
  }) as StreamConfig

const tree: FileTree = {
  members: [
    {
      name: 'services',
      type: MemberType.folder,
      members: [{ name: 'run', type: MemberType.service, code: '%put hi;' }]
    }
  ]
}

describe('the app manifest a build writes', () => {
  it('names the app the target names, and the folder its web build is in', () => {
    expect(appManifest(streamConfig())).toEqual({
      name: 'mario',
      streamWebFolder: 'web'
    })
  })

  it('states a logo when the target has one', () => {
    expect(appManifest(streamConfig({ streamLogo: 'logo.png' }))).toEqual({
      name: 'mario',
      streamWebFolder: 'web',
      logo: 'logo.png'
    })
  })

  it('states only what the target states', () => {
    // a manifest carrying `"name": undefined` is not JSON, and one carrying a
    // default would freeze that default into every deployment
    const manifest = appManifest(streamConfig({ streamServiceName: '' }))

    expect(Object.keys(manifest)).toEqual(['streamWebFolder'])
  })

  it('is added at the root of the deployment tree', () => {
    const deployed = withAppManifest(tree, appManifest(streamConfig()))

    const manifest = deployed.members.find(
      (member) =>
        member.type === MemberType.file && member.name === APP_MANIFEST
    ) as { code: string }

    expect(JSON.parse(manifest.code)).toEqual({
      name: 'mario',
      streamWebFolder: 'web'
    })
    // the deployment is untouched: the manifest is added, nothing is replaced
    expect(deployed.members).toHaveLength(2)
    expect(tree.members).toHaveLength(1)
  })

  it('replaces a manifest the tree already carries, rather than adding a second', () => {
    const once = withAppManifest(tree, appManifest(streamConfig()))
    const twice = withAppManifest(
      once,
      appManifest(streamConfig({ streamServiceName: 'luigi' }))
    )

    const manifests = twice.members.filter(
      (member) =>
        member.type === MemberType.file && member.name === APP_MANIFEST
    )

    expect(manifests).toHaveLength(1)
    expect(JSON.parse((manifests[0] as { code: string }).code).name).toBe(
      'luigi'
    )
  })
})
