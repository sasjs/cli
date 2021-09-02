import SASjs from '@sasjs/adapter/node'
import { readFile, Target } from '@sasjs/utils'
import { ServicePack, ServicePackMember } from '../../types'
import { decode } from 'js-base64'
import { getAccessToken } from '../../utils'

export async function deployToSasViyaWithServicePack(
  jsonFilePath: string,
  target: Target,
  isLocal: boolean,
  isForced: boolean = false
): Promise<ServicePack> {
  const jsonContent = await readFile(jsonFilePath)

  let jsonObject: ServicePack

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
    allowInsecureRequests: target.allowInsecureRequests,
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

const populateCodeInServicePack = (json: ServicePack | ServicePackMember) =>
  json?.members?.forEach((member: ServicePackMember) => {
    if (member.type === 'file') member.code = decode(member.code!)
    if (member.type === 'folder') populateCodeInServicePack(member)
  })
