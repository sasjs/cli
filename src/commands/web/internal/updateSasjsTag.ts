import { Target } from '@sasjs/utils'
import { JSDOM } from 'jsdom'
import { getSasjsTags } from './getTags'

/**
 * Updates sasjs adapter's config in index.html if present.
 */
export const updateSasjsTag = (tag: Element, target: Target) => {
  tag.setAttribute('appLoc', target.appLoc)
  tag.setAttribute('serverType', target.serverType)
}
