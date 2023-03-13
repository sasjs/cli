declare namespace NodeJS {
  export interface Process {
    csvFileAbleToSave: boolean
    projectDir: string
    currentDir: string
    logger: import('@sasjs/utils/logger').Logger
    sasjsConstants: import('../../constants').Constants
    sasjsConfig: import('@sasjs/utils/types/configuration').Configuration
  }
}
