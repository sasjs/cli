/**
 * `mockWebBasePath` on a stream config.
 *
 * The option belongs to the mock target the CLI reads, but `StreamConfig` in
 * @sasjs/utils 4.9.0 predates it, so without this the property is invisible to
 * anyone typing a sasjsconfig and to anything that round-trips a target through
 * the type. The field lands upstream in sasjs/utils#317; when the pin moves past
 * that release, delete this file and the declaration merges from the package
 * itself.
 */
import '@sasjs/utils/types/config'

declare module '@sasjs/utils/types/config' {
  interface StreamConfig {
    /**
     * The folder the mock site is published in, as a path with no trailing
     * slash (`/demo`). Unset means the origin root.
     */
    mockWebBasePath?: string
  }
}
