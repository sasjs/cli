import { AuthConfig } from '@sasjs/utils/types'

export const mockAuthConfig: AuthConfig = {
  client: 'cl13nt',
  secret: '53cr3t',
  access_token: 'acc355',
  refresh_token: 'r3fr35h'
}

export const mockContext = {
  name: 'testContext',
  launchContext: {
    contextName: 'test launcher context'
  },
  launchType: 'service'
}
