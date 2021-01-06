declare namespace NodeJS {
  export interface Process {
    projectDir: string
    logger: import('@sasjs/utils/logger').Logger
  }
}
