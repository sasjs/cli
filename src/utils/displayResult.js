import chalk from 'chalk'

export function displayResult(err, failureMessage, successMessage) {
  if (err) {
    if (err.hasOwnProperty('body')) {
      const body = JSON.parse(err.body)
      const message = body.message || ''
      const details = body.details || ''

      console.log(
        chalk.redBright(
          failureMessage,
          `${message}${details ? '\n' + details : ''}`
        )
      )
    } else {
      console.log(chalk.redBright(failureMessage, err))
    }
  }

  if (successMessage) {
    console.log(chalk.greenBright.bold.italic(successMessage))
  }
}
