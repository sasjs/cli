import fs from 'fs'
import path from 'path'
import { JSDOM } from 'jsdom'
import { getAbsolutePath, StreamConfig, Target } from '@sasjs/utils'
import { getSasjsTags } from '../../web/internal/getTags'
import { updateSasjsTag } from '../../web/internal/updateSasjsTag'
import { setWebpackPublicPath } from '../../web/internal/setWebpackPublicPath'

/**
 * The folder, inside the build, that holds the frontend published to the
 * SASjs Server app stream.
 *
 * It is an input to the pack rather than a folder of the deployment: the pack
 * carries it as `web/`, and the deploy writes it to `apps/<name>` so it is
 * served at the app's own URL. Keeping it on disk means either real frontend
 * artefact can be inspected - or removed - before `sasjs build` packs it, and
 * `PUBLISH_FOLDER` is therefore reserved: no deployment tree carries it. The
 * mock-site builder names it too, spelled out rather than imported, because that
 * file is transpiled standalone by a test of the CLI's package resolution.
 */
export const PUBLISH_FOLDER = 'publish'

/**
 * The compiled frontend, adjusted to be opened at its app URL.
 *
 * A deployed SASjs app is served from `/app/<id>/`, not from the server root, so
 * the build the frontend produced - whose asset links are absolute, or relative
 * to a root it no longer occupies - cannot be copied unchanged. Two things are
 * changed and nothing else:
 *
 * - **asset references** that start at the root (`/assets/index.js`) become
 *   relative (`./assets/index.js`), and a `<base href>` is pointed at `./`. The
 *   page's own address is the app's folder, so a relative reference resolves
 *   inside the app whatever id it was published under. This covers the HTML
 *   attributes that load something AND CSS - a stylesheet naming a font or an
 *   image is as much a reference as a `<script src>`: `url(...)` and `@import`
 *   in a `.css` file, an inline `<style>` block, or a `style=""` attribute.
 * - **the adapter configuration** in a `<sasjs>` tag names this target's appLoc
 *   and server type, so the app calls the services deployed beside it.
 *
 * A bundler runtime that composes chunk URLs has its public path set to `./` for
 * the same reason: a chunk is fetched from the folder the page came from, not
 * from the server root.
 *
 * The mock site is a different artefact, built from a different source and never
 * copied here - this is the frontend the developer built, and the one a server
 * serves.
 */
export const publishFrontend = async (
  target: Target,
  streamConfig: StreamConfig,
  destination: string
): Promise<string> => {
  const webSourcePath = streamConfig.webSourcePath
  if (!webSourcePath) {
    throw new Error(
      'No built web app. Set streamConfig.webSourcePath on the target (for example ./client/dist), and build the frontend first.'
    )
  }

  const webSourcePathFull = getAbsolutePath(webSourcePath, process.projectDir)
  const indexHtmlPath = path.join(webSourcePathFull, 'index.html')

  if (!fs.existsSync(indexHtmlPath)) {
    throw new Error(
      `No index.html at streamConfig.webSourcePath: '${webSourcePathFull}'. Build the frontend first - the published app is the compiled frontend, not the mock site.`
    )
  }

  fs.rmSync(destination, { recursive: true, force: true })
  fs.cpSync(webSourcePathFull, destination, { recursive: true })

  const publishedIndex = path.join(destination, 'index.html')
  fs.writeFileSync(
    publishedIndex,
    adjustIndexHtml(fs.readFileSync(publishedIndex, 'utf8'), target)
  )

  for (const file of listFiles(destination)) {
    if (/\.(m?js)$/i.test(file)) {
      const content = fs.readFileSync(file, 'utf8')
      fs.writeFileSync(file, setWebpackPublicPath(content, './'))
      continue
    }

    // a stylesheet is a second place an app names its assets: a font or an image
    // written as `url(/assets/...)` would otherwise be fetched from the server
    // root once the app is served under /app/<id>/
    if (/\.css$/i.test(file)) {
      fs.writeFileSync(file, relativiseCss(fs.readFileSync(file, 'utf8')))
    }
  }

  return destination
}

/**
 * The page a browser opens at `/app/<id>/`.
 *
 * Kept as a JSDOM pass rather than a set of regular expressions because the
 * attributes to change are attributes: a URL is only rewritten where it is a
 * URL, so text that happens to look like one is left alone.
 */
const adjustIndexHtml = (content: string, target: Target): string => {
  const dom = new JSDOM(content)
  const { document } = dom.window

  const relativise = (value: string): string =>
    value.startsWith('/') && !value.startsWith('//') ? `.${value}` : value

  // Only references that LOAD something are rewritten. An anchor is navigation,
  // not an asset: its href may name the server's API or an external site, and
  // rewriting it would send the browser to a path inside the app that holds no
  // such thing.
  const references: [string, string][] = [
    ['link[href]', 'href'],
    ['script[src]', 'src'],
    ['img[src]', 'src'],
    ['input[src]', 'src'],
    ['source[src]', 'src'],
    ['video[src]', 'src'],
    ['audio[src]', 'src'],
    ['track[src]', 'src'],
    ['iframe[src]', 'src'],
    ['embed[src]', 'src'],
    ['object[data]', 'data'],
    ['video[poster]', 'poster'],
    ['use[href]', 'href']
  ]

  for (const [selector, attribute] of references) {
    for (const element of Array.from(document.querySelectorAll(selector))) {
      const value = element.getAttribute(attribute)
      if (value === null) continue
      const rewritten = relativise(value)
      if (rewritten !== value) element.setAttribute(attribute, rewritten)
    }
  }

  for (const element of Array.from(document.querySelectorAll('[srcset]'))) {
    element.setAttribute(
      'srcset',
      relativiseSrcset(element.getAttribute('srcset') as string)
    )
  }

  for (const style of Array.from(document.querySelectorAll('style')))
    style.textContent = relativiseCss(style.textContent ?? '')

  for (const element of Array.from(document.querySelectorAll('[style]')))
    element.setAttribute(
      'style',
      relativiseCss(element.getAttribute('style') as string)
    )

  const base = document.querySelector('base')
  if (base !== null) base.setAttribute('href', './')

  const sasjsTags = getSasjsTags(dom)
  if (sasjsTags.length) updateSasjsTag(sasjsTags[0], target)

  return dom.serialize()
}

/**
 * Root-absolute candidates in a `srcset`, made relative.
 *
 * A `srcset` is a comma-separated list, and a data URI carries its own commas,
 * so the attribute is not split: each candidate that starts at the root is
 * rewritten where it starts - after the beginning or a separator. A data URI is
 * left exactly as it is, and may sit beside an absolute candidate without
 * stopping that one from being rewritten.
 */
export const relativiseSrcset = (srcset: string): string => {
  const rewritten = srcset.replace(/(^|,)(\s+)\/(?!\/)/g, '$1$2./')

  // the first candidate has no separator in front of it
  return rewritten.startsWith('/') && !rewritten.startsWith('//')
    ? `.${rewritten}`
    : rewritten
}

/**
 * Root-absolute references inside CSS, made relative to the stylesheet's own
 * folder.
 *
 * The same rule as an attribute, applied to the two forms CSS writes a URL in:
 * `url(...)` (quoted or not) and `@import "..."/'...'`. A protocol-relative
 * `//host/...` is another site and is left alone, and so is a `data:` URI.
 */
export const relativiseCss = (css: string): string =>
  css
    .replace(/url\(\s*(['"]?)\/(?!\/)/g, 'url($1./')
    .replace(/@import\s+(['"])\/(?!\/)/g, '@import $1./')

/** Every file under a folder, recursively, as absolute paths. */
const listFiles = (folder: string): string[] => {
  const files: string[] = []
  for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
    const full = path.join(folder, entry.name)
    if (entry.isDirectory()) files.push(...listFiles(full))
    else files.push(full)
  }
  return files
}
