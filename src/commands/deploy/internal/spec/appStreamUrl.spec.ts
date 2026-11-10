import { reportAppUrl, webAppStreamUrl } from '../appStreamUrl'

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

  it('says where the app is, once, and only when there is an app', () => {
    const said: string[] = []
    const info = (message: string) => said.push(message)

    reportAppUrl('https://server.example', { streamServiceName: 'mario' }, info)
    reportAppUrl('https://server.example', {}, info)
    reportAppUrl('https://server.example', undefined)

    expect(said).toEqual([
      'Web app is available at https://server.example/app/mario/'
    ])
  })
})
