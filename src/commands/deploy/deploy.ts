import path from 'path'
import { getStreamConfig } from '../../utils/config'
import {
  ServerType,
  Target,
  asyncForEach,
  getAbsolutePath,
  FileTree,
  FolderMember,
  MemberType
} from '@sasjs/utils'
import { deployToSasViyaWithServicePack } from '../shared/deployToSasViyaWithServicePack'
import {
  getDeployScripts,
  deployToSasjsWithServicePack,
  executeSasScript,
  executeDeployScript
} from './internal'

/**
 * Deploys app to serverUrl/appLoc mentioned in specified target.
 * @param {Target} target - the target having deploy configuration.
 * @param {boolean} isLocal - flag indicating if specified target is
 * from local sasjsconfig or global sasjsconfig file.
 */
export async function deploy(target: Target, isLocal: boolean) {
  const streamConfig = await getStreamConfig(target)

  if (target.deployConfig?.deployServicePack) {
    const { buildDestinationFolder } = process.sasjsConstants
    const finalFilePathJSON = path.join(
      buildDestinationFolder,
      `${target.name}.json`
    )

    if (target.serverType === ServerType.SasViya) {
      const appLoc = encodeURI(target.appLoc)
      process.logger?.info(
        `Deploying service pack to ${target.serverUrl} at location ${appLoc} .`
      )

      const jsonObject: FileTree = await deployToSasViyaWithServicePack(
        finalFilePathJSON,
        target,
        isLocal,
        true
      )

      const servicesFolder = jsonObject?.members.find<FolderMember>(
        (member): member is FolderMember =>
          member?.name === 'services' && member?.type === MemberType.folder
      )

      const webIndexFileName: string =
        servicesFolder?.members?.find(
          (member: any) => member?.type === MemberType.file
        )?.name ?? ''

      process.logger?.success('Build pack has been successfully deployed.')

      process.logger?.success(
        target.serverType === ServerType.SasViya && webIndexFileName
          ? `${target.serverUrl}/SASJobExecution?_file=${appLoc}/services/${webIndexFileName}`
          : `${target.serverUrl}/SASJobExecution?_folder=${appLoc}`
      )
    } else if (target.serverType === ServerType.Sasjs) {
      process.logger?.info(
        `Deploying service pack to ${target.serverUrl} at location ${target.appLoc} .`
      )
      await deployToSasjsWithServicePack(
        finalFilePathJSON,
        target,
        streamConfig
      )
    } else if (target.serverType === ServerType.Sas9) {
      // To deploy services on sas9, we execute the sas script that's created in the result of build process.
      const buildOutputFileName =
        target.buildConfig?.buildOutputFileName || `${target.name}.sas`
      const deployScriptPath = path.join(
        buildDestinationFolder,
        buildOutputFileName
      )

      await executeSasScript(deployScriptPath, target, streamConfig)
    }
  }

  const deployScripts = await getDeployScripts(target)

  if (deployScripts.length === 0 && !target.deployConfig?.deployServicePack) {
    throw new Error(
      `Deployment failed.\nPlease either enable the 'deployServicePack' option or add deployment script paths to 'deployScripts' in your target's 'deployConfig'.`
    )
  }

  await asyncForEach(deployScripts, async (deployScript) => {
    const deployScriptPath = getAbsolutePath(deployScript, process.projectDir)
    await executeDeployScript(deployScriptPath, target, streamConfig)
  })
}
