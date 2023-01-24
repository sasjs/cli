import { JSDOM } from 'jsdom'

export const getSasjsTags = (parsedHtml: JSDOM) =>
  Array.from(parsedHtml.window.document.getElementsByTagName('sasjs'))

export const getScriptTags = (parsedHtml: JSDOM) =>
  Array.from(parsedHtml.window.document.getElementsByTagName('script'))

export const getStyleInPageTags = (parsedHtml: JSDOM) =>
  Array.from(parsedHtml.window.document.getElementsByTagName('style'))

export const getStyleTags = (parsedHtml: JSDOM) =>
  Array.from(parsedHtml.window.document.getElementsByTagName('link')).filter(
    (s) => s.getAttribute('rel') === 'stylesheet'
  )

export const getFaviconTags = (parsedHtml: JSDOM) =>
  Array.from(parsedHtml.window.document.getElementsByTagName('link')).filter(
    (s) => s.getAttribute('rel')?.includes('icon')
  )

export const getImgTags = (parsedHtml: JSDOM) =>
  Array.from(parsedHtml.window.document.getElementsByTagName('img')).filter(
    (s) => s.getAttribute('src')
  )

export const getSourceTags = (parsedHtml: JSDOM) =>
  Array.from(parsedHtml.window.document.getElementsByTagName('source')).filter(
    (s) => s.getAttribute('src')
  )
