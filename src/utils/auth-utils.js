import chalk from 'chalk'
import prompt from 'prompt'
import jwtDecode from 'jwt-decode'

export function getAuthUrl(serverUrl, clientId) {
  return `${serverUrl}/SASLogon/oauth/authorize?client_id=${clientId}&response_type=code`
}

export async function getAuthCode(authUrl) {
  console.log(
    chalk.cyanBright(
      'Please perform the following steps to get your authorization code:\n'
    )
  )
  console.log(
    chalk.cyanBright(
      `${chalk.greenBright(1)}. visit ${chalk.greenBright(authUrl)}`
    )
  )
  console.log(
    chalk.cyanBright(
      `${chalk.greenBright(2)}. Sign in with your SAS credentials if necessary.`
    )
  )
  console.log(
    chalk.cyanBright(
      `${chalk.greenBright(3)}. Enter/paste the authorization code here`
    )
  )

  prompt.message = ''
  prompt.start()
  return new Promise((resolve, reject) => {
    prompt.get(
      [{ name: 'authCode', description: 'Authorization Code' }],
      (error, result) => {
        if (error) {
          reject(error)
        }
        resolve(result.authCode)
      }
    )
  })
}

export function isAccessTokenExpiring(token) {
  if (!token) {
    return true
  }
  const payload = jwtDecode(token)
  const timeToLive = payload.exp - new Date().valueOf() / 1000

  return timeToLive <= 60 * 60 // 1 hour
}

export async function refreshTokens(
  sasjsInstance,
  clientId,
  clientSecret,
  refreshToken
) {
  const authResponse = await sasjsInstance.refreshTokens(
    clientId,
    clientSecret,
    refreshToken
  )

  return authResponse
}

export async function getNewAccessToken(
  sasjsInstance,
  clientId,
  clientSecret,
  buildTarget
) {
  const authUrl = getAuthUrl(buildTarget.serverUrl, clientId)
  const authCode = await getAuthCode(authUrl)
  const authResponse = await sasjsInstance.getAccessToken(
    clientId,
    clientSecret,
    authCode
  )

  if (authResponse && authResponse.error) {
    throw new Error(`${authResponse.error} - ${authResponse.error_description}`)
  }

  return authResponse
}

async function getAuthInfo(target, clientId, clientSecret, sasjsInstance) {
  if (target.authInfo) {
    const { access_token, refresh_token } = target.authInfo
    const isTokenExpiring = isAccessTokenExpiring(access_token)
    if (!isTokenExpiring) {
      return target.authInfo
    }
    const newAuthResponse = await refreshTokens(
      sasjsInstance,
      clientId,
      clientSecret,
      refresh_token
    )

    return newAuthResponse
  } else {
    const newAuthResponse = await getNewAccessToken(
      sasjsInstance,
      clientId,
      clientSecret,
      target
    )

    return newAuthResponse
  }
}
