import { JSDOM } from 'jsdom'
import { asyncForEach, ServerType } from '@sasjs/utils'
import {
  getFaviconTags,
  getImgTags,
  getStyleTags,
  getScriptTags
} from './getTags'
import { updateScriptTag } from './updateScriptTag'
import { updateLinkTag } from './updateLinkTag'

interface paramsType {
  webSourcePathFull: string
  destinationPath: string
  serverType: ServerType
  assetPathMap: { source: string; target: string }[]
}

export const updateAllTags = async (
  parsedHtml: JSDOM,
  { webSourcePathFull, destinationPath, serverType, assetPathMap }: paramsType
) => {
  const assetsNotFound: Error[] = []

  const scriptTags = getScriptTags(parsedHtml)
  await asyncForEach(scriptTags, async (tag) => {
    await updateScriptTag(
      tag,
      webSourcePathFull,
      destinationPath,
      serverType,
      assetPathMap
    ).catch((e) => assetsNotFound.push(e))
  })

  const styleTags = getStyleTags(parsedHtml)
  const faviconTags = getFaviconTags(parsedHtml)
  const imgTags = getImgTags(parsedHtml)

  const tags = [...styleTags, ...faviconTags, ...imgTags]
  tags.forEach((tag) => {
    try {
      updateLinkTag(tag, assetPathMap)
    } catch (error) {
      assetsNotFound.push(error as Error)
    }
  })

  if (assetsNotFound.length) {
    const notFoundErrors = assetsNotFound
      .map((e) => `- ${e.message}\n`)
      .join('')
    throw new Error(`Error(s) while preparing stream app:\n${notFoundErrors}`)
  }
}
