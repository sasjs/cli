import path from 'path'
import { createFile, readFile, ServerType, Target } from '@sasjs/utils'
import { encode } from 'js-base64'
import { getWebServiceContent } from './getWebServiceContent'

export const updateScriptTag = async (
  tag: HTMLLinkElement,
  webSourcePathFull: string,
  destinationPath: string,
  serverType: ServerType,
  assetPathMap: { source: string; target: string }[]
) => {
  const scriptPath = tag.getAttribute('src')
  const isUrl =
    scriptPath && (scriptPath.startsWith('http') || scriptPath.startsWith('//'))

  if (scriptPath) {
    if (!isUrl) {
      let content = await readFile(
        path.join(webSourcePathFull, scriptPath)
      ).catch((_) => {
        throw new Error(`Unable to find file: ${scriptPath}`)
      })

      assetPathMap.forEach((pathEntry) => {
        content = content.replace(
          new RegExp(pathEntry.source, 'g'),
          pathEntry.target
        )
      })

      if (serverType === ServerType.SasViya) {
        await createFile(path.join(destinationPath, scriptPath), content)
      } else {
        const serviceContent = await getWebServiceContent(
          encode(content),
          'JS',
          serverType
        )
        await createFile(
          path.join(
            destinationPath,
            `${scriptPath.replace(/\.js$/, '-js')}.sas`
          ),
          serviceContent
        )
      }

      tag.setAttribute(
        'src',
        assetPathMap.find(
          (entry) =>
            entry.source === scriptPath || `./${entry.source}` === scriptPath
        )!.target
      )
    }
  }
}
