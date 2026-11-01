export const aliasMap = new Map<string, string[]>([
  ['build', ['b']],
  ['builddeploy', ['bd']],
  ['compile', ['c']],
  ['compilebuild', ['cb']],
  ['compilebuilddeploy', ['cbd']],
  ['db', ['DB', 'build-DB', 'build-db']],
  ['deploy', ['d']],
  ['doc', ['docs']],
  ['help', ['h']],
  ['logcheck', ['lc']],
  ['request', ['rq']],
  ['run', ['r']],
  ['test', ['t']],
  ['version', ['v', '-v', '--version']],
  ['web', ['w']]
])

export const getAllSupportedAliases = () => aliasMap.keys()
