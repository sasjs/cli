/**
 * A server URL reduced to the base every address is joined to.
 *
 * A printed address is the server URL followed by a route that starts with `/`,
 * so `https://host/` would print `https://host//app/<id>/` - a path no mount
 * answers. Nothing upstream strips it: `@sasjs/utils`'s `validateServerUrl` only
 * checks the scheme, and a `sasjsconfig.json` is a file a person can write by
 * hand.
 *
 * One home for the rule, in `utils` rather than beside any one command, because
 * every caller that composes an address from `serverUrl` - a printed one, or the
 * base a request is made against - needs the same normalisation and none of them
 * owns it.
 */
export const withoutTrailingSlash = (serverUrl: string) =>
  serverUrl.replace(/\/+$/, '')
