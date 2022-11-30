import { AssetPathMap } from './createAssetServices'

export const modifyLinksInContent = (
  _content: string,
  assetPathMap: AssetPathMap[]
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
