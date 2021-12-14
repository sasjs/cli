/**
 * @jest-environment jsdom
 */

import { updateLinkTag } from '../updateLinkTag'

describe('updateLinkTag', () => {
  it(`should update href of link tag`, () => {
    const linkTag: HTMLLinkElement = document.createElement('link')
    linkTag.setAttribute('href', './style.css')

    const assetPathMap = []
    const sasProgramPath =
      '/SASJobExecution?_FILE=appLoc/services/streamWebFolder/style.css'

    assetPathMap.push({
      source: 'style.css',
      target: sasProgramPath
    })

    updateLinkTag(linkTag, assetPathMap)
    expect(linkTag.getAttribute('href')).toEqual(sasProgramPath)
  })

  it(`should update src of image tag`, () => {
    const imgTag: HTMLImageElement = document.createElement('img')
    imgTag.setAttribute('src', './image.jpeg')

    const assetPathMap = []
    const sasProgramPath =
      '/SASJobExecution?_FILE=appLoc/services/streamWebFolder/image.jpeg'

    assetPathMap.push({
      source: 'image.jpeg',
      target: sasProgramPath
    })

    updateLinkTag(imgTag, assetPathMap)
    expect(imgTag.getAttribute('src')).toEqual(sasProgramPath)
  })
})
