import shelljs from 'shelljs'

export async function printVersion() {
  const result = shelljs.exec(`npm list -g @sasjs/cli`, {
    silent: true
  })

  const line = result.split('\n').find((l) => l.includes('@sasjs/cli')) || ''
  const version = line.split('@')[2].trim()
  const message = version.includes('->')
    ? `You are using a linked version of SASjs CLI running from sources at ${version
        .replace('->', '')
        .trim()}`
    : `You are using SASjs CLI v${version}`

  process.logger?.info(message)

  return message
}
