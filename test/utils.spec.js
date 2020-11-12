import { generateTimestamp } from '../src/utils/utils'

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

  afterAll(() => {
    global.Date = realDate
  })
})
