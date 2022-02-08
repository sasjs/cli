import path from 'path'
import { createFile, readFile, ServerType, Target } from '@sasjs/utils'
import { encode } from 'js-base64'
import { getWebServiceContent } from './getWebServiceContent'

export const updateScriptTag = async (
  tag: HTMLScriptElement,
  webSourcePathFull: string,
  destinationPath: string,
  serverType: ServerType,
  assetPathMap: { source: string; target: string }[]
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
  } else {
    const _content = tag.innerHTML
    const content = modifyLinksInContent(_content, assetPathMap)

    tag.innerHTML = content
  }
}

const modifyLinksInContent = (
  _content: string,
  assetPathMap: { source: string; target: string }[]
) => {
  let content = _content
  assetPathMap.forEach((pathEntry) => {
    content = content.replace(
      new RegExp(pathEntry.source, 'g'),
      pathEntry.target
    )
  })
  return content
}
