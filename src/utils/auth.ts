import axios from 'axios'
import * as https from 'https'
import { getString, ServerType, Target } from '@sasjs/utils'
import SASjs, {
  CertificateError,
  SasjsRequestClient
} from '@sasjs/adapter/node'

/**
 * The URL a user visits to obtain an authorization code.
 *
 * SASjs Server serves its authorization code screen at /SASjsLogon - a real
 * path on its single-page app. SAS Viya answers at its own /SASLogon endpoint.
 */
export const getAuthUrl = (
  serverType: ServerType,
  serverUrl: string,
  clientId: string
) =>
  serverType === ServerType.Sasjs
    ? `${serverUrl}/SASjsLogon?client_id=${clientId}&response_type=code`
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
    // Some Viya deployments omit refresh_token for the password grant; default
    // to '' so downstream code (saveTokens, config) can treat it as a plain
    // string rather than handling undefined.
    refresh_token: authResponse.refresh_token || ''
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

/**
 * Mints a token pair from the local login of a SASjs Server target.
 *
 * SASjs Server has no secret-less OAuth client and no password grant: the
 * tokens it issues come from its own sign-in flow, the one its web app uses.
 * Reproducing that flow here is what makes `sasjs auth login` usable on a SASjs
 * target from CI, where there is no browser to visit /SASjsLogon and no
 * administrator-registered client secret to fall back on:
 *
 *   GET  /                     sets the XSRF-TOKEN cookie
 *   POST /SASLogon/login       creates the session
 *   POST /SASLogon/authorize   returns a single-use authorization code
 *   POST /SASjsApi/auth/token  exchanges it for an access/refresh pair
 *
 * @param {Target} target - the SASJS target to authenticate against.
 * @param {string} user - the SASjs Server username.
 * @param {string} pass - the SASjs Server password.
 * @param {string} [clientId] - the registered client to authorize, usually from
 *   the SASJS_CLIENT environment variable. When absent, the target's configured
 *   client is used, and failing that the first registered client if the account
 *   is an administrator.
 * @returns the token pair, the client that was authorized, and the display name
 *   the server reports for the user.
 */
export async function getTokensWithSasjsLogin(
  target: Target,
  user: string,
  pass: string,
  clientId?: string
): Promise<{
  access_token: string
  refresh_token: string
  client: string
  displayName?: string
}> {
  const baseUrl = target.serverUrl.replace(/\/+$/, '')
  const cookies = new Map<string, string>()

  // Cookie values are percent-encoded by the server, but a malformed value
  // (a bare '%', a truncated escape) must not become an uncaught URIError -
  // fall back to the raw value and let the request fail on its merits.
  const safeDecode = (value: string) => {
    try {
      return decodeURIComponent(value)
    } catch {
      return value
    }
  }

  const collectCookies = (setCookie?: string[] | string) => {
    const entries: string[] = Array.isArray(setCookie)
      ? setCookie
      : setCookie
        ? [setCookie]
        : []
    entries.forEach((entry) => {
      const pair = entry.split(';')[0]
      const index = pair.indexOf('=')
      if (index > 0) {
        cookies.set(pair.slice(0, index).trim(), pair.slice(index + 1).trim())
      }
    })
  }

  const instance = axios.create({
    baseURL: baseUrl,
    validateStatus: () => true,
    // The login request carries the password in a body, so a redirect must not
    // replay it to wherever 'Location' points. A redirect is a configuration
    // problem (proxy, SSO front end) - report it instead of following it.
    maxRedirects: 0,
    httpsAgent: target.httpsAgentOptions
      ? new https.Agent(target.httpsAgentOptions)
      : undefined,
    headers: { Accept: 'application/json' }
  })

  const call = async (
    method: 'get' | 'post',
    path: string,
    data?: Record<string, unknown>
  ) => {
    const headers: Record<string, string> = {}
    if (cookies.size) {
      headers.Cookie = [...cookies]
        .map(([name, value]) => `${name}=${value}`)
        .join('; ')
    }
    const xsrf = cookies.get('XSRF-TOKEN')
    if (xsrf) headers['X-XSRF-TOKEN'] = safeDecode(xsrf)

    const response = await instance.request({
      method,
      url: path,
      data,
      headers
    })

    if (response.status >= 300 && response.status < 400) {
      throw new Error(
        `${baseUrl}${path} answered with a ${response.status} redirect to ` +
          `'${response.headers.location || 'unknown'}'. It is not followed: ` +
          `the sign-in request carries the password. Point the target at the ` +
          `final URL.`
      )
    }

    collectCookies(
      response.headers['set-cookie'] as string[] | string | undefined
    )
    return response
  }

  const fail = (message: string) =>
    new Error(
      `${message}\nCheck that '${user}' can sign in to ${target.serverUrl}, and that ` +
        `the client id is set (SASJS_CLIENT) if the account is not an administrator.`
    )

  // GET / serves the single page app but sets the XSRF cookie the login needs.
  await call('get', '/')

  const login = await call('post', '/SASLogon/login', {
    username: user,
    password: pass
  })
  if (login.status !== 200 || !login.data?.loggedIn) {
    throw fail(
      `Login failed for user '${user}' on ${target.serverUrl} (HTTP ${login.status}).`
    )
  }

  let client = clientId || target.authConfig?.client || ''
  if (!client) {
    // Only an administrator may list the registered clients; a 403 here is not
    // an error worth reporting on its own - the message below covers it.
    const clients = await call('get', '/SASjsApi/client')
    if (Array.isArray(clients.data) && clients.data.length) {
      client = clients.data[0].clientId
      // Say which one was picked: the listing order is the server's, and a
      // silent choice here is impossible to debug from the tokens alone.
      process.logger?.info(
        `Using the first registered client ('${client}'). Set SASJS_CLIENT ` +
          `to authorize a specific client.`
      )
    }
  }
  if (!client) {
    throw fail('No client id is available to authorize.')
  }

  const authorized = await call('post', '/SASLogon/authorize', {
    clientId: client
  })
  const code = authorized.data?.code
  if (!code) {
    throw fail(
      `Authorization failed for client '${client}' (HTTP ${authorized.status}).`
    )
  }

  const tokens = await call('post', '/SASjsApi/auth/token', {
    clientId: client,
    code
  })
  if (!tokens.data?.accessToken) {
    throw fail(
      `The token endpoint returned no access token (HTTP ${tokens.status}).`
    )
  }

  return {
    access_token: tokens.data.accessToken,
    refresh_token: tokens.data.refreshToken || '',
    client,
    displayName: login.data?.user?.displayName || login.data?.user?.username
  }
}
