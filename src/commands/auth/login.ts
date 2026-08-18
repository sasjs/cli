import prompts from 'prompts'
import { getString, ServerType, Target } from '@sasjs/utils'
import {
  fetchLoggedInUser,
  getTokensWithPasswordGrant,
  saveTokens
} from '../../utils'

/**
 * Reads a single line/value from stdin until EOF or newline, then trims
 * trailing whitespace. Used by the `--password-stdin` flow so passwords can
 * be piped without appearing in shell history or process argument lists.
 */
const readPasswordFromStdin = async (): Promise<string> => {
  let data = ''
  for await (const chunk of process.stdin) {
    data += chunk.toString()
  }
  // Trim trailing newline/carriage-return only; leading/trailing spaces are
  // intentionally preserved in case a password genuinely contains them.
  return data.replace(/[\r\n]+$/g, '')
}

/**
 * Authenticates against a SASVIYA target using a SAS username and password
 * (OAuth2 resource owner password grant against the built-in, secret-less
 * `sas.cli` client) and persists the resulting token pair. This enables all
 * authenticated commands (`sasjs run`, `sasjs deploy`, etc.) on estates where
 * no administrator-registered OAuth client/secret is available.
 *
 * Credentials are resolved in this order (highest precedence first):
 *
 *   Username:  SAS_USERNAME env var  >  interactive prompt (TTY only)
 *   Password:  --password-stdin      >  SAS_PASSWORD env var  >  interactive prompt (TTY only)
 *
 * When `--password-stdin` is set, stdin is consumed for the password, so the
 * username MUST come from the SAS_USERNAME env var (interactive prompting is
 * not possible because stdin is already redirected).
 *
 * If no TTY is available and no env var / stdin flag supplies the credential,
 * the function throws with a message pointing the caller at the env vars or
 * `--password-stdin` flag — this makes `sasjs auth login` safe to call from
 * CI pipelines and non-interactive agents.
 *
 * The password is used only to mint the tokens and is never stored. When the
 * access token expires, re-run `sasjs auth login -t <target>`.
 * @param {Target} target - the target to authenticate against.
 * @param {boolean} insecure - when true, bypasses TLS certificate validation
 *   (for self-signed cert Viya servers). Mirrors the `--insecure` flag on
 *   `sasjs add cred`.
 * @param {boolean} passwordStdin - when true, reads the password from stdin
 *   (like `docker login --password-stdin`) instead of prompting or reading
 *   the SAS_PASSWORD env var. The username must then come from SAS_USERNAME.
 */
export const authLogin = async (
  target: Target,
  insecure = false,
  passwordStdin = false
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

  const isTty = !!process.stdin.isTTY
  const envUser = process.env.SAS_USERNAME
  const envPass = process.env.SAS_PASSWORD

  // --- Username resolution -------------------------------------------------
  // Precedence: SAS_USERNAME env var > interactive prompt (TTY only).
  // When --password-stdin is set, stdin is reserved for the password, so the
  // username MUST come from the env var — no interactive prompt is possible.
  let user: string
  if (envUser) {
    user = envUser
  } else if (isTty && !passwordStdin) {
    user = await getString(
      'Please enter your SAS username',
      (v) => !!v || 'Username is required.'
    )
  } else {
    const hint = passwordStdin
      ? `When using --password-stdin, the username must be provided via the SAS_USERNAME environment variable (stdin is used for the password).`
      : `No TTY is available for an interactive prompt. Set the SAS_USERNAME environment variable (and SAS_PASSWORD, or use --password-stdin).`
    throw new Error(`A SAS username is required but was not provided. ${hint}`)
  }

  // --- Password resolution -------------------------------------------------
  // Precedence: --password-stdin > SAS_PASSWORD env var > interactive prompt
  // (TTY only). The password is never logged or persisted beyond the lifetime
  // of this short-lived process — same guarantee as the interactive flow.
  let pass: string
  if (passwordStdin) {
    pass = await readPasswordFromStdin()
    if (!pass) {
      throw new Error(
        `--password-stdin was specified but no password was read from stdin. ` +
          `Pipe the password, e.g. echo "$SAS_PASSWORD" | sasjs auth login --password-stdin -t ${target.name}.`
      )
    }
  } else if (envPass) {
    pass = envPass
  } else if (isTty) {
    // Password is prompted with a masked input (prompts 'password' type)
    // rather than getString from @sasjs/utils, because getString has no
    // mask/hide mode and would echo the password to the terminal.
    // The password stays in memory for the remainder of the process. This is
    // an accepted trade-off for a short-lived CLI: the process exits within
    // seconds and Node's V8 heap is not accessible to other users. Clearing
    // the variable would not reliably zero the underlying V8 string storage
    // anyway.
    const { pass: promptedPass } = await prompts(
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
    pass = promptedPass
  } else {
    throw new Error(
      `A SAS password is required but was not provided. ` +
        `Set the SAS_PASSWORD environment variable, or pipe the password and use --password-stdin ` +
        `(e.g. echo "$SAS_PASSWORD" | sasjs auth login --password-stdin -t ${target.name}).`
    )
  }

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
