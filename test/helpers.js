const puppeteer = require('puppeteer');

global.browserGetAuthorizationCode = async ({ serverUrl, clientId, username, password }) => {
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

  let authHeading = await page.waitForSelector('div.infobox h3')
  let authHeadingContent = await page.evaluate(heading => heading.innerHTML, authHeading)
  if (authHeadingContent !== 'Authorization Code'){
    const openidCheckbox = await page.waitForSelector('input[type="checkbox"][name="scope.0"]')
    await openidCheckbox.click()
    const authorizeButton = await page.waitForSelector('button[name="user_oauth_approval"]')
    await authorizeButton.click()

    authHeading = await page.waitForSelector('div.infobox h3')
    authHeadingContent = await page.evaluate(heading => heading.innerHTML, authHeading)
  }
  expect(authHeadingContent).toBe('Authorization Code')

  const authMessage = await page.waitForSelector('div.infobox p')
  const authMessageContent = await page.evaluate(message => message.innerHTML, authMessage)
  expect(authMessageContent).toBe('Copy the following code, and paste it in your application:')

  const authCode = await page.waitForSelector('div.infobox h4')
  const authCodeContent = await page.evaluate(message => message.innerHTML, authCode)

  const signOutButton = await page.waitForSelector('div.infobox button[type="button"]')
  await signOutButton.click()
  setTimeout(async () => {
    await browser.close();
  }, 1000);
  return authCodeContent
}