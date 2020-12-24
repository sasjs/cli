import { LogLevel, Logger } from '@sasjs/utils/logger'

export function displaySuccess(message: string) {
  const logLevel = (process.env.LOG_LEVEL || LogLevel.Error) as LogLevel
  const logger = new Logger(logLevel)
  logger.success(message)
}

export function displayError(err: any, message: string) {
  const logLevel = (process.env.LOG_LEVEL || LogLevel.Error) as LogLevel
  const logger = new Logger(logLevel)
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

        logger.error(message, failureDetails)
        return `${message}\n${failureDetails}`
      }
    } else if (err.hasOwnProperty('message')) {
      failureDetails = err.message
    } else {
      failureDetails = typeof err === 'object' ? JSON.stringify(err) : err
      failureDetails = failureDetails !== '{}' ? failureDetails : ''
    }

    logger.error(message, failureDetails)
    return `${message}\n${failureDetails}`
  }
}
