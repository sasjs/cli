/**
 * The public path a webpack runtime assigns to its chunks: a string literal.
 * Angular emits an empty one, but a build given a deploy URL or a base href
 * emits that address instead - and a streamed deployment owns where the assets
 * are fetched from, so either value is the wrong one to keep.
 */
const publicPathAssignment = /([A-Za-z_$][\w$]*)\.p\s*=\s*("[^"]*"|'[^']*')/g

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
 * Only a runtime is changed: the file has to assign a literal public path on the
 * same object that builds chunk file names, or it is returned untouched. A
 * public path that is computed rather than a literal is left as it is - the
 * value it will hold cannot be read here.
 */
export const setWebpackPublicPath = (content: string, assetPrefix: string) => {
  return content.replace(
    publicPathAssignment,
    (assignment, runtimeName: string) => {
      // Only the object that names chunks is a candidate for this rewrite.
      const namesChunks = new RegExp(
        `\\b${escapeRegExp(runtimeName)}\\.u\\s*=`
      ).test(content)
      return namesChunks
        ? `${runtimeName}.p=${JSON.stringify(assetPrefix)}`
        : assignment
    }
  )
}
