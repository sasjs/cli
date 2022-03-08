import SASjs, { SASjsConfig } from '@sasjs/adapter/node'

export const createSASjsInstance = (config: Partial<SASjsConfig>): SASjs =>
  new SASjs(config)
