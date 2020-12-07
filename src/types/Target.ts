export interface Target {
  name: string
  serverUrl: string
  appLoc: string
  serverType: string
  tgtDeployVars: { contextName: string }
}
