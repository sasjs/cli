import { ServerType } from '@sasjs/utils'

import { reportStreamedApp, webAppStreamUrl } from '../appStreamUrl'

describe('the url a deploy reports', () => {
  it('is the address the server states, when it states one', () => {
    expect(
      webAppStreamUrl('https://server.example', {
        app: { id: '0e6f1d2c', url: '/app/0e6f1d2c/' }
      })
    ).toBe('https://server.example/app/0e6f1d2c/')

    expect(
      webAppStreamUrl('https://server.example', {
        app: { url: 'https://apps.example/mario/' }
      })
    ).toBe('https://apps.example/mario/')
  })

  it('is the stream name when that is all the server answered', () => {
    expect(
      webAppStreamUrl('https://server.example', { streamServiceName: 'mario' })
    ).toBe('https://server.example/app/mario/')
  })

  it('does not invent a url from an id alone', () => {
    // a server that answers an id can say where it serves the app; guessing would
    // print an address that may not exist
    expect(
      webAppStreamUrl('https://server.example', { app: { id: '0e6f1d2c' } })
    ).toBeUndefined()
  })

  it('prefers the stated url over the stream name', () => {
    expect(
      webAppStreamUrl('https://server.example', {
        app: { id: '0e6f1d2c', url: '/app/0e6f1d2c/' },
        streamServiceName: 'mario'
      })
    ).toBe('https://server.example/app/0e6f1d2c/')
  })

  it('is nothing when the deploy published no app', () => {
    expect(webAppStreamUrl('https://server.example', {})).toBeUndefined()
    expect(webAppStreamUrl('https://server.example', undefined)).toBeUndefined()
    expect(
      webAppStreamUrl('https://server.example', { app: {} })
    ).toBeUndefined()
  })

  it('says where a streamed build opens, and where a SASjs server published it', () => {
    const said: string[] = []
    const info = (message: string) => said.push(message)

    reportStreamedApp(
      'https://server.example',
      ServerType.Sasjs,
      '/Public/app',
      'mario',
      info
    )

    // two addresses, because the entry page needs a server carrying the
    // /StoredProgram tier and the published folder does not
    expect(said).toEqual([
      'Web app is available at https://server.example/StoredProgram?_FILE=' +
        encodeURI('/Public/app') +
        '/services/mario.html',
      'App stream: https://server.example/app/mario/ ' +
        '(answers on servers that predate /StoredProgram)'
    ])
  })

  it('names only the entry page where no app stream was published', () => {
    const said: string[] = []
    const info = (message: string) => said.push(message)

    // Viya serves the streamed artefact and has no app stream of its own
    reportStreamedApp(
      'https://viya.example',
      ServerType.SasViya,
      '/Public/app',
      'mario',
      info
    )

    expect(said).toHaveLength(1)
    expect(said[0]).toContain('/SASJobExecution?_FILE=')
  })
})
