import { saveLog } from '../saveLog'
import { LogJson } from '../../types'

describe('saveLog', () => {
  it('should throw an error if there is an error in logData', async () => {
    const errorObject = {
      errorCode: 5737,
      message: 'This is the root node of a diagnostic error.',
      details: ['Details are available from the nested error objects.'],
      errors: [
        {
          errorCode: 5738,
          message:
            'The Compute provider for the Job Execution service failed to create job log file "4A3C0C80-87F3-4B44-A94A-68AF37E32521.log".',
          details: [
            'Log or listing output could not be streamed to the Files service.'
          ],
          errors: [
            {
              errorCode: 5208,
              message:
                'Log or listing output could not be streamed to the Files service.',
              details: [
                'The file "FileResource1684161631532" cannot be uploaded because it is larger than 100 megabytes.',
                'Files service errorCode=124009 httpStatusCode=400.'
              ],
              links: [],
              version: 2,
              httpStatusCode: 500
            }
          ],
          links: [],
          version: 2,
          httpStatusCode: 500
        }
      ],
      links: [],
      version: 2,
      httpStatusCode: 207
    }
    const expectedError = JSON.stringify(errorObject, null, 2)

    const logData: LogJson = { items: [], error: errorObject }

    await expect(() => saveLog(logData, undefined, '', true)).rejects.toEqual(
      expectedError
    )
  })
})
