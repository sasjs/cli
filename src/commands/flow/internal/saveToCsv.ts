import { updateCsv } from '@sasjs/utils'
import { displayError } from '../../../utils/displayResult'

export const saveToCsv = async (
  csvFileRealPath: string,
  data: any[],
  columns: string[],
  prependId?: string
) => {
  return new Promise(async (resolve, reject) => {
    if (process.csvFileAbleToSave === undefined)
      process.csvFileAbleToSave = true

    const timerId = setInterval(async () => {
      if (process.csvFileAbleToSave) {
        process.csvFileAbleToSave = false
        clearInterval(timerId)

        try {
          await updateCsv(csvFileRealPath, data, columns, prependId)
          process.csvFileAbleToSave = true
          resolve(true)
        } catch (error) {
          displayError(error)
          reject(error)
        }
      }
    }, 100)
  })
}
