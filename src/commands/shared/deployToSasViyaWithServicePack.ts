import { FileTree, MemberType, readFile, Target } from '@sasjs/utils'
import { DeployProgress } from '@sasjs/adapter'
import { getAuthConfig, getSASjs } from '../../utils'
import { deployProgressLine } from './deployProgress'

export async function deployToSasViyaWithServicePack(
  jsonFilePath: string,
  target: Target,
  isLocal: boolean,
  isForced: boolean = false
): Promise<FileTree> {
  const jsonContent = await readFile(jsonFilePath)

  let jsonObject: FileTree

  try {
    jsonObject = JSON.parse(jsonContent)
  } catch (err) {
    throw new Error('Provided data file must be valid json.')
  }

  populateCodeInServicePack(jsonObject)

  // getAuthConfig (not getAccessToken) is required here: it persists a
  // refreshed access/refresh token pair back to disk, which matters because
  // Viya refresh tokens are single-use/rotating - see getAuthConfig's doc.
  // The original error is forwarded rather than replaced, since it already
  // describes the real cause (missing client/secret, or a rejected refresh).
  const { access_token } = await getAuthConfig(target).catch((err) => {
    throw new Error(
      `Deployment failed. Request is not authenticated.\n${err?.message || err}`
    )
  })

  const sasjs = getSASjs(target)

  await sasjs
    .deployServicePack(
      jsonObject,
      undefined,
      undefined,
      access_token,
      isForced,
      reportProgress
    )
    .catch((err: any) => {
      process.logger.error('deployServicePack error', err)
      throw new Error('Deploy service pack error')
    })

  return jsonObject
}

/**
 * Reports each member as the adapter writes it.
 *
 * The adapter is the only place that knows the member order and the total, so
 * the deploy passes this in rather than guessing from the tree.
 */
const reportProgress = (progress: DeployProgress) =>
  process.logger?.info(deployProgressLine(progress))

const populateCodeInServicePack = (json: any) =>
  json?.members?.forEach((member: any) => {
    if (member.type === MemberType.file)
      member.code = Buffer.from(member.code!, 'base64')
    if (member.type === MemberType.folder) populateCodeInServicePack(member)
  })
