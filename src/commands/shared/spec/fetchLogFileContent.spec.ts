import { fetchLogFileContent } from '../fetchLogFileContent'

/**
 * Two servers answer a log request, in two shapes: Viya with a paged JSON chunk
 * (`{ items: [{ line }] }`), SASjs Server with the log itself. The fetcher has to
 * read both, and the case that broke was the second - a log starting with a digit
 * parsed as a number, so `items` was undefined.
 */
const makeSasjs = (responses: Array<string>) => {
  const fetchMock = jest.fn()

  responses.forEach((response) => fetchMock.mockResolvedValueOnce(response))

  return {
    sasjs: { fetchLogFileContent: fetchMock } as any,
    fetchMock
  }
}

describe('fetchLogFileContent', () => {
  it('pages the JSON chunks Viya returns', async () => {
    const { sasjs, fetchMock } = makeSasjs([
      JSON.stringify({ items: [{ line: 'NOTE: one' }, { line: 'NOTE: two' }] })
    ])

    const log = await fetchLogFileContent(
      sasjs,
      'token',
      'https://viya.example/compute/jobs/1/log',
      2
    )

    expect(log.items).toEqual([{ line: 'NOTE: one' }, { line: 'NOTE: two' }])
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(
      'https://viya.example/compute/jobs/1/log?start=0&limit=2',
      'token'
    )
  })

  it('stops when Viya answers with no further lines', async () => {
    const { sasjs, fetchMock } = makeSasjs([JSON.stringify({ items: [] })])

    const log = await fetchLogFileContent(sasjs, 'token', 'log', 50000)

    expect(log.items).toEqual([])
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('takes the whole body when it is not a JSON chunk', async () => {
    // SASjs Server: the log itself, beginning with a line number - which is what
    // JSON.parse turned into a number, and where reading `.items` threw
    const body = '1  The SAS System\nNOTE: hello\nERROR: something wrong\n'
    const { sasjs, fetchMock } = makeSasjs([body])

    const log = await fetchLogFileContent(
      sasjs,
      'token',
      'https://sas.4gl.io/SASjsApi/session/1/log',
      4
    )

    expect(log.items).toEqual([{ line: body }])
    // and it is not asked again: the text is the whole log, not a page of it
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('unwraps a log the adapter has stringified', async () => {
    // the adapter returns JSON.stringify(result), so a plain-text log reaches
    // here quoted and escaped - parsing once gives the text back
    const text = '1  The SAS System\nERROR: 22-322: Syntax error\n'
    const { sasjs } = makeSasjs([JSON.stringify(text)])

    const log = await fetchLogFileContent(sasjs, 'token', 'log', 2)

    expect(log.items).toEqual([{ line: text }])
  })

  it('treats an empty body as an empty log', async () => {
    const { sasjs } = makeSasjs([''])

    expect((await fetchLogFileContent(sasjs, 'token', 'log', 0)).items).toEqual(
      [{ line: '' }]
    )
  })
})
