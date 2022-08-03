import path from 'path'
import { AssetPathMap } from './createAssetServices'

export const modifyLinksInContent = (
  _content: string,
  assetPathMap: AssetPathMap[]
) => {
  let content = _content
  assetPathMap.forEach((pathEntry) => {
    const { source, target } = pathEntry

    const found = new RegExp(pathEntry.source, 'g').test(content)
    if (found) {
      content = content.replace(
        new RegExp(pathEntry.source, 'g'),
        pathEntry.target
      )
    } else {
      const sourceWithoutExt = source.replace(
        new RegExp(path.extname(source) + '$'),
        '.'
      )
      const targetWithoutExt = target.replace(
        new RegExp(path.extname(target) + '$'),
        '.'
      )

      content = content.replace(
        new RegExp(sourceWithoutExt, 'g'),
        targetWithoutExt
      )
    }
  })
  return content
}
