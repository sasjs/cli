import { FileTree, MemberType, readFile, Target } from '@sasjs/utils'
import { getAccessToken, getSASjs } from '../../utils'

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

  const access_token: string = await getAccessToken(target).catch((e) => '')

  if (!access_token) {
    throw new Error(
      `Deployment failed. Request is not authenticated.\nPlease add the following variables to your .env${
        isLocal ? `.${target.name}` : ''
      } file:\nCLIENT, SECRET, ACCESS_TOKEN, REFRESH_TOKEN`
    )
  }

  const sasjs = getSASjs(target)

  await sasjs
    .deployServicePack(jsonObject, undefined, undefined, access_token, isForced)
    .catch((err: any) => {
      process.logger.error('deployServicePack error', err)
      throw new Error('Deploy service pack error')
    })

  return jsonObject
}

const populateCodeInServicePack = (json: any) =>
  json?.members?.forEach((member: any) => {
    if (member.type === MemberType.file)
      member.code = Buffer.from(member.code!, 'base64')
    if (member.type === MemberType.folder) populateCodeInServicePack(member)
  })
