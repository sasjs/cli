export const prefixAppLoc = (appLoc = '', path = '') => {
  if (!path) return ''

  if (!/^\//.test(appLoc)) appLoc = '/' + appLoc

  if (Array.isArray(path)) path = path.join(' ')

  return path
    .split(' ')
    .map((p) => (/^\//.test(p) ? p : `${appLoc}/${p}`))
    .join(' ')
}
