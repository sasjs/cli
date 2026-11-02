import SASjs from '@sasjs/adapter/node'
import { LogJson } from '../../types'

/**
 * Parses a log response into the text of the log, or into the paged shape Viya
 * returns.
 *
 * Viya answers a log request with `{ items: [{ line }] }` and pages it with
 * `start` and `limit`. A server that answers with the log itself has no chunks
 * to parse, and the body must not be fed to `JSON.parse` blindly: a log whose
 * first character happens to be a digit parses as a number, and reading `.items`
 * off it throws.
 *
 * The adapter hands back `JSON.stringify(result)` whatever the server sent, so
 * the log arrives here quoted and escaped - parsing once gives the text back.
 */
const parseLogChunk = (body: string): LogJson | { text: string } => {
  let parsed: any

  try {
    parsed = JSON.parse(body)
  } catch (_) {
    return { text: body ?? '' }
  }

  if (parsed && Array.isArray(parsed.items)) return parsed

  return { text: typeof parsed === 'string' ? parsed : (body ?? '') }
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
    const body = (await sasjs.fetchLogFileContent(
      `${logUrl}?start=${start}&limit=${loglimit}`,
      accessToken
    )) as string

    const parsed = parseLogChunk(body)

    // Not Viya's paged shape, so the body is the log: SASjs Server answers with
    // the log itself, and the `start`/`limit` parameters mean nothing to it.
    // Asking again would return the same text, so this is the whole answer.
    if ('text' in parsed) return { items: [{ line: parsed.text }] }

    const logChunkJson = parsed

    if (logChunkJson.items.length === 0) break

    logJson.items = [...logJson.items, ...logChunkJson.items]

    start += loglimit
  } while (start < logCount)
  return logJson
}
