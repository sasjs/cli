declare namespace NodeJS {
  export interface Process {
    csvFileAbleToSave: boolean
    projectDir: string
    currentDir: string
    logger: import('@sasjs/utils/logger').Logger
  }
}
