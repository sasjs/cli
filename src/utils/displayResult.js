import chalk from 'chalk'

export function displayResult(err, failureMessage, successMessage) {
  if (err) {
    if (err.hasOwnProperty('error')) {
      let body = err.error || null
      
      if (err.error) {
        body = err.error
      }

      if (!body) {
        try {
          body = JSON.parse(err.error)
        } catch (parseError) {
          console.log(chalk.redBright('Unable to parse error\n', parseError))
          console.log(chalk.redBright(failureMessage, err.body))

          return
        }
      }

      const message = body.message || ''
      const details = body.details || ''

      console.log(
        chalk.redBright(
          failureMessage,
          `${message}${details ? '\n' + details : ''}`
        )
      )
    } else {
      console.log(
        chalk.redBright(
          failureMessage,
          err !== `[object Object]` ? err : JSON.stringify(err)
        )
      )
    }
  }

  if (successMessage) {
    console.log(chalk.greenBright.bold.italic(successMessage))
  }
}
