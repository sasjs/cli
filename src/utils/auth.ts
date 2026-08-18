import { getString, ServerType, Target } from '@sasjs/utils'
import SASjs, {
  CertificateError,
  SasjsRequestClient
} from '@sasjs/adapter/node'

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
 * Exchanges a refresh token for a new access/refresh token pair.
 * SAS Viya's refresh tokens are single-use and rotate on every call: the
 * `refresh_token` returned here supersedes the one passed in, which becomes
 * invalid immediately. Callers must persist the returned pair (see
 * `saveTokens` in config.ts) or a later refresh attempt with the old token
 * will be rejected by the server.
 */
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

/**
 * The pre-registered, secret-less OAuth client that ships with every SAS Viya
 * deployment (used by the official SAS Viya CLI). Allows authenticating with a
 * SAS username/password (OAuth2 resource owner password grant) when no
 * administrator-registered client/secret is available.
 */
export const SAS_CLI_CLIENT_ID = 'sas.cli'

/**
 * Fetches an access/refresh token pair from SAS Viya using the resource owner
 * password grant against the built-in `sas.cli` public client. Unlike the
 * client/secret flows, no OAuth client registration is required - the
 * credentials are the user's regular SAS logon credentials.
 *
 * Note: this requires the password grant to be enabled for `sas.cli` (the
 * default) and a local/LDAP account - it cannot work on SSO/SAML/MFA-only
 * estates.
 * @param {Target} target - the SASVIYA target to authenticate against.
 * @param {string} user - the SAS username.
 * @param {string} pass - the SAS password.
 * @returns the access and refresh token pair.
 */
export async function getTokensWithPasswordGrant(
  target: Target,
  user: string,
  pass: string
): Promise<{ access_token: string; refresh_token: string }> {
  const requestClient = new SasjsRequestClient(
    target.serverUrl,
    target.httpsAgentOptions
  )

  const basicAuth = Buffer.from(`${SAS_CLI_CLIENT_ID}:`).toString('base64')
  const data = new URLSearchParams({
    grant_type: 'password',
    username: user,
    password: pass
  })

  const authResponse = await requestClient
    .post(
      '/SASLogon/oauth/token',
      data,
      undefined,
      'application/x-www-form-urlencoded',
      {
        Authorization: `Basic ${basicAuth}`,
        Accept: 'application/json'
      }
    )
    .then(
      (res) => res.result as { access_token?: string; refresh_token?: string }
    )
    .catch((err) => {
      if (err instanceof CertificateError) throw err
      throw new Error(
        `Login failed for user '${user}' on ${target.serverUrl}.\n` +
          `Please check your username and password and try again. If they are correct, ` +
          `the password grant may be disabled for the '${SAS_CLI_CLIENT_ID}' client on this Viya deployment.\n` +
          `${err?.message || err}`
      )
    })

  if (!authResponse?.access_token) {
    throw new Error(
      `Login failed: the token endpoint did not return an access token.`
    )
  }

  return {
    access_token: authResponse.access_token as string,
    refresh_token: authResponse.refresh_token as string
  }
}

/**
 * Verifies an access token by fetching the identity it belongs to.
 * @param {Target} target - the SASVIYA target the token was minted for.
 * @param {string} accessToken - the access token to verify.
 * @returns the id and display name of the authenticated user.
 */
export async function fetchLoggedInUser(
  target: Target,
  accessToken: string
): Promise<{ id: string; name?: string }> {
  const requestClient = new SasjsRequestClient(
    target.serverUrl,
    target.httpsAgentOptions
  )
  const { result } = await requestClient
    .get<any>('/identities/users/@currentUser', accessToken)
    .catch((err) => {
      if (err instanceof CertificateError) throw err
      throw new Error(
        `Unable to verify the access token against ${target.serverUrl}: ${
          err?.message || err
        }`
      )
    })

  if (!result?.id) {
    throw new Error(
      'Login succeeded but the identity endpoint returned no user id.'
    )
  }

  return { id: result.id, name: result?.name }
}

export async function getNewAccessToken(
  sasjsInstance: SASjs,
  clientId: string,
  clientSecret: string,
  target: Target
) {
  const authUrl = getAuthUrl(target.serverType, target.serverUrl, clientId)
  const authCode = await getAuthCode(authUrl)
  const { access_token, refresh_token } = await sasjsInstance
    .getAccessToken(clientId, clientSecret, authCode)
    .catch((err) => {
      const errorMessage = `An error has occurred while validating your credentials.\n${err}`
      const checkCredentialsMessage = `Please check your Client ID ${
        target.serverType === ServerType.Sasjs ? '' : 'and Client Secret '
      }and try again.\n`

      const errorMessageToDisplay =
        err instanceof CertificateError
          ? errorMessage
          : `${errorMessage}\n${checkCredentialsMessage}`

      throw errorMessageToDisplay
    })

  return { access_token, refresh_token }
}
