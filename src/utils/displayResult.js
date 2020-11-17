import chalk from 'chalk'

export function displayResult(err, failureMessage, successMessage) {
  if (err) {
    if (err.hasOwnProperty('body')) {
      try {
        const body = JSON.parse(err.body)
        const message = body.message || ''
        const details = body.details || ''

        console.log(
          chalk.redBright(
            failureMessage,
            `${message}${details ? '\n' + details : ''}`
          )
        )
      } catch (parseError) {
        console.log(chalk.redBright('Unable to parse error\n', parseError))
        console.log(chalk.redBright(failureMessage, err.body))
      }
    } else {
      console.log(
        chalk.redBright(
          failureMessage,
          Object.keys(err).length ? err : JSON.stringify(err)
        )
      )
    }
  }

  if (successMessage) {
    console.log(chalk.greenBright.bold.italic(successMessage))
  }
}
