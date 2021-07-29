export const isSessionStateError = (err: string) =>
  err.includes('Could not get session state')
