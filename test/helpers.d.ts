interface GetAuthCodeInput {
  serverUrl: string
  clientId: string
  username: string
  password: string
}

interface VerifyBuildStepInput {
  parentFolderName: string
  step: string
}

declare function browserGetAuthorizationCode(
  input: GetAuthCodeInput
): Promise<string>

declare function verifyStep(input: VerifyBuildStepInput): Promise<any>
