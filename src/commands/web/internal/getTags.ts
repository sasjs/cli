import { JSDOM } from 'jsdom'

export const getScriptTags = (parsedHtml: JSDOM) => {
  return Array.from(parsedHtml.window.document.querySelectorAll('script'))
}

export const getLinkTags = (parsedHtml: JSDOM) => {
  const linkTags = Array.from(
    parsedHtml.window.document.querySelectorAll('link')
  ).filter((s) => s.getAttribute('rel') === 'stylesheet')

  return linkTags
}

export const getFaviconTags = (parsedHtml: JSDOM) => {
  const linkTags = Array.from(
    parsedHtml.window.document.querySelectorAll('link')
  ).filter(
    (s) =>
      s.getAttribute('rel') &&
      s.getAttribute('rel') &&
      s.getAttribute('rel')!.includes('icon')
  )

  return linkTags
}
