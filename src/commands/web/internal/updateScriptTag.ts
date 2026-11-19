import path from 'path'
import { createFile, readFile, ServerType } from '@sasjs/utils'
import { encode } from 'js-base64'
import { getWebServiceContent } from './sas9'
import { AssetPathMap } from './createAssetServices'
import { modifyLinksInContent } from './modifyLinksInContent'
import { setWebpackPublicPath } from './setWebpackPublicPath'

export const updateScriptTag = async (
  tag: HTMLScriptElement,
  webSourcePathFull: string,
  destinationPath: string,
  serverType: ServerType,
  assetPathMap: AssetPathMap[],
  assetPrefix?: string
) => {
  const scriptPath = tag.getAttribute('src')

  if (scriptPath) {
    const isUrl = scriptPath.startsWith('http') || scriptPath.startsWith('//')
    if (!isUrl) {
      const _content = await readFile(
        path.join(webSourcePathFull, scriptPath)
      ).catch((_) => {
        throw new Error(`Unable to find file: ${scriptPath}`)
      })

      const content = modifyLinksInContent(_content, assetPathMap)

      // a runtime that composes chunk names at run time is addressed by its
      // public path, not by the file names the other assets are rewritten by -
      // see setWebpackPublicPath. SAS 9 names each asset service by hand, so it
      // is left to the stored process generated below.
      const streamedContent =
        assetPrefix && serverType !== ServerType.Sas9
          ? setWebpackPublicPath(content, assetPrefix)
          : content

      switch (serverType) {
        // Viya and SASjs server both serve the asset itself, so the rewritten
        // content is written beside the copy createAssetServices made; SAS 9 has
        // no file service, so the same content becomes a stored process
        case ServerType.SasViya:
        case ServerType.Sasjs:
          await createFile(
            path.join(destinationPath, scriptPath),
            streamedContent
          )
          break

        case ServerType.Sas9:
          const serviceContent = await getWebServiceContent(
            encode(content),
            'JS'
          )
          await createFile(
            path.join(
              destinationPath,
              `${scriptPath.replace(/\.js$/, '-js')}.sas`
            ),
            serviceContent
          )
          break

        default:
          throw new Error(
            `Server Type: ${serverType} is not supported for updating script tag.`
          )
      }

      tag.setAttribute(
        'src',
        assetPathMap.find(
          (entry) =>
            entry.source === scriptPath ||
            `./${entry.source}` === scriptPath ||
            `/${entry.source}` === scriptPath
        )!.target
      )
    }
  } else {
    const _content = tag.innerHTML
    const content = modifyLinksInContent(_content, assetPathMap)

    tag.innerHTML = content
  }
}
