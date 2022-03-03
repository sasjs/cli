import SASjs, { SASjsConfig } from '@sasjs/adapter/node'

export const createSASjsInstance = (config: Partial<SASjsConfig>): SASjs => {
  console.log('actual called')
  return new SASjs(config)
}
