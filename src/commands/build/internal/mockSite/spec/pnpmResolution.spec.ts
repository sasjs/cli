import fs from 'fs'
import os from 'os'
import path from 'path'
import { execFileSync } from 'child_process'
import ts from 'typescript'

test('builds the worker bundle when CLI dependencies are pnpm-style siblings', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sasjs-pnpm-layout-'))
  try {
    const cli = path.join(root, 'cli', 'node_modules', '@sasjs', 'cli')
    const modules = path.join(root, 'cli', 'node_modules')
    const apiModules = path.join(root, 'api', 'node_modules')
    const api = path.join(apiModules, '@sasjs', 'api')
    fs.mkdirSync(cli, { recursive: true })
    fs.mkdirSync(path.dirname(api), { recursive: true })
    const originalModules = path.resolve(
      __dirname,
      '../../../../../../node_modules'
    )
    for (const entry of fs.readdirSync(originalModules)) {
      if (entry === '@sasjs' || entry.startsWith('.')) continue
      fs.symlinkSync(
        path.join(originalModules, entry),
        path.join(modules, entry),
        'junction'
      )
      fs.symlinkSync(
        path.join(originalModules, entry),
        path.join(apiModules, entry),
        'junction'
      )
    }
    for (const entry of fs.readdirSync(path.join(originalModules, '@sasjs'))) {
      if (entry !== 'api') {
        fs.symlinkSync(
          path.join(originalModules, '@sasjs', entry),
          path.join(modules, '@sasjs', entry),
          'junction'
        )
        if (entry !== 'sas-language') {
          fs.symlinkSync(
            path.join(originalModules, '@sasjs', entry),
            path.join(apiModules, '@sasjs', entry),
            'junction'
          )
        }
      }
    }
    const originalApi = path.resolve(
      path.dirname(require.resolve('@sasjs/api')),
      '../..'
    )
    fs.cpSync(originalApi, api, { recursive: true })
    fs.symlinkSync(api, path.join(modules, '@sasjs', 'api'), 'junction')
    const source = fs.readFileSync(
      path.join(__dirname, '../mockSite.ts'),
      'utf8'
    )
    fs.writeFileSync(
      path.join(cli, 'mockSite.js'),
      ts.transpileModule(source, {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          esModuleInterop: true
        }
      }).outputText
    )
    const script = [
      "const vm = require('vm')",
      "const fs = require('fs')",
      `require(${JSON.stringify(path.join(cli, 'mockSite.js'))}).buildLintBundle(${JSON.stringify(path.join(root, 'bundle.js'))})`,
      `const bundle = fs.readFileSync(${JSON.stringify(path.join(root, 'bundle.js'))}, 'utf8')`,
      'const context = { console }; vm.createContext(context); vm.runInContext(bundle, context)',
      "if (typeof context.SASjsCode.formatText !== 'function' || typeof context.SASjsCode.createCodeService !== 'function') process.exit(1)"
    ].join('\n')
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      TMPDIR: root,
      TEMP: root,
      TMP: root
    }
    delete env.NODE_PATH
    execFileSync(process.execPath, ['-e', script], { env, stdio: 'pipe' })
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})
