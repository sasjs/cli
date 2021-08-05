import path from 'path'
import { deleteFile, generateTimestamp, readFile } from '@sasjs/utils'
import { saveToCsv } from '..'

describe('saveToCsv', () => {
  let csvFilePath: string

  afterEach(async () => {
    await deleteFile(csvFilePath)
  })

  it('should write to csv', async () => {
    csvFilePath = path.join(__dirname, `cli-tests-csv-${generateTimestamp()}`)

    await saveToCsv(
      csvFilePath,
      'someFlowName',
      ['flow1', 'flow2'],
      'location',
      'success'
    )

    const csvContent = await readFile(csvFilePath)

    expect(csvContent).toEqual(
      expect.stringContaining('1,someFlowName,flow1 | flow2,location,success,,')
    )
  })

  it('should write to csv - asynchronous ', async () => {
    csvFilePath = path.join(__dirname, `cli-tests-csv-${generateTimestamp()}`)

    let csvOperationsCompleted = 0
    ;[1, 2, 3].forEach(async (_, i) => {
      const randomNumber = global.Math.random() * 1000
      await new Promise((r) => setTimeout(r, randomNumber))

      await saveToCsv(
        csvFilePath,
        `someFlowName${i}`,
        [`flow-${i}`],
        `location-${i}`,
        'success'
      )

      csvOperationsCompleted++
    })

    while (csvOperationsCompleted !== 3) {
      await new Promise((r) => setTimeout(r, 200))
    }

    const csvContent = await readFile(csvFilePath)

    const flow1csv = ',someFlowName0,flow-0,location-0,success,,'
    const flow2csv = ',someFlowName1,flow-1,location-1,success,,'
    const flow3csv = ',someFlowName2,flow-2,location-2,success,,'

    expect(csvContent).toEqual(expect.stringContaining(flow1csv))
    expect(csvContent).toEqual(expect.stringContaining(flow2csv))
    expect(csvContent).toEqual(expect.stringContaining(flow3csv))
  })
})
