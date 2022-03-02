import { getString, ServerType, Target } from '@sasjs/utils'
import jwtDecode from 'jwt-decode'
import SASjs from '@sasjs/adapter/node'

export const getAuthUrl = (
  serverType: ServerType,
  serverUrl: string,
  clientId: string
) =>
  serverType === ServerType.Sasjs
    ? `${serverUrl}/#/SASjsLogon?client_id=${clientId}&response_type=code`
    : `${serverUrl}/SASLogon/oauth/authorize?client_id=${clientId}&response_type=code`

export async function getAuthCode(authUrl: string) {
  const logger = process.logger || console
  logger.log(
    'Please perform the following steps to get your authorization code:\n'
  )
  logger.log(`1. Visit ${authUrl}\n`)
  logger.log(`2. Sign in with your SAS credentials if necessary.`)
  logger.log(`3. Enter/paste the authorization code here.`)

  const authCode = await getString(
    'Please enter your authorization code: ',
    (v) => !!v || 'Authorization code is required'
  )
  return authCode
}

/**
 * Checks if the Access Token is expired or is expiring in 1 hour.  A default Access Token
 * lasts 12 hours. If the Access Token expires, the Refresh Token is used to fetch a new
 * Access Token. In the case that the Refresh Token is expired, 1 hour is enough to let
 * most jobs finish.
 * @param {string} token- token string that will be evaluated
 */
export function isAccessTokenExpiring(token: string): boolean {
  if (!token) {
    return true
  }
  const payload = jwtDecode<{ exp: number }>(token)
  const timeToLive = payload.exp - new Date().valueOf() / 1000

  return timeToLive <= 60 * 60 // 1 hour
}

/**
 * Checks if the Refresh Token is expired or expiring in 30 secs. A default Refresh Token
 * lasts 30 days.  Once the Refresh Token expires, the user must re-authenticate (provide
 * credentials in a browser to obtain an authorisation code). 30 seconds is enough time
 * to make a request for a final Access Token.
 * @param {string} token- token string that will be evaluated
 */
export function isRefreshTokenExpiring(token?: string): boolean {
  if (!token) {
    return true
  }
  const payload = jwtDecode<{ exp: number }>(token)
  const timeToLive = payload.exp - new Date().valueOf() / 1000

  return timeToLive <= 30 // 30 seconds
}

export async function refreshTokens(
  sasjsInstance: SASjs,
  clientId: string,
  clientSecret: string,
  refreshToken: string
) {
  const { access_token, refresh_token } = await sasjsInstance.refreshTokens(
    clientId,
    clientSecret,
    refreshToken
  )

  return { access_token, refresh_token }
}

export async function getNewAccessToken(
  sasjsInstance: SASjs,
  clientId: string,
  clientSecret: string,
  target: Target
) {
  const authUrl = getAuthUrl(target.serverType, target.serverUrl, clientId)
  const authCode = await getAuthCode(authUrl)
  const { access_token, refresh_token } = await sasjsInstance.getAccessToken(
    clientId,
    clientSecret,
    authCode
  )

  return { access_token, refresh_token }
}
