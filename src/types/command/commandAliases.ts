export const aliasMap = new Map<string, string[]>([
  ['add', ['auth']],
  ['build', ['b']],
  ['compile', ['c']],
  ['compilebuild', ['cb']],
  ['compilebuilddeploy', ['cbd']],
  ['db', ['DB', 'build-DB', 'build-db']],
  ['deploy', ['d']],
  ['doc', ['docs']],
  ['help', ['h']],
  ['request', ['rq']],
  ['run', ['r']],
  ['version', ['v']],
  ['web', ['w']]
])

export const getAllSupportedAliases = () => aliasMap.keys()
