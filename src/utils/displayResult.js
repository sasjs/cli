import chalk from 'chalk'

export function displayResult(err, failureMessage, successMessage) {
  if (err) {
    if (err.hasOwnProperty('error')) {
      let body = err.error || null

      if (body) {
        const message = body.message || ''
        const details = body.details || ''

        const failureDetails = `${message}${details ? '\n' + details : ''}`
  
        console.log(
          chalk.redBright(
            failureMessage,
            failureDetails
          )
        )

        return `${failureMessage}\n${failureDetails}`
      }
    } else {
      const failureDetails = err === `[object Object]` ? JSON.stringify(err) : err

      console.log(
        chalk.redBright(
          failureMessage,
          failureDetails
        )
      )

      return failureDetails
    }
  }

  if (successMessage) {
    console.log(chalk.greenBright.bold.italic(successMessage))

    return successMessagea
  }
}
