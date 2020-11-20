import { generateTimestamp, parseLogLines } from '../src/utils/utils'

describe('generateTimestamp', () => {
  let realDate
  beforeAll(() => {
    const currentDate = new Date('2020-10-02T10:10:10.10Z')
    realDate = Date
    global.Date = class extends (
      Date
    ) {
      constructor(date) {
        if (date) {
          return super(date)
        }

        return currentDate
      }
    }
  })

  test('should generate a timestamp in the correct format', () => {
    const expectedTimestamp = '2020102101010'

    const timestamp = generateTimestamp()

    expect(timestamp).toEqual(expectedTimestamp)
  })

  test('should generate plain text log from json', () => {
    const expectedLog = `line1\nline2\nline3\nline4\n`

    const json = {
      items: [
        {
          line: 'line1'
        },
        {
          line: 'line2'
        },
        {
          line: 'line3'
        },
        {
          line: 'line4'
        }
      ]
    }

    expect(parseLogLines(json)).toEqual(expectedLog)
  })

  afterAll(() => {
    global.Date = realDate
  })
})
