export const updateLinkHref = (
  linkTag: HTMLLinkElement,
  assetPathMap: { source: string; target: string }[]
) => {
  const linkSourcePath = linkTag.getAttribute('href') || ''
  const isUrl =
    linkSourcePath.startsWith('http') || linkSourcePath.startsWith('//')
  if (!isUrl) {
    const assetPath = assetPathMap.find(
      (entry) =>
        entry.source === linkSourcePath ||
        `./${entry.source}` === linkSourcePath
    )

    if (!assetPath?.target) {
      throw new Error(`Unable to find file: ${linkSourcePath}`)
    }

    linkTag.setAttribute('href', assetPath.target)
  }
}
