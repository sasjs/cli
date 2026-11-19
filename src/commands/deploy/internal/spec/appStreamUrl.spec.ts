import { ServerType } from '@sasjs/utils'

import { reportStreamedApp, streamedAppUrl } from '../appStreamUrl'

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
        '/services/mario.html'
    ])
  })
})
