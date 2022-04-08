import SASjs from '@sasjs/adapter/node'
import {
  FileMember,
  FileTree,
  FolderMember,
  MemberType,
  readFile,
  ServiceMember,
  Target
} from '@sasjs/utils'
import { decode } from 'js-base64'
import { getAccessToken } from '../../utils'

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

  const sasjs = new SASjs({
    httpsAgentOptions: target.httpsAgentOptions,
    appLoc: target.appLoc,
    serverType: target.serverType,
    serverUrl: target.serverUrl,
    useComputeApi: true
  })

  await sasjs.deployServicePack(
    jsonObject,
    undefined,
    undefined,
    access_token,
    isForced
  )

  return jsonObject
}

const populateCodeInServicePack = (json: FileTree) =>
  json?.members?.forEach(
    (member: FolderMember | ServiceMember | FileMember) => {
      if (member.type === MemberType.file) member.code = decode(member.code!)
      if (member.type === MemberType.folder) populateCodeInServicePack(member)
    }
  )
