import { getString, Target } from '@sasjs/utils'
import jwtDecode from 'jwt-decode'
import SASjs from '@sasjs/adapter/node'

export function getAuthUrl(serverUrl: string, clientId: string) {
  return `${serverUrl}/SASLogon/oauth/authorize?client_id=${clientId}&response_type=code`
}

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

export function isAccessTokenExpiring(token: string) {
  if (!token) {
    return true
  }
  const payload = jwtDecode<{ exp: number }>(token)
  const timeToLive = payload.exp - new Date().valueOf() / 1000

  return timeToLive <= 60 * 60 // 1 hour
}

export async function refreshTokens(
  sasjsInstance: SASjs,
  clientId: string,
  clientSecret: string,
  refreshToken: string
) {
  const authResponse = await sasjsInstance.refreshTokens(
    clientId,
    clientSecret,
    refreshToken
  )

  return authResponse
}

export async function getNewAccessToken(
  sasjsInstance: SASjs,
  clientId: string,
  clientSecret: string,
  target: Target,
  insecure: boolean = false
) {
  const authUrl = getAuthUrl(target.serverUrl, clientId)
  const authCode = await getAuthCode(authUrl)
  const authResponse = await sasjsInstance.getAccessToken(
    clientId,
    clientSecret,
    authCode,
    insecure
  )

  return authResponse
}
