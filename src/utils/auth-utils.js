import chalk from 'chalk'
import path from 'path'
import prompt from 'prompt'
import { createFile } from './file'
import {
  getLocalRcFile,
  getGlobalRcFile,
  saveGlobalRcFile,
  getProjectRoot,
  saveLocalRcFile
} from './config-utils'
import jwtDecode from 'jwt-decode'

export function getAuthUrl(serverUrl, clientId) {
  return `${serverUrl}/SASLogon/oauth/authorize?client_id=${clientId}&response_type=code`
}

export async function getAuthCode(authUrl) {
  console.log(
    chalk.cyanBright(
      'Please perform the following steps to get your authorization code:\n'
    )
  )
  console.log(
    chalk.cyanBright(
      `${chalk.greenBright(1)}. visit ${chalk.greenBright(authUrl)}`
    )
  )
  console.log(
    chalk.cyanBright(
      `${chalk.greenBright(2)}. Sign in with your SAS credentials if necessary.`
    )
  )
  console.log(
    chalk.cyanBright(
      `${chalk.greenBright(3)}. Enter/paste the authorization code here`
    )
  )

  prompt.message = ''
  prompt.start()
  return new Promise((resolve, reject) => {
    prompt.get(
      [{ name: 'authCode', description: 'Authorization Code' }],
      (error, result) => {
        if (error) {
          reject(error)
        }
        resolve(result.authCode)
      }
    )
  })
}

export async function getAccessToken(
  sasjsInstance,
  clientId,
  clientSecret,
  buildTarget,
  isLocalTarget
) {
  if (isLocalTarget) {
    const localRcFile = await getLocalRcFile()
    if (localRcFile) {
      const target = localRcFile.targets.find(
        (t) => t.name === buildTarget.name
      )
      if (target) {
        const authInfo = await getAuthInfo(
          target,
          clientId,
          clientSecret,
          sasjsInstance
        )
        target.authInfo = authInfo
        localRcFile.targets = [
          ...localRcFile.targets.filter((t) => t.name !== buildTarget.name),
          target
        ]
        await saveLocalRcFile(JSON.stringify(localRcFile, null, 2))

        return authInfo.access_token
      } else {
        const authResponse = await getNewAccessToken(
          sasjsInstance,
          clientId,
          clientSecret,
          buildTarget
        )
        const rootPath = await getProjectRoot()
        const existingTargets = localRcFile.config.targets || []
        await createFile(
          path.join(rootPath, '.sasjsrc'),
          JSON.stringify(
            {
              targets: [
                ...existingTargets,
                { ...buildTarget, authInfo: authResponse }
              ]
            },
            null,
            2
          )
        )
        return authResponse.access_token
      }
    } else {
      const authResponse = await getNewAccessToken(
        sasjsInstance,
        clientId,
        clientSecret,
        buildTarget
      )
      const rootPath = await getProjectRoot()
      await createFile(
        path.join(rootPath, '.sasjsrc'),
        JSON.stringify(
          { targets: [{ ...buildTarget, authInfo: authResponse }] },
          null,
          2
        )
      )
      return authResponse.access_token
    }
  } else {
    const globalRcFile = await getGlobalRcFile()
    if (globalRcFile) {
      const target = globalRcFile.targets.find(
        (t) => t.name === buildTarget.name
      )
      if (target) {
        const authInfo = await getAuthInfo(
          target,
          clientId,
          clientSecret,
          sasjsInstance
        )
        target.authInfo = authInfo
        globalRcFile.targets = [
          ...globalRcFile.targets.filter((t) => t.name !== buildTarget.name),
          target
        ]
        await saveGlobalRcFile(JSON.stringify(globalRcFile, null, 2))

        return authInfo.access_token
      } else {
        const authResponse = await getNewAccessToken(
          sasjsInstance,
          clientId,
          clientSecret,
          buildTarget
        )
        const existingTargets = globalRcFile.targets || []
        await saveGlobalRcFile(
          JSON.stringify(
            {
              targets: [
                ...existingTargets,
                { ...buildTarget, authInfo: authResponse }
              ]
            },
            null,
            2
          )
        )
        return authResponse.access_token
      }
    } else {
      const authResponse = await getNewAccessToken(
        sasjsInstance,
        clientId,
        clientSecret,
        buildTarget
      )
      const rootPath = await getProjectRoot()
      await createFile(
        path.join(rootPath, '.sasjsrc'),
        JSON.stringify(
          { targets: [{ ...buildTarget, authInfo: authResponse }] },
          null,
          2
        )
      )
      return authResponse.access_token
    }
  }
}

export function isAccessTokenExpiring(token) {
  if (!token) {
    return true
  }
  const payload = jwtDecode(token)
  const timeToLive = payload.exp - new Date().valueOf() / 1000

  return timeToLive <= 60 * 60 // 1 hour
}

export async function refreshTokens(
  sasjsInstance,
  clientId,
  clientSecret,
  refreshToken
) {
  const authResponse = await sasjsInstance.refreshTokens(
    clientId,
    clientSecret,
    refreshToken
  )

  return authResponse
}

export async function getNewAccessToken(
  sasjsInstance,
  clientId,
  clientSecret,
  buildTarget
) {
  const authUrl = getAuthUrl(buildTarget.serverUrl, clientId)
  const authCode = await getAuthCode(authUrl)
  const authResponse = await sasjsInstance.getAccessToken(
    clientId,
    clientSecret,
    authCode
  )

  return authResponse
}

async function getAuthInfo(target, clientId, clientSecret, sasjsInstance) {
  if (target.authInfo) {
    const { access_token, refresh_token } = target.authInfo
    const isTokenExpiring = isAccessTokenExpiring(access_token)
    if (!isTokenExpiring) {
      return target.authInfo
    }
    const newAuthResponse = await refreshTokens(
      sasjsInstance,
      clientId,
      clientSecret,
      refresh_token
    )

    return newAuthResponse
  } else {
    const newAuthResponse = await getNewAccessToken(
      sasjsInstance,
      clientId,
      clientSecret,
      target
    )

    return newAuthResponse
  }
}
