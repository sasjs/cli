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
      // the reference is relative to the stylesheet, so its folder within the
      // published app is what the rewrite is computed from
      const withinApp = path
        .relative(destination, file)
        .split(path.sep)
        .join('/')
      const folder = path.posix.dirname(withinApp)

      fs.writeFileSync(
        file,
        relativiseCss(
          fs.readFileSync(file, 'utf8'),
          folder === '.' ? '' : folder
        )
      )
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
 * A candidate URL contains no whitespace, so a `data:` URI's payload - commas
 * and all - is joined back onto its candidate before the list is handled. What
 * is left are the real separators, which are commas with or without the
 * recommended space. Every candidate that starts at the root is rewritten where
 * it starts; a `data:` URI is left byte for byte.
 */
export const relativiseSrcset = (srcset: string): string => {
  const candidates: string[] = []

  for (const part of srcset.split(',')) {
    const previous = candidates[candidates.length - 1]
    const continuesDataUri =
      previous !== undefined &&
      /^\s*\S+$/.test(previous) &&
      previous.trim().startsWith('data:')

    if (continuesDataUri)
      candidates[candidates.length - 1] = `${previous},${part}`
    else candidates.push(part)
  }

  return candidates
    .map((candidate) => {
      const url = candidate.trim()

      return url.startsWith('/') && !url.startsWith('//')
        ? candidate.replace(/^(\s*)\/(?!\/)/, '$1./')
        : candidate
    })
    .join(',')
}

/**
 * Root-absolute references inside CSS, made relative to the stylesheet.
 *
 * A stylesheet resolves `url()` and `@import` against its OWN URL, not the
 * document (CSS 2.1 4.3.4), so the target is computed from the folder holding
 * the stylesheet. An inline `<style>` block or a `style=""` attribute has the
 * document as its base, which is the same computation with an empty folder.
 *
 * A protocol-relative `//host/...` is another site and is left alone, and so is
 * a `data:` URI.
 */
export const relativiseCss = (css: string, folder: string = ''): string =>
  css
    .replace(
      /url\(\s*(['"]?)\/(?!\/)([^)'"]*)\1\s*\)/g,
      (_match, quote: string, reference: string) =>
        `url(${quote}${referenceRelativeTo(reference, folder)}${quote})`
    )
    .replace(
      /@import\s+(['"])\/(?!\/)([^'"]*)\1/g,
      (_match, quote: string, reference: string) =>
        `@import ${quote}${referenceRelativeTo(reference, folder)}${quote}`
    )

/** Where a root-absolute reference lands, relative to the file naming it. */
const referenceRelativeTo = (reference: string, folder: string): string => {
  const from = folder === '' ? '.' : folder
  const to = reference === '' ? '.' : reference
  const relative = path.posix.relative(from, to)
  const withDot = relative.startsWith('.') ? relative : `./${relative}`

  return reference.endsWith('/') ? `${withDot}/` : withDot
}

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
