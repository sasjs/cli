/**
 * The public path a webpack runtime assigns when it is happy to resolve chunk
 * URLs against the document: empty, or "auto" when the runtime should derive it
 * from the script element. Both resolve a chunk against the page's own address.
 */
const emptyPublicPath = /([A-Za-z_$][\w$]*)\.p\s*=\s*(?:"auto"|""|'')/

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Points a bundler runtime's chunk URLs at the streamed asset route.
 *
 * The build rewrites an asset's address by replacing its file name in the text
 * it copies, which covers every file the entry page names. A bundler that splits
 * its output does not name those files there: the runtime composes each chunk's
 * URL at run time from a chunk id and a content hash, and joins it to the public
 * path - `__webpack_require__.p`, which Angular emits as an empty string. An
 * empty public path resolves against the document, so the browser asks the
 * server root for `15.<hash>.js` instead of the deployment folder and every
 * lazily loaded route dies on a 404, while the entry page and its directly
 * linked bundles still load.
 *
 * The public path is the one value that can be set without knowing the chunk
 * names, so it is set to the same prefix the other assets are addressed with.
 * Only a runtime is changed: the file has to assign an empty public path on the
 * same object that builds chunk file names, or it is returned untouched.
 */
export const setWebpackPublicPath = (content: string, assetPrefix: string) => {
  const match = emptyPublicPath.exec(content)

  if (!match) return content

  const [, runtimeName] = match

  // the same object has to be the one that names the chunks; without that this
  // is some unrelated `p` property and rewriting it would be a guess
  const namesChunks = new RegExp(
    `\\b${escapeRegExp(runtimeName)}\\.u\\s*=`
  ).test(content)

  if (!namesChunks) return content

  return content.replace(match[0], `${runtimeName}.p="${assetPrefix}"`)
}
