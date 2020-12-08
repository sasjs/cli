import {
  generateTimestamp,
  parseLogLines,
  millisecondsToDdHhMmSs
} from '../../src/utils/utils'

describe('utils', () => {
  describe('generateTimestamp', () => {
    let realDate
    beforeAll(() => {
      const currentDate = new Date('2020-10-02T10:10:10.10Z')
      realDate = Date
      global.Date = class extends Date {
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

  describe('millisecondsToDdHhMmSs', () => {
    it('should throw an error if not supported type was provided', () => {
      const error = new Error('Not supported attribute type.')

      expect(() => millisecondsToDdHhMmSs(undefined)).toThrow(error)
    })

    it('should process negative number', () => {
      expect(millisecondsToDdHhMmSs(-1000)).toEqual(
        '0 day(s); 0 hour(s); 0 minute(s); 1 second(s)'
      )
    })

    it('should process 0', () => {
      expect(millisecondsToDdHhMmSs(0)).toEqual(
        '0 day(s); 0 hour(s); 0 minute(s); 0 second(s)'
      )
    })

    it('should process number with floating point', () => {
      expect(millisecondsToDdHhMmSs(8 * 60 * 60 * 1000 + 0.93326263)).toEqual(
        '0 day(s); 8 hour(s); 0 minute(s); 0 second(s)'
      )
    })

    it('should process number', () => {
      expect(millisecondsToDdHhMmSs(24 * 60 * 60 * 1000)).toEqual(
        '1 day(s); 0 hour(s); 0 minute(s); 0 second(s)'
      )
    })
  })
})
