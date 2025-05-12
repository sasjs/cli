/**
 * @jest-environment jsdom
 */

import { JSDOM } from 'jsdom'
import {
  getSasjsTags,
  getScriptTags,
  getModulePreload,
  getStyleInPageTags,
  getStyleTags,
  getFaviconTags,
  getImgTags,
  getSourceTags,
  getManifestTags
} from '../getTags'

describe('getTags', () => {
  // Helper function to create a JSDOM instance with given HTML
  const createDOM = (html: string) => new JSDOM(`<!DOCTYPE html>${html}`)

  describe('getSasjsTags', () => {
    it('should return all sasjs tags', () => {
      const html = `
        <body>
          <sasjs id="sasjs1"></sasjs>
          <sasjs id="sasjs2"></sasjs>
          <div>Not a sasjs tag</div>
        </body>
      `
      const dom = createDOM(html)
      const result = getSasjsTags(dom)

      expect(result).toHaveLength(2)
      expect(result[0].id).toBe('sasjs1')
      expect(result[1].id).toBe('sasjs2')
    })

    it('should return empty array when no sasjs tags are present', () => {
      const html = '<body><div>No sasjs tags here</div></body>'
      const dom = createDOM(html)
      const result = getSasjsTags(dom)

      expect(result).toHaveLength(0)
    })
  })

  describe('getScriptTags', () => {
    it('should return all script tags', () => {
      const html = `
        <head>
          <script id="script1" src="script1.js"></script>
        </head>
        <body>
          <script id="script2" src="script2.js"></script>
          <div>Not a script tag</div>
        </body>
      `
      const dom = createDOM(html)
      const result = getScriptTags(dom)

      expect(result).toHaveLength(2)
      expect(result[0].id).toBe('script1')
      expect(result[1].id).toBe('script2')
    })

    it('should return empty array when no script tags are present', () => {
      const html = '<body><div>No script tags here</div></body>'
      const dom = createDOM(html)
      const result = getScriptTags(dom)

      expect(result).toHaveLength(0)
    })
  })

  describe('getModulePreload', () => {
    it('should return all link tags with rel="modulepreload"', () => {
      const html = `
        <head>
          <link id="module1" rel="modulepreload" href="module1.js">
          <link id="module2" rel="modulepreload" href="module2.js">
          <link id="stylesheet" rel="stylesheet" href="style.css">
        </head>
      `
      const dom = createDOM(html)
      const result = getModulePreload(dom)

      expect(result).toHaveLength(2)
      expect(result[0].id).toBe('module1')
      expect(result[1].id).toBe('module2')
    })

    it('should return empty array when no modulepreload links are present', () => {
      const html = '<head><link rel="stylesheet" href="style.css"></head>'
      const dom = createDOM(html)
      const result = getModulePreload(dom)

      expect(result).toHaveLength(0)
    })
  })

  describe('getStyleInPageTags', () => {
    it('should return all style tags', () => {
      const html = `
        <head>
          <style id="style1">.class1 { color: red; }</style>
          <style id="style2">.class2 { color: blue; }</style>
        </head>
        <body>
          <div>Not a style tag</div>
        </body>
      `
      const dom = createDOM(html)
      const result = getStyleInPageTags(dom)

      expect(result).toHaveLength(2)
      expect(result[0].id).toBe('style1')
      expect(result[1].id).toBe('style2')
    })

    it('should return empty array when no style tags are present', () => {
      const html = '<body><div>No style tags here</div></body>'
      const dom = createDOM(html)
      const result = getStyleInPageTags(dom)

      expect(result).toHaveLength(0)
    })
  })

  describe('getStyleTags', () => {
    it('should return all link tags with rel="stylesheet"', () => {
      const html = `
        <head>
          <link id="css1" rel="stylesheet" href="style1.css">
          <link id="css2" rel="stylesheet" href="style2.css">
          <link id="icon" rel="icon" href="favicon.ico">
        </head>
      `
      const dom = createDOM(html)
      const result = getStyleTags(dom)

      expect(result).toHaveLength(2)
      expect(result[0].id).toBe('css1')
      expect(result[1].id).toBe('css2')
    })

    it('should return empty array when no stylesheet links are present', () => {
      const html = '<head><link rel="icon" href="favicon.ico"></head>'
      const dom = createDOM(html)
      const result = getStyleTags(dom)

      expect(result).toHaveLength(0)
    })
  })

  describe('getFaviconTags', () => {
    it('should return all link tags with rel containing "icon"', () => {
      const html = `
        <head>
          <link id="icon1" rel="icon" href="favicon.ico">
          <link id="icon2" rel="apple-touch-icon" href="apple-touch-icon.png">
          <link id="css" rel="stylesheet" href="style.css">
        </head>
      `
      const dom = createDOM(html)
      const result = getFaviconTags(dom)

      expect(result).toHaveLength(2)
      expect(result[0].id).toBe('icon1')
      expect(result[1].id).toBe('icon2')
    })

    it('should return empty array when no icon links are present', () => {
      const html = '<head><link rel="stylesheet" href="style.css"></head>'
      const dom = createDOM(html)
      const result = getFaviconTags(dom)

      expect(result).toHaveLength(0)
    })
  })

  describe('getImgTags', () => {
    it('should return all img tags with src attribute', () => {
      const html = `
        <body>
          <img id="img1" src="image1.jpg">
          <img id="img2" src="image2.jpg">
          <img id="img3">
        </body>
      `
      const dom = createDOM(html)
      const result = getImgTags(dom)

      expect(result).toHaveLength(2)
      expect(result[0].id).toBe('img1')
      expect(result[1].id).toBe('img2')
    })

    it('should return empty array when no img tags with src are present', () => {
      const html = '<body><img id="noSrc"></body>'
      const dom = createDOM(html)
      const result = getImgTags(dom)

      expect(result).toHaveLength(0)
    })
  })

  describe('getSourceTags', () => {
    it('should return all source tags with src attribute', () => {
      const html = `
        <body>
          <audio>
            <source id="source1" src="audio.mp3" type="audio/mpeg">
          </audio>
          <video>
            <source id="source2" src="video.mp4" type="video/mp4">
            <source id="source3">
          </video>
        </body>
      `
      const dom = createDOM(html)
      const result = getSourceTags(dom)

      expect(result).toHaveLength(2)
      expect(result[0].id).toBe('source1')
      expect(result[1].id).toBe('source2')
    })

    it('should return empty array when no source tags with src are present', () => {
      const html = '<body><source id="noSrc"></body>'
      const dom = createDOM(html)
      const result = getSourceTags(dom)

      expect(result).toHaveLength(0)
    })
  })

  describe('getManifestTags', () => {
    it('should return all link tags with rel="manifest"', () => {
      const html = `
        <head>
          <link id="manifest1" rel="manifest" href="manifest.json">
          <link id="manifest2" rel="manifest" href="another-manifest.json">
          <link id="css" rel="stylesheet" href="style.css">
        </head>
      `
      const dom = createDOM(html)
      const result = getManifestTags(dom)

      expect(result).toHaveLength(2)
      expect(result[0].id).toBe('manifest1')
      expect(result[1].id).toBe('manifest2')
    })

    it('should return empty array when no manifest links are present', () => {
      const html = '<head><link rel="stylesheet" href="style.css"></head>'
      const dom = createDOM(html)
      const result = getManifestTags(dom)

      expect(result).toHaveLength(0)
    })
  })
})
