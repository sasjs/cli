import dotenv from 'dotenv'
import path from 'path'
import { add } from '../../../src/main'

const puppeteer = require('puppeteer');

describe('sasjs add', () => {
  let stdin;

  beforeEach(() => {
    stdin = require('mock-stdin').stdin();
  });
  beforeAll(async () => {
    process.projectDir = path.join(process.cwd())
    dotenv.config()
  })

  describe('add', () => {
    it(
      'should lets the user to add a build target',
      async () => {
        const serverUrl= process.env.serverUrl
        const username = process.env.username
        const password = process.env.password
        const clientId = process.env.client
        const secretId = process.env.secret
        setTimeout(() => {
          stdin.send(['\r']);
          stdin.send(['\r']);
          stdin.send(['\r']);
          stdin.send(['\r']);
          stdin.send(['\r']);
          stdin.send([`${serverUrl}\r`]);
          stdin.send([`${clientId}\r`]);
          stdin.send([`${secretId}\r`]);
          setTimeout(async () => {
            const browser = await puppeteer.launch({ headless: false });
            const page = await browser.newPage();
            await page.goto(`${serverUrl}/SASLogon/oauth/authorize?client_id=${clientId}&response_type=code`);

            const inputUsername = await page.waitForSelector('input[name="username"]')
            await inputUsername.click()
            await page.keyboard.type(username)

            const inputPassword = await page.waitForSelector('input[name="password"]')
            await inputPassword.click()
            await page.keyboard.type(password)

            const submitButton = await page.waitForSelector('button[type="submit"]')
            await submitButton.click()

            const authHeading = await page.waitForSelector('div.infobox h3')
            const authHeadingContent = await page.evaluate(heading => heading.innerHTML, authHeading)
            expect(authHeadingContent).toBe('Authorization Code')

            const authMessage = await page.waitForSelector('div.infobox p')
            const authMessageContent = await page.evaluate(message => message.innerHTML, authMessage)
            expect(authMessageContent).toBe('Copy the following code, and paste it in your application:')

            const authCode = await page.waitForSelector('div.infobox h4')
            const authCodeContent = await page.evaluate(message => message.innerHTML, authCode)

            await browser.close();

            stdin.send([`${authCodeContent}\r`]);
            stdin.send([`1\r`]);
          }, 1000);
        }, 1000);
        await expect(add()).resolves.toEqual(true)
      },
      60 * 1000
    )
  })
})
