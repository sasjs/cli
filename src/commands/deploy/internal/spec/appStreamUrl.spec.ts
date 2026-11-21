import { ServerType } from '@sasjs/utils'

import {
  publishedAppUrl,
  reportPublishedApp,
  reportStreamedApp,
  streamedAppUrl
} from '../appStreamUrl'

describe('the url a streamed deploy reports', () => {
  it('opens a SASjs build at its entry page on its own appLoc', () => {
    expect(
      streamedAppUrl(
        'https://server.example',
        ServerType.Sasjs,
        '/Public/app',
        'mario'
      )
    ).toBe(
      'https://server.example/StoredProgram?_FILE=' +
        encodeURI('/Public/app') +
        '/services/mario.html'
    )
  })

  it('opens a Viya build at the same file through the job execution route', () => {
    expect(
      streamedAppUrl(
        'https://viya.example',
        ServerType.SasViya,
        '/Public/app',
        'mario'
      )
    ).toBe(
      'https://viya.example/SASJobExecution?_FILE=' +
        encodeURI('/Public/app') +
        '/services/mario.html'
    )
  })

  it('reports the entry page and nothing else', () => {
    // the folder the deploy published carries a copy of the frontend whose links
    // point at the same appLoc, so it is a second door to one app rather than an
    // address of its own - reporting it invites an operator to learn two
    const said: string[] = []
    const info = (message: string) => said.push(message)

    reportStreamedApp(
      'https://server.example',
      ServerType.Sasjs,
      '/Public/app',
      'mario',
      info
    )

    expect(said).toEqual([
      'Web app is available at https://server.example/StoredProgram?_FILE=' +
        encodeURI('/Public/app') +
        '/services/mario.html' +
        ' (needs sasjs/server v7.23.0 or later, the release that serves the /StoredProgram tier)'
    ])
  })

  it('adds no version caveat where the tier has always been there', () => {
    // Viya's job execution route is not a recent addition, so a caveat would be
    // noise for an operator who never has to act on it
    const said: string[] = []
    const info = (message: string) => said.push(message)

    reportStreamedApp(
      'https://viya.example',
      ServerType.SasViya,
      '/Public/app',
      'mario',
      info
    )

    expect(said).toHaveLength(1)
    expect(said[0]).not.toContain('sasjs/server')
  })
})

describe('the url a published app reports', () => {
  it('is the address the server stated', () => {
    expect(
      publishedAppUrl('https://server.example', {
        app: { id: '0e6f1d2c', url: '/app/0e6f1d2c/' }
      })
    ).toBe('https://server.example/app/0e6f1d2c/')

    // a server that serves apps elsewhere states the whole address, and it is
    // used as given rather than joined to the serverUrl underneath it
    expect(
      publishedAppUrl('https://server.example', {
        app: { url: 'https://apps.example/mario/' }
      })
    ).toBe('https://apps.example/mario/')
  })

  it('is the stream name under the prefix both server generations mount', () => {
    // a server that answers no app but names the label is one from before the
    // app index: it served apps at /AppStream/<name>/ and has no /app route, so
    // the fallback is the canonical prefix rather than the newer spelling
    expect(
      publishedAppUrl('https://server.example', {
        streamServiceName: 'mario'
      })
    ).toBe('https://server.example/AppStream/mario/')
  })

  it('joins one slash where the server URL carries a trailing one', () => {
    // `https://host/` is what a hand-written sasjsconfig may hold, and nothing
    // upstream strips it, so every composed address would double the slash
    expect(
      publishedAppUrl('https://server.example/', {
        app: { url: '/app/0e6f1d2c/' }
      })
    ).toBe('https://server.example/app/0e6f1d2c/')

    expect(
      publishedAppUrl('https://server.example//', {
        streamServiceName: 'mario'
      })
    ).toBe('https://server.example/AppStream/mario/')

    expect(
      streamedAppUrl(
        'https://server.example/',
        ServerType.Sasjs,
        '/Public/app',
        'mario'
      )
    ).toBe(
      'https://server.example/StoredProgram?_FILE=' +
        encodeURI('/Public/app') +
        '/services/mario.html'
    )
  })

  it('does not invent a url from an id alone, or from no answer at all', () => {
    // a server that answers an id can say where it serves the app; guessing
    // would print an address that may not exist
    expect(
      publishedAppUrl('https://server.example', { app: { id: '0e6f1d2c' } })
    ).toBeUndefined()
    expect(publishedAppUrl('https://server.example', {})).toBeUndefined()
    expect(publishedAppUrl('https://server.example', undefined)).toBeUndefined()
  })

  it('is named for a SASjs server, and only when the server published one', () => {
    const said: string[] = []
    const info = (message: string) => said.push(message)

    // the publish is the server's answer, not a config flag: `streamWeb` says
    // what the CLI asked the build for, and a deploy can publish without it
    reportPublishedApp(
      'https://server.example',
      ServerType.Sasjs,
      { app: { id: '0e6f1d2c', url: '/app/0e6f1d2c/' } },
      info
    )

    expect(said).toEqual(['App stream: https://server.example/app/0e6f1d2c/'])

    // nothing published: a target with a stream name configured but no publish,
    // which is every plain deploy, says nothing rather than naming an address
    // no folder backs
    said.length = 0
    reportPublishedApp('https://server.example', ServerType.Sasjs, {}, info)
    expect(said).toEqual([])
  })

  it('is never reported for a Viya or SAS 9 deploy, which has no app stream', () => {
    const said: string[] = []
    const info = (message: string) => said.push(message)

    for (const serverType of [ServerType.SasViya, ServerType.Sas9])
      reportPublishedApp(
        'https://server.example',
        serverType,
        { app: { id: '0e6f1d2c', url: '/app/0e6f1d2c/' } },
        info
      )

    expect(said).toEqual([])
  })
})
