export function displaySuccess(message: string) {
  process.logger?.success(message)
}

export function displayError(err: any, errorMessage: string = '') {
  if (err) {
    let failureDetails = ''

    if (err.hasOwnProperty('error')) {
      let body = err.error || null

      if (body) {
        const message = body.message || ''
        let details = body.details || ''
        let raw = body.raw || ''

        if (typeof details === 'object') details = JSON.stringify(details)
        if (typeof raw === 'object') raw = JSON.stringify(raw)

        failureDetails = `${message}${details ? '\n' + details : ''}${
          raw ? '\n' + raw : ''
        }`

        process.logger?.error(errorMessage, failureDetails)
        return `${errorMessage}\n${failureDetails}`
      }
    } else if (err.hasOwnProperty('message')) {
      failureDetails = err.message
    } else if (
      err.hasOwnProperty('body') &&
      err.body.hasOwnProperty('message')
    ) {
      if (err.body.hasOwnProperty('details')) failureDetails = err.body.details
    } else {
      failureDetails = typeof err === 'object' ? JSON.stringify(err) : err
      failureDetails = failureDetails !== '{}' ? failureDetails : ''
    }

    process.logger?.error(errorMessage, failureDetails)
    if (err instanceof Error) {
      process.logger?.error(err.stack || '')
    }
    return `${errorMessage}\n${failureDetails}`
  }
}
