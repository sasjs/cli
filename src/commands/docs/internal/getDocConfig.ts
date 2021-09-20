import { Target, Configuration } from '@sasjs/utils/types'

/**
 * Returns doc related config from root-level and Target-specfic(having precedence)
 * @param {Configuration} config- from which doc related config will be extracted
 * @param {Target} target- the target for doc config.
 * @param {string} outDirectory- the name of the output folder, provided using command.
 */
export function getDocConfig(
  target?: Target,
  config?: Configuration,
  outDirectory?: string
) {
  const { buildDestinationDocsFolder } = process.sasjsConstants

  if (!outDirectory) {
    outDirectory =
      target?.docConfig?.outDirectory ||
      config?.docConfig?.outDirectory ||
      buildDestinationDocsFolder
  }

  let serverUrl = ''
  serverUrl = config?.docConfig?.dataControllerUrl
    ? config.docConfig.dataControllerUrl.split('#')[0] + '#/view/viewer/'
    : ''
  serverUrl = target?.docConfig?.dataControllerUrl
    ? target.docConfig.dataControllerUrl.split('#')[0] + '#/view/viewer/'
    : serverUrl

  const enableLineage: boolean =
    target?.docConfig?.enableLineage ?? config?.docConfig?.enableLineage ?? true

  const doxyContent = {
    ...config?.docConfig?.doxyContent,
    ...target?.docConfig?.doxyContent
  }

  if (doxyContent.path?.startsWith('//')) {
    throw new Error(
      'UNC paths are not supported. Please map to a network drive, or migrate the project to an existing path (with a drive letter).'
    )
  }

  return {
    target,
    serverUrl,
    newOutDirectory: outDirectory,
    enableLineage,
    doxyContent
  }
}
