import { StreamConfig } from '@sasjs/utils'

import { appManifest } from '../appManifest'

const streamConfig = (over: Partial<StreamConfig> = {}): StreamConfig =>
  ({
    streamWeb: true,
    streamWebFolder: 'web',
    webSourcePath: 'dist',
    streamServiceName: 'mario',
    assetPaths: [],
    ...over
  }) as StreamConfig

describe('the app manifest a build writes', () => {
  it('names the app the target names', () => {
    expect(appManifest(streamConfig())).toEqual({ name: 'mario' })
  })

  it('states a logo when the target has one', () => {
    expect(appManifest(streamConfig({ streamLogo: 'logo.png' }))).toEqual({
      name: 'mario',
      logo: 'logo.png'
    })
  })

  it('states the folder the backend is deployed to', () => {
    // the bundle carries its backend separately from the frontend, so the
    // manifest is where a deploy that reads an archive learns where the backend
    // goes
    expect(appManifest(streamConfig(), '/Public/app/mario')).toEqual({
      name: 'mario',
      appLoc: '/Public/app/mario'
    })
  })

  it('states no appLoc when the target names none', () => {
    expect(appManifest(streamConfig(), '')).toEqual({ name: 'mario' })
  })

  it('states only what the target states', () => {
    // a manifest carrying `"name": undefined` is not JSON, and one carrying a
    // default would freeze that default into every deployment
    expect(
      Object.keys(appManifest(streamConfig({ streamServiceName: '' })))
    ).toEqual([])
  })

  it('never states a stream folder', () => {
    // `streamWebFolder` is what marks the legacy bundle, whose web assets sit
    // inside the backend deployment. A package states the frontend as its own
    // half, so naming a stream folder would make a host read it as the old
    // shape and look for the app inside the deployment instead.
    expect(appManifest(streamConfig())).not.toHaveProperty('streamWebFolder')
  })
})
