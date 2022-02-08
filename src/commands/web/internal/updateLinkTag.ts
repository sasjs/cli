export const updateLinkTag = (
  linkTag: HTMLLinkElement | HTMLSourceElement | HTMLImageElement,
  assetPathMap: { source: string; target: string }[],
  tagType: 'link' | 'src' = 'link'
) => {
  const linkSourcePath =
    tagType === 'link'
      ? linkTag.getAttribute('href')
      : linkTag.getAttribute('src')

  if (!linkSourcePath) return

  const isUrl =
    linkSourcePath.startsWith('http') || linkSourcePath.startsWith('//')
  if (isUrl) return

  const assetPath = assetPathMap.find(
    (entry) =>
      entry.source === linkSourcePath || `./${entry.source}` === linkSourcePath
  )

  if (!assetPath?.target) {
    throw new Error(`Unable to find file: ${linkSourcePath}`)
  }

  tagType === 'link'
    ? linkTag.setAttribute('href', assetPath.target)
    : linkTag.setAttribute('src', assetPath.target)
}
