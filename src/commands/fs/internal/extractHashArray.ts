import { displayError } from '../../../utils'

export const extractHashArray = (log: string) => {
  if (log.includes('>>weboutBEGIN<<')) {
    try {
      const webout = log
        .split(/>>weboutBEGIN<<\n/)[1]
        .split(/>>weboutEND<<\n/)[0]
      const jsonWebout = JSON.parse(webout)
      return jsonWebout.hashes
    } catch (err: any) {
      displayError(
        err,
        'An error occurred while extracting hashes array from webout.'
      )
      throw new Error(
        'An error occurred while extracting hashes array from webout.'
      )
    }
  }
}
