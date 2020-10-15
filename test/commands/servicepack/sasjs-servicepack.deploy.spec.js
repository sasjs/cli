import { saveGlobalRcFile } from '../../../src/utils/config-utils'
import dotenv from 'dotenv'
import path from 'path'
import { processServicepack } from '../../../src/sasjs-servicepack/index'

describe('sasjs servicepack', () => {
  beforeAll(() => {
    saveGlobalRcFile(
      JSON.stringify({
        targets: [
          {
            name: 'cli-tests',
            serverType: 'SASVIYA',
            serverUrl: 'https://sas.analytium.co.uk',
            appLoc: '/Public/app/cli-tests'
          }
        ]
      })
    )

    process.projectDir = path.join(process.cwd())

    dotenv.config()

    process.env.ACCESS_TOKEN =
      'eyJhbGciOiJSUzI1NiIsImprdSI6Imh0dHBzOi8vbG9jYWxob3N0L1NBU0xvZ29uL3Rva2VuX2tleXMiLCJraWQiOiJsZWdhY3ktdG9rZW4ta2V5IiwidHlwIjoiSldUIn0.eyJqdGkiOiIzZjZkYTcyNmE2ODQ0OWEzYjZiNTBkM2YxZWQwZGNlMyIsImV4dF9pZCI6ImNuPVl1cnkgU2hrb2RhLG91PUFBRERDIFVzZXJzLGRjPWFuYWx5dGl1bSxkYz1jbyxkYz11ayIsInJlbW90ZV9pcCI6IjM3LjIxNC4yNS44MiIsInN1YiI6ImRiZDg2ZDllLWIwNzUtNDg1MS1hZGIzLTY0MzA4Mjg5MDFlOCIsInNjb3BlIjpbIlNBU0FkbWluaXN0cmF0b3JzIiwib3BlbmlkIl0sImNsaWVudF9pZCI6ImNsaWVudDNGQjA2MjE2MEUyMEM0MkMiLCJjaWQiOiJjbGllbnQzRkIwNjIxNjBFMjBDNDJDIiwiYXpwIjoiY2xpZW50M0ZCMDYyMTYwRTIwQzQyQyIsImdyYW50X3R5cGUiOiJhdXRob3JpemF0aW9uX2NvZGUiLCJ1c2VyX2lkIjoiZGJkODZkOWUtYjA3NS00ODUxLWFkYjMtNjQzMDgyODkwMWU4Iiwib3JpZ2luIjoibGRhcCIsInVzZXJfbmFtZSI6Inl1cnNoayIsImVtYWlsIjoieXVyeS5zaGtvZGFAYW5hbHl0aXVtLmNvLnVrIiwiYXV0aF90aW1lIjoxNjAyMTUwNDQzLCJyZXZfc2lnIjoiMzA2MzdhZDciLCJpYXQiOjE2MDIxNTA0NDMsImV4cCI6MzE3ODk1MDQ0MywiaXNzIjoiaHR0cDovL2xvY2FsaG9zdC9TQVNMb2dvbi9vYXV0aC90b2tlbiIsInppZCI6InVhYSIsImF1ZCI6WyJvcGVuaWQiLCJjbGllbnQzRkIwNjIxNjBFMjBDNDJDIl19.Bte7cUpseO41iHvFDuDeYlFPCw4sK6BpUZvJgChuR2RZX-zFCIVDwCuByQ_FPjkycX571DAA-avX06F0-_5uy8F01qCdyBW2OZS8JRtqNRk5G_itcLwWZCKIUWOxdbTq3kn_2C0WIGxumdVSx87rxjjs_0oo2p_yHHtpAaHLURUlMRrmF61t-j5CYJY47C8IoHc1QlwxeyTbPXAcYUE3cAhqMujL2Qz1tFygIbllZudnm3tArFkKzOyR6wCOQ6VfwOmFCn-9qLnjgx--W5aluYByvBvb7xNKoKiqPT_5LC7opvEXDS3tN9W2N-cbJdVQkNY-ETD6r_6jbiNf4CkE1A'
  })

  describe('processServicepack', () => {
    it(
      'should deploy servicepack',
      async () => {
        const command = [
          'servicepack',
          'deploy',
          '-s',
          'test/commands/servicepack/testServicepack.json',
          '-f'
        ]

        await expect(processServicepack(command)).resolves.toEqual(true)
      },
      60 * 1000
    )

    it(
      'should fail because servicepack already been deployed',
      async () => {
        const command = [
          'servicepack',
          'deploy',
          '-s',
          'test/commands/servicepack/testServicepack.json'
        ]

        await expect(processServicepack(command)).resolves.toEqual(false)
      },
      60 * 1000
    )
  })
})
