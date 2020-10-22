import dotenv from 'dotenv'
import path from 'path'
import { add } from '../../../src/main'
import {
  getConfiguration,
  getGlobalRcFile
} from '../../../src/utils/config-utils'

describe('sasjs add', () => {
  let stdin;

  beforeAll(async () => {
    process.projectDir = path.join(process.cwd())
    dotenv.config()
    stdin = require('mock-stdin').stdin();
  })

  describe('add', () => {
    it(
      'should lets the user to add a build target to localConfig',
      async () => {
        const randomNumber = Math.floor(Math.random() * Math.floor(1000));

        const serverUrl= process.env.serverUrl
        const tgtName  = `test-viya-${randomNumber}`
        const username = process.env.username
        const password = process.env.password
        const clientId = process.env.client
        const secretId = process.env.secret
        setTimeout(async () => {
          stdin.send(['\r']);
          stdin.send(['\r']);
          stdin.send([`${tgtName}\r`]);
          stdin.send(['\r']);
          stdin.send([`${serverUrl}\r`]);
          stdin.send([`${clientId}\r`]);
          stdin.send([`${secretId}\r`]);

          const authCodeContent = await browserGetAuthorizationCode({ serverUrl, clientId, username, password })

          stdin.send([`${authCodeContent}\r`]);
          stdin.send([`1\r`]);
        }, 1000);
        await expect(add()).resolves.toEqual(true)
        // let globalConfig = await getGlobalRcFile()

        const buildSourceFolder = require('../../../src/constants').buildSourceFolder
        const config = await getConfiguration(
          path.join(buildSourceFolder, 'sasjsconfig.json')
        )

        expect(config).toEqual(expect.anything());
        expect(config.targets).toEqual(expect.anything());

        const target = config.targets.find( t => t.name === tgtName)

        expect(target).toEqual(expect.anything());
        expect(target.tgtBuildVars.client).toEqual(clientId);
        expect(target.tgtDeployVars.secret).toEqual(secretId);
        expect(target.tgtBuildVars.client).toEqual(clientId);
        expect(target.tgtDeployVars.secret).toEqual(secretId);
      },
      60 * 1000
    )
    it(
      'should lets the user to add a build target to globalConfig',
      async () => {
        const randomNumber = Math.floor(Math.random() * Math.floor(1000));

        const serverUrl= process.env.serverUrl
        const tgtName  = `test-viya-${randomNumber}`
        const username = process.env.username
        const password = process.env.password
        const clientId = process.env.client
        const secretId = process.env.secret
        setTimeout(async () => {
          stdin.send(['2\r']);
          stdin.send(['\r']);
          stdin.send([`${tgtName}\r`]);
          stdin.send(['\r']);
          stdin.send([`${serverUrl}\r`]);
          stdin.send([`${clientId}\r`]);
          stdin.send([`${secretId}\r`]);

          const authCodeContent = await browserGetAuthorizationCode({ serverUrl, clientId, username, password })

          stdin.send([`${authCodeContent}\r`]);
          stdin.send([`1\r`]);
        }, 1000);
        await expect(add()).resolves.toEqual(true)
        const config = await getGlobalRcFile()

        expect(config).toEqual(expect.anything());
        expect(config.targets).toEqual(expect.anything());

        const target = config.targets.find( t => t.name === tgtName)

        expect(target).toEqual(expect.anything());
        expect(target.tgtBuildVars.client).toEqual(clientId);
        expect(target.tgtDeployVars.secret).toEqual(secretId);
        expect(target.tgtBuildVars.client).toEqual(clientId);
        expect(target.tgtDeployVars.secret).toEqual(secretId);
      },
      60 * 1000
    )
  })
})
