/**
 * `mockWebBasePath` on a stream config.
 *
 * A `.ts` rather than a `.d.ts` so it compiles into `build/types/` with the
 * rest of the package: tsc does not emit an ambient input file, and this one
 * would otherwise type the CLI's own build and vanish from the published one.
 *
 * The option belongs to the mock target the CLI reads, but `StreamConfig` in
 * @sasjs/utils 4.9.0 predates it, so without this the property is invisible to
 * anyone typing a sasjsconfig and to anything that round-trips a target through
 * the type. The field lands upstream in sasjs/utils#317; when the pin moves past
 * that release, delete this file and the declaration merges from the package
 * itself.
 */
export {}

declare module '@sasjs/utils/types/config' {
  interface StreamConfig {
    /**
     * The folder the mock site is published in, as a path with no trailing
     * slash (`/demo`). Unset means the origin root.
     */
    mockWebBasePath?: string
    /**
     * Whether the mock site carries the API console at `<base>/api/`.
     *
     * On unless it is set to false: the console is how a demonstration site lets
     * a visitor try the API it is a mock of, and a page nothing links to costs
     * the app nothing. A site whose output must be the app and nothing else
     * turns it off.
     */
    mockApi?: boolean
  }
}
