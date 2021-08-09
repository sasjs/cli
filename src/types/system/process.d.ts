declare namespace NodeJS {
  export interface Process {
    projectDir: string
    currentDir: string
    logger: import('@sasjs/utils/logger').Logger
    sasjsConstants: import('../../constants').Constants
  }
}
