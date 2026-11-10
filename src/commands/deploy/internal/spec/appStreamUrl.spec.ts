import { reportAppUrl, webAppStreamUrl } from '../appStreamUrl'

describe('the url a deploy reports', () => {
  it("is the app's own address when the server answers an id", () => {
    expect(
      webAppStreamUrl('https://server.example', {
        app: { id: '0e6f1d2c-3b4a-4c5d-8e9f-0a1b2c3d4e5f' }
      })
    ).toBe('https://server.example/app/0e6f1d2c-3b4a-4c5d-8e9f-0a1b2c3d4e5f/')
  })

  it('is the stream name when that is all the server answered', () => {
    expect(
      webAppStreamUrl('https://server.example', { streamServiceName: 'mario' })
    ).toBe('https://server.example/AppStream/mario')
  })

  it('prefers the id when a server answers both', () => {
    expect(
      webAppStreamUrl('https://server.example', {
        app: { id: '0e6f1d2c-3b4a-4c5d-8e9f-0a1b2c3d4e5f' },
        streamServiceName: 'mario'
      })
    ).toContain('/app/0e6f1d2c')
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
      'Web app is available at https://server.example/AppStream/mario'
    ])
  })
})
