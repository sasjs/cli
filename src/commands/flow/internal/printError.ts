export const printError = (
  job: { location: string },
  flowName: string,
  err: { name?: string; message?: string } | string
) => {
  process.logger?.error(
    `An error has occurred when executing '${flowName}' flow's job located at: '${
      job.location
    }'. ${
      typeof err === 'object'
        ? err?.name === 'NotFoundError'
          ? 'Job was not found.'
          : err?.message || ''
        : '\n' + err
    }`
  )
}
