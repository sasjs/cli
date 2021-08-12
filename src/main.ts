export const terminateProcess = (status: number) => {
  process.logger?.info(
    `Process will be terminated with the status code ${status}.`
  )

  process.exit(status)
}
