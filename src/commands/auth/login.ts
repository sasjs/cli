import prompts from 'prompts'
import { getString, ServerType, Target } from '@sasjs/utils'
import {
  fetchLoggedInUser,
  getTokensWithPasswordGrant,
  saveTokens
} from '../../utils'

/**
 * Authenticates against a SASVIYA target using a SAS username and password
 * (OAuth2 resource owner password grant against the built-in, secret-less
 * `sas.cli` client) and persists the resulting token pair. This enables all
 * authenticated commands (`sasjs run`, `sasjs deploy`, etc.) on estates where
 * no administrator-registered OAuth client/secret is available.
 *
 * The password is used only to mint the tokens and is never stored. When the
 * access token expires, re-run `sasjs auth login -t <target>`.
 * @param {Target} target - the target to authenticate against.
 * @param {boolean} insecure - when true, bypasses TLS certificate validation
 *   (for self-signed cert Viya servers). Mirrors the `--insecure` flag on
 *   `sasjs add cred`.
 */
export const authLogin = async (
  target: Target,
  insecure = false
): Promise<void> => {
  if (target.serverType !== ServerType.SasViya) {
    throw new Error(
      `'sasjs auth login' is only supported for SASVIYA targets. ` +
        `Target '${target.name}' is of type '${target.serverType}'. ` +
        `Use 'sasjs add cred -t ${target.name}' instead.`
    )
  }

  if (!target.serverUrl) {
    throw new Error(
      `Target '${target.name}' does not have a serverUrl configured.`
    )
  }

  if (insecure) {
    target = new Target({
      ...target.toJson(false),
      httpsAgentOptions: {
        ...target.httpsAgentOptions,
        allowInsecureRequests: true,
        rejectUnauthorized: false
      }
    })
    process.logger?.warn('Executing with insecure connection.')
  }

  const user = await getString(
    'Please enter your SAS username',
    (v) => !!v || 'Username is required.'
  )

  // Password is prompted with a masked input (prompts 'password' type) rather
  // than getString from @sasjs/utils, because getString has no mask/hide mode
  // and would echo the password to the terminal.
  // The password stays in memory for the remainder of the process. This is an
  // accepted trade-off for a short-lived CLI: the process exits within seconds
  // and Node's V8 heap is not accessible to other users. Clearing the variable
  // would not reliably zero the underlying V8 string storage anyway.
  const { pass } = await prompts(
    {
      type: 'password',
      name: 'pass',
      message: 'Please enter your SAS password'
    },
    {
      onCancel: () => {
        throw new Error('Input cancelled.')
      }
    }
  )

  const { access_token, refresh_token } = await getTokensWithPasswordGrant(
    target,
    user,
    pass
  )

  const { id, name } = await fetchLoggedInUser(target, access_token)

  await saveTokens(target.name, access_token, refresh_token || '')

  process.logger?.success(
    `Logged in as ${id || 'unknown user'}${name ? ` (${name})` : ''} on ${
      target.serverUrl
    }.`
  )
  process.logger?.info(
    `The access token is valid for the duration configured on the server (12 hours by default). ` +
      `When it expires, re-run 'sasjs auth login -t ${target.name}'.`
  )
}
