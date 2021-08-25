import { aliasMap } from './commandAliases'

export const unalias = (name: string) => {
  const entry = [...aliasMap.entries()].find(
    ([k, v]) => k === name || v.includes(name)
  )
  if (!entry) {
    return name
  }
  return entry[0]
}
