import SASjs from '@sasjs/adapter/node'
import chalk from 'chalk'
import ora from 'ora'

export async function createContext() {
  const startTime = new Date().getTime()

  const clientId = 'client3F8DDCB4803BB969'
  const clientSecret = 'secret3FE5BF6F4BEB7EDF'
  if (!clientId) {
    throw new Error(
      'A client ID is required for SAS Viya deployments.\n Please ensure that `client` is present in your build target configuration or in your .env file, and try again.\n'
    )
  }
  if (!clientSecret) {
    throw new Error(
      'A client secret is required for SAS Viya deployments.\n Please ensure that `secret` is present in your build target configuration or in your .env file, and try again.\n'
    )
  }

  const sasjs = new SASjs({
    serverUrl: 'https://sas.analytium.co.uk',
    appLoc: '/Public/app',
    serverType: 'SASVIYA'
  })
  const accessToken =
    'eyJhbGciOiJSUzI1NiIsImprdSI6Imh0dHBzOi8vbG9jYWxob3N0L1NBU0xvZ29uL3Rva2VuX2tleXMiLCJraWQiOiJsZWdhY3ktdG9rZW4ta2V5IiwidHlwIjoiSldUIn0.eyJqdGkiOiJmZTNiM2UzYzhlMGU0ZTc2YWU2ODhhYmI4MDNmM2Y0OCIsImV4dF9pZCI6ImNuPXJlaGFrbSxvdT1BQUREQyBVc2VycyxkYz1hbmFseXRpdW0sZGM9Y28sZGM9dWsiLCJyZW1vdGVfaXAiOiI4MS45Ny4xNDIuMjUzIiwic3ViIjoiZTc0MTQ1MjktNGQwNi00N2Q0LTkxOTQtYjE4YzgxNjZjOTJiIiwic2NvcGUiOlsiU0FTQWRtaW5pc3RyYXRvcnMiLCJzZWMtc2FzOS1wcmQtaW50LXNhc3BsYXRmb3JtLWFsbHNhc3VzZXJzIiwib3BlbmlkIiwiQWxsIFVzZXJzIiwiQW5hbHl0aXVtIEdyb3VwIiwic2VjLXNhc3ZpeWEtcHJkLWludC1zYXNwbGF0Zm9ybS1hbGxzYXN1c2VycyJdLCJjbGllbnRfaWQiOiJjbGllbnQzRkU2QjM0MDI0RUQ2NjgwIiwiY2lkIjoiY2xpZW50M0ZFNkIzNDAyNEVENjY4MCIsImF6cCI6ImNsaWVudDNGRTZCMzQwMjRFRDY2ODAiLCJncmFudF90eXBlIjoiYXV0aG9yaXphdGlvbl9jb2RlIiwidXNlcl9pZCI6ImU3NDE0NTI5LTRkMDYtNDdkNC05MTk0LWIxOGM4MTY2YzkyYiIsIm9yaWdpbiI6ImxkYXAiLCJ1c2VyX25hbWUiOiJyZWhha20iLCJlbWFpbCI6InJlaGFrbUB1c2VyLmZyb20ubGRhcC5jZiIsImF1dGhfdGltZSI6MTU5OTgwOTY0NSwicmV2X3NpZyI6ImU3NTMxMWIwIiwiaWF0IjoxNTk5ODA5NjQ1LCJleHAiOjE1OTk4NDU2NDUsImlzcyI6Imh0dHA6Ly9sb2NhbGhvc3QvU0FTTG9nb24vb2F1dGgvdG9rZW4iLCJ6aWQiOiJ1YWEiLCJhdWQiOlsib3BlbmlkIiwiY2xpZW50M0ZFNkIzNDAyNEVENjY4MCJdfQ.D6Qz4izr5_rIAZN9ZkGKuXou79L1xntfxlKZG2YY8I0JY15tdeCWPCNi24QMZnk7G63AEosli7AYWjLtCep0h-Hhn7sHZ5LhsvWoJo8pbU8kI3bWrHK3SLYMwJ_8t-cO5RuiLFx4L2MXXkcNJpWpuUioElW6fhkwjb1y-CxS8cCKoicDoy7cQEBqbRPVk4tCv7sk5C6xSjmSNzyAMFK-Lwye_Lbik7dpXmFKs-3gaqH2dFFX0YL-4cPT64EZbjH7Z5Dng4flWtZSrFlqZlj9N3FDOE4KDoJgl7iGUdmcm-qCXB6UyAe9H2LOZU36fWVCLsz2JT_BmzVLMGh3SOUM8Q'

  const spinner = ora(
    `Creating context on ${chalk.greenBright(
      'https://sas.analytium.co.uk'
    )}...\n`
  )
  spinner.start()
  // const context = await sasjs
  //   .createContext(
  //     'Krishna Test 123',
  //     'SAS Job Execution launcher context',
  //     'cas',
  //     ['%put hello;'],
  //     null,
  //     accessToken
  //   )
  //   .catch((e) => console.log(JSON.stringify(e)))
  // console.log(chalk.greenBright(JSON.stringify(context)))
  // 1b1170cb-0880-44f5-a1ad-c27df738b6ff
  const res = await sasjs
    .editContext(
      'Krishna Test 123',
      {
        attributes: { foo: 'bar' },
        environment: {
          autoExecLines: ['%put new;', '%put line;']
        }
      },
      accessToken
    )
    .catch((e) => console.log(JSON.stringify(e)))
  console.log('res', res)

  // const res = await sasjs
  //   .deleteContext('Krishna Test 123', accessToken)
  //   .catch((e) => console.log(JSON.stringify(e)))
  // console.log('res', res)
  spinner.stop()
}
