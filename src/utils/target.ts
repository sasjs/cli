import { Target } from '@sasjs/utils/types'

/**
 * The target to make requests with, given the user's `--insecure` choice.
 *
 * Returns the target itself when `insecure` is false, and a copy whose
 * `httpsAgentOptions` accept certificates that cannot be verified otherwise
 * when it is true - a self-signed certificate, or a chain with the
 * intermediate missing.
 *
 * The copy is deliberate: `--insecure` is a property of the invocation, not of
 * the target, so the settings must not reach the configuration that is saved
 * afterwards. Callers keep the original target for persistence and pass this
 * one to `getSASjs` and to anything else that opens a connection.
 */
export const targetWithInsecureHttps = (
  target: Target,
  insecure: boolean
): Target =>
  insecure
    ? new Target({
        ...target.toJson(false),
        httpsAgentOptions: {
          ...target.httpsAgentOptions,
          allowInsecureRequests: true,
          rejectUnauthorized: false
        }
      })
    : target
