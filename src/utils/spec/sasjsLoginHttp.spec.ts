import http from 'http'
import { AddressInfo } from 'net'
import { ServerType, Target } from '@sasjs/utils'
import { getTokensWithSasjsLogin } from '../auth'

describe('SASJS login HTTP refusals', () => {
  it('accepts successful SASJS login, authorization and token responses', async () => {
    const paths: string[] = []
    const server = http.createServer((req, res) => {
      paths.push(req.url || '')
      res.setHeader('Content-Type', 'application/json')
      if (req.url === '/') return res.end('{}')
      if (req.url === '/SASLogon/login') {
        return res.end(JSON.stringify({ loggedIn: true }))
      }
      if (req.url === '/SASLogon/authorize') {
        return res.end(JSON.stringify({ code: 'test-code' }))
      }
      return res.end(
        JSON.stringify({
          accessToken: 'test-access',
          refreshToken: 'test-refresh'
        })
      )
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    try {
      const port = (server.address() as AddressInfo).port
      const target = new Target({
        name: 'sasjs-test',
        serverType: ServerType.Sasjs,
        serverUrl: `http://127.0.0.1:${port}`,
        appLoc: '/Public/app'
      })
      await expect(
        getTokensWithSasjsLogin(target, 'test-user', 'test-pass', 'test-client')
      ).resolves.toMatchObject({
        access_token: 'test-access',
        refresh_token: 'test-refresh',
        client: 'test-client'
      })
      expect(paths).toEqual([
        '/',
        '/SASLogon/login',
        '/SASLogon/authorize',
        '/SASjsApi/auth/token'
      ])
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve()))
      )
    }
  })

  it('does not choose a client from a refused client listing', async () => {
    const paths: string[] = []
    const server = http.createServer((req, res) => {
      paths.push(req.url || '')
      res.setHeader('Content-Type', 'application/json')
      if (req.url === '/') return res.end('{}')
      if (req.url === '/SASLogon/login') {
        return res.end(JSON.stringify({ loggedIn: true }))
      }
      if (req.url === '/SASjsApi/client') {
        res.statusCode = 403
        return res.end(JSON.stringify([{ clientId: 'not-a-client' }]))
      }
      if (req.url === '/SASLogon/authorize') {
        return res.end(JSON.stringify({ code: 'test-code' }))
      }
      return res.end(JSON.stringify({ accessToken: 'not-a-token' }))
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    try {
      const port = (server.address() as AddressInfo).port
      const target = new Target({
        name: 'sasjs-test',
        serverType: ServerType.Sasjs,
        serverUrl: `http://127.0.0.1:${port}`,
        appLoc: '/Public/app'
      })
      await expect(
        getTokensWithSasjsLogin(target, 'test-user', 'test-pass')
      ).rejects.toThrow(/No client id is available/)
      expect(paths).toEqual(['/', '/SASLogon/login', '/SASjsApi/client'])
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve()))
      )
    }
  })

  it('refuses a non-success token response even if it contains an access token', async () => {
    const server = http.createServer((req, res) => {
      res.setHeader('Content-Type', 'application/json')
      if (req.url === '/') return res.end('{}')
      if (req.url === '/SASLogon/login') {
        return res.end(JSON.stringify({ loggedIn: true }))
      }
      if (req.url === '/SASLogon/authorize') {
        return res.end(JSON.stringify({ code: 'test-code' }))
      }
      res.statusCode = 401
      return res.end(JSON.stringify({ accessToken: 'not-a-token' }))
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    try {
      const port = (server.address() as AddressInfo).port
      const target = new Target({
        name: 'sasjs-test',
        serverType: ServerType.Sasjs,
        serverUrl: `http://127.0.0.1:${port}`,
        appLoc: '/Public/app'
      })
      await expect(
        getTokensWithSasjsLogin(target, 'test-user', 'test-pass', 'test-client')
      ).rejects.toThrow(/token endpoint.*HTTP 401/)
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve()))
      )
    }
  })

  it('refuses a non-success authorization response even if it contains a code', async () => {
    const paths: string[] = []
    const server = http.createServer((req, res) => {
      paths.push(req.url || '')
      res.setHeader('Content-Type', 'application/json')
      if (req.url === '/') return res.end('{}')
      if (req.url === '/SASLogon/login') {
        return res.end(JSON.stringify({ loggedIn: true }))
      }
      if (req.url === '/SASLogon/authorize') {
        res.statusCode = 403
        return res.end(JSON.stringify({ code: 'not-an-authorization' }))
      }
      return res.end(JSON.stringify({ accessToken: 'not-a-token' }))
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    try {
      const port = (server.address() as AddressInfo).port
      const target = new Target({
        name: 'sasjs-test',
        serverType: ServerType.Sasjs,
        serverUrl: `http://127.0.0.1:${port}`,
        appLoc: '/Public/app'
      })
      await expect(
        getTokensWithSasjsLogin(target, 'test-user', 'test-pass', 'test-client')
      ).rejects.toThrow(/Authorization failed.*HTTP 403/)
      expect(paths).toEqual(['/', '/SASLogon/login', '/SASLogon/authorize'])
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve()))
      )
    }
  })
})
