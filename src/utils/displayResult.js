import chalk from 'chalk'

export function displayResult(err, failureMessage, successMessage) {
  if (err) {
    if (err.hasOwnProperty('error')) {
      let body = err.error || null

      if (body) {
        const message = body.message || ''
        let details = body.details || ''
        let raw = body.raw || ''

        if (typeof details === 'object') details = JSON.stringify(details)
        if (typeof raw === 'object') raw = JSON.stringify(raw)

        const failureDetails = `${message}${details ? '\n' + details : ''}${
          raw ? '\n' + raw : ''
        }`

        console.log(chalk.redBright(failureMessage, failureDetails))

        return `${failureMessage}\n${failureDetails}`
      }
    } else {
      const failureDetails = typeof err === 'object' ? JSON.stringify(err) : err

      console.log(chalk.redBright(failureMessage, failureDetails))

      return `${failureMessage}\n${failureDetails}`
    }
  }

  if (successMessage) {
    console.log(chalk.greenBright.bold.italic(successMessage))

    return successMessage
  }
}
