declare namespace NodeJS {
  interface Process {
    projectDir: string
  }

  interface Global {
    browserGetAuthorizationCode: (input: GetAuthCodeInput) => Promise<string>
  }
}

interface GetAuthCodeInput {
  serverUrl: string
  clientId: string
  username: string
  password: string
}
