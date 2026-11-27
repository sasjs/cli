import { DeployProgress } from '@sasjs/adapter'
import { deployProgressLine } from '../deployProgress'

const progress = (overrides: Partial<DeployProgress>): DeployProgress => ({
  type: 'service',
  name: 'getdata',
  parentFolder: '/Public/app/services',
  index: 12,
  total: 88,
  ...overrides
})

describe('deployProgressLine', () => {
  it('names the member, its folder and its position for a service', () => {
    expect(deployProgressLine(progress({}))).toEqual(
      'Creating service 12/88: getdata in /Public/app/services'
    )
  })

  it('says folder and file for the other two member types', () => {
    // parentFolder is where the member is written, so a folder reports the
    // folder that holds it, not its own path
    expect(
      deployProgressLine(
        progress({ type: 'folder', name: 'web', index: 2, total: 88 })
      )
    ).toEqual('Creating folder 2/88: web in /Public/app/services')
    expect(
      deployProgressLine(
        progress({
          type: 'file',
          name: 'main.js',
          parentFolder: '/Public/app/services/web',
          index: 3,
          total: 88
        })
      )
    ).toEqual('Creating file 3/88: main.js in /Public/app/services/web')
  })
})
