import { createFile, fileExists, getRealPath, readFile } from '@sasjs/utils'
import stringify from 'csv-stringify'
import { displayError } from '../../../utils/displayResult'

// REFACTOR: move to utility
export const saveToCsv = async (
  csvFileRealPath: string,
  flowName: string,
  predecessors: any,
  location: string,
  status: string,
  details = '',
  logName = ''
) => {
  return new Promise(async (resolve, reject) => {
    if (process.csvFileAbleToSave === undefined)
      process.csvFileAbleToSave = true

    const timerId = setInterval(async () => {
      if (process.csvFileAbleToSave) {
        process.csvFileAbleToSave = false
        clearInterval(timerId)

        if (
          !(await fileExists(csvFileRealPath).catch((err) =>
            displayError(err, 'Error while checking if csv file exists.')
          ))
        ) {
          await createFile(csvFileRealPath, '').catch((err) =>
            displayError(err, 'Error while creating CSV file.')
          )
        }

        let csvContent = await readFile(csvFileRealPath).catch((err) => {
          displayError(err, 'Error while reading CSV file.')

          return ''
        })

        let csvData = csvContent
          .split('\n')
          .filter((row) => row.length)
          .map((data) => data.split(','))

        const columns = {
          id: 'id',
          flow: 'Flow',
          predecessors: 'Predecessors',
          name: 'Location',
          status: 'Status',
          logLocation: 'Log location',
          details: 'Details'
        }

        const id = csvData.length === 0 ? 1 : csvData.length

        const data = [
          id,
          flowName,
          predecessors.join(' | '),
          location,
          status,
          logName,
          details
        ]

        csvData.push(data)

        stringify(
          csvData,
          { header: csvData.length === 1, columns: columns },
          async (err, output) => {
            if (err) reject(err)

            await createFile(csvFileRealPath, output).catch((err) =>
              displayError(err, 'Error while creating CSV file.')
            )

            process.csvFileAbleToSave = true

            resolve(true)
          }
        )
      }
    }, 100)
  })
}
