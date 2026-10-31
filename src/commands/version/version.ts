import { readFileSync } from 'fs'
import path from 'path'

/**
 * The message `sasjs version` prints for a given package root.
 *
 * Reads the version from the package.json of the package that is running, so
 * it works for every install shape - global, project-local, `npx`, a temp
 * prefix, or embedded as a dependency. A package root outside a
 * `node_modules` folder is a source checkout (an `npm link`, or a local
 * build), and is reported as such; a source checkout carries no version until
 * semantic-release writes one, so the version is left out when it is absent.
 *
 * @param packageRoot - the folder holding the package.json of the running CLI.
 */
export const versionMessage = (packageRoot: string): string => {
  let version: string | undefined

  try {
    version = JSON.parse(
      readFileSync(path.join(packageRoot, 'package.json'), 'utf8')
    ).version
  } catch (err) {
    throw new Error(
      `Unable to read the CLI version from ${packageRoot}: ${err}. ` +
        `Reinstall the CLI - 'npm i -g @sasjs/cli@latest'.`
    )
  }

  const fromSources = !packageRoot.split(path.sep).includes('node_modules')

  if (fromSources) {
    return version
      ? `You are using a linked version of SASjs CLI (v${version}) running from sources at ${packageRoot}`
      : `You are using a linked version of SASjs CLI running from sources at ${packageRoot}`
  }

  if (!version) {
    throw new Error(
      `The installed CLI at ${packageRoot} has no version in its package.json. ` +
        `Reinstall it - 'npm i -g @sasjs/cli@latest'.`
    )
  }

  return `You are using SASjs CLI v${version}`
}

export async function printVersion() {
  // build/commands/version/ sits three levels below the package root, and so
  // does src/commands/version/ when the suite runs against the sources.
  const packageRoot = path.resolve(__dirname, '../../..')

  const message = versionMessage(packageRoot)

  process.logger?.info(message)

  return message
}
