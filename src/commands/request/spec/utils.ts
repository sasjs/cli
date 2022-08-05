import path from 'path'
import { readFile } from '@sasjs/utils'

export const sampleDataJson = {
  table1: [
    { col1: 'first col value1', col2: 'second col value1' },
    { col1: 'first col value2', col2: 'second col value2' }
  ],
  table2: [{ col1: 'first col value' }]
}
export const expectedDataArr = {
  table1: [
    ['first col value1', 'second col value1'],
    ['first col value2', 'second col value2']
  ],
  table2: [['first col value']]
}
export const expectedDataObj = {
  table1: [
    {
      COL1: 'first col value1',
      COL2: 'second col value1'
    },
    {
      COL1: 'first col value2',
      COL2: 'second col value2'
    }
  ],
  table2: [
    {
      COL1: 'first col value'
    }
  ]
}

export const getOutputJson = async (fileName: string) =>
  JSON.parse(
    await readFile(
      path.join(
        process.sasjsConstants.buildDestinationResultsFolder,
        'requests',
        fileName
      )
    )
  )
