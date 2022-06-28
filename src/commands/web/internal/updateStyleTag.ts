import path from 'path'
import { createFile, readFile, ServerType } from '@sasjs/utils'
import { encode } from 'js-base64'
import { getWebServiceContent } from './getWebServiceContent'
import { AssetPathMap } from './createAssetServices'
import { modifyLinksInContent } from './modifyLinksInContent'

export const updateStyleTag = async (
  tag: HTMLStyleElement | HTMLLinkElement,
  webSourcePathFull: string,
  destinationPath: string,
  serverType: ServerType,
  assetPathMap: AssetPathMap[]
) => {
  const scriptPath = tag.getAttribute('href')

  if (scriptPath) {
    const isUrl = scriptPath.startsWith('http') || scriptPath.startsWith('//')
    if (!isUrl) {
      const _content = await readFile(
        path.join(webSourcePathFull, scriptPath)
      ).catch((_) => {
        throw new Error(`Unable to find file: ${scriptPath}`)
      })

      const content = modifyLinksInContent(_content, assetPathMap)

      if (serverType === ServerType.SasViya) {
        await createFile(path.join(destinationPath, scriptPath), content)
      } else {
        const serviceContent = await getWebServiceContent(
          encode(content),
          'CSS',
          serverType
        )
        await createFile(
          path.join(
            destinationPath,
            `${scriptPath.replace(/\.css$/, '-css')}.sas`
          ),
          serviceContent
        )
      }

      tag.setAttribute(
        'href',
        assetPathMap.find(
          (entry) =>
            entry.source === scriptPath || `./${entry.source}` === scriptPath
        )!.target
      )
    }
  } else {
    const _content = tag.innerHTML
    const content = modifyLinksInContent(_content, assetPathMap)

    tag.innerHTML = content
  }
}
