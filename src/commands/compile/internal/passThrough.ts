import { isSasFile } from '../../../utils/file'

/**
 * Whether a file in a service or job folder is deployed as written.
 *
 * Anything that is not a `.sas` program is copied into the build folder
 * untouched and travels in the pack as a file member under its own name - a
 * `.js` stored program for a SASjs server, web assets, a payload the deployment
 * script needs. Compiling it as SAS would corrupt it, and deciding that per
 * server type would mean the same project produced different packs depending on
 * the target. The server picks a runtime from the extension, or ignores the
 * file; either way the CLI's job is to ship it intact.
 */
export const shouldPassThrough = (fileName: string) => !isSasFile(fileName)
