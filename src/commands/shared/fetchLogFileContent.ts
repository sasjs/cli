import SASjs from '@sasjs/adapter/node'

interface LogJson {
  items: { line: string }[]
}

/**
 * Fetches content of the log file
 * @param {object} sasjs - configuration object of SAS adapter.
 * @param {string} accessToken - an access token for an authorized user.
 * @param {string} logUrl - url of the log file.
 * @param {number} logCount- total number of log lines in file.
 * @returns an object containing log lines in 'items' array.
 */
export const fetchLogFileContent = async (
  sasjs: SASjs,
  accessToken: string,
  logUrl: string,
  logCount: number
): Promise<LogJson> => {
  const logJson: LogJson = { items: [] }

  const loglimit = logCount < 10000 ? logCount : 10000
  let start = 0
  do {
    const logChunkJson = JSON.parse(
      (await sasjs.fetchLogFileContent(
        `${logUrl}?start=${start}&limit=${loglimit}`,
        accessToken
      )) as string
    )

    if (logChunkJson.items.length === 0) break

    logJson.items = [...logJson.items, ...logChunkJson.items]

    start += loglimit
  } while (start < logCount)
  return logJson
}
