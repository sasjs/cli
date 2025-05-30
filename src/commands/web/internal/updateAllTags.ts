import { JSDOM } from 'jsdom'
import { asyncForEach, ServerType, Target } from '@sasjs/utils'
import {
  getFaviconTags,
  getImgTags,
  getStyleTags,
  getScriptTags,
  getSourceTags,
  getStyleInPageTags,
  getSasjsTags,
  getManifestTags,
  getModulePreload
} from './getTags'
import { updateScriptTag } from './updateScriptTag'
import { updateLinkTag } from './updateLinkTag'
import { updateStyleTag } from './updateStyleTag'
import { AssetPathMap } from './createAssetServices'
import { updateSasjsTag } from './updateSasjsTag'

interface paramsType {
  webSourcePathFull: string
  destinationPath: string
  serverType: ServerType
  assetPathMap: AssetPathMap[]
}

/**
 * Updates HTML Tags with correct link.
 * Also updates contents to update included asset references
 * @param {JSDOM} parsedHtml- DOMWindow for index.html
 */
export const updateAllTags = async (
  parsedHtml: JSDOM,
  target: Target,
  { webSourcePathFull, destinationPath, serverType, assetPathMap }: paramsType
) => {
  const assetsNotFound: Error[] = []

  const sasjsTags = getSasjsTags(parsedHtml)
  if (sasjsTags.length) {
    updateSasjsTag(sasjsTags[0], target)
  }

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

  const modulePreloadTags = getModulePreload(parsedHtml)
  modulePreloadTags.forEach((tag) => {
    try {
      updateLinkTag(tag, assetPathMap)
    } catch (error) {
      assetsNotFound.push(error as Error)
    }
  })

  const styleExternalTags = getStyleTags(parsedHtml)
  const styleInPageTags = getStyleInPageTags(parsedHtml)
  const styleTags = [...styleExternalTags, ...styleInPageTags]
  await asyncForEach(
    styleTags,
    async (tag: HTMLStyleElement | HTMLStyleElement) => {
      await updateStyleTag(
        tag,
        webSourcePathFull,
        destinationPath,
        serverType,
        assetPathMap
      ).catch((e) => assetsNotFound.push(e))
    }
  )

  const faviconTags = getFaviconTags(parsedHtml)
  faviconTags.forEach((tag) => {
    try {
      updateLinkTag(tag, assetPathMap)
    } catch (error) {
      assetsNotFound.push(error as Error)
    }
  })

  const manifestTags = getManifestTags(parsedHtml)
  manifestTags.forEach((tag) => {
    try {
      updateLinkTag(tag, assetPathMap)
    } catch (error) {
      assetsNotFound.push(error as Error)
    }
  })

  const imgTags = getImgTags(parsedHtml)
  const sourceTags = getSourceTags(parsedHtml)
  const srcTags = [...imgTags, ...sourceTags]
  srcTags.forEach((tag) => {
    try {
      updateLinkTag(tag, assetPathMap, 'src')
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
