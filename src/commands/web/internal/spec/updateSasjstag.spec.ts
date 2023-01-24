/**
 * @jest-environment jsdom
 */

import { ServerType, Target } from '@sasjs/utils'
import { updateSasjsTag } from '../updateSasjsTag'

describe('updateSasjsTag', () => {
  it(`should update links in js script`, async () => {
    const target = {
      serverType: ServerType.Sasjs,
      appLoc: '/public/app/test'
    } as any as Target

    const tag = document.createElement('sasjs')

    tag.setAttribute('appLoc', 'need/to/update')
    tag.setAttribute('serverType', 'sas')

    updateSasjsTag(tag, target)

    expect(tag.getAttribute('appLoc')).toEqual('/public/app/test')
    expect(tag.getAttribute('serverType')).toEqual(ServerType.Sasjs)
  })
})
