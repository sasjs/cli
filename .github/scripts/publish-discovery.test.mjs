import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFile, execFileSync } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtempSync, readFileSync, writeFileSync, copyFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import http from 'node:http'
import yaml from 'js-yaml'

const exec = promisify(execFile)
const workflowPath = process.env.PUBLISH_WORKFLOW || '.github/workflows/npmpublish.yml'
const workflow = readFileSync(workflowPath, 'utf8')
function script(id, source = workflow) {
  const steps = yaml.safeLoad(source)?.jobs?.release?.steps
  assert.ok(Array.isArray(steps), 'missing release job steps')
  const matches = steps.filter(step => step.id === id)
  assert.equal(matches.length, 1, `expected one workflow step ${id}`)
  assert.equal(typeof matches[0].run, 'string', `missing shell in ${id}`)
  return matches[0].run
}
const env = { ...process.env, GIT_AUTHOR_NAME: 'test', GIT_AUTHOR_EMAIL: 'test@example.com', GIT_COMMITTER_NAME: 'test', GIT_COMMITTER_EMAIL: 'test@example.com', GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' }
const git = (cwd, ...args) => execFileSync('git', args, { cwd, env, encoding: 'utf8' }).trim()
function fixture() {
  const cwd = mkdtempSync(join(tmpdir(), 'sas-publish-'))
  git(cwd, 'init', '-q', '-b', 'main')
  writeFileSync(join(cwd, 'package.json'), JSON.stringify({name: '@fixture/pkg', version: '0.0.0', marker: 'tagged'}))
  git(cwd, 'add', '.'); git(cwd, 'commit', '-qm', 'fixture')
  const temp = join(cwd, 'runner'); mkdirSync(temp)
  copyFileSync(resolve('node_modules/@sasjs/release/release.mjs'), join(temp, 'sasjs-release.mjs'))
  return { cwd, temp, sha: git(cwd, 'rev-parse', 'HEAD'), output: join(temp, 'out') }
}
async function run(f, id, extra = {}) {
  writeFileSync(f.output, '')
  const result = await exec('bash', ['-e', '-o', 'pipefail', '-c', script(id)], { cwd: f.cwd, env: { ...env, RUNNER_TEMP: f.temp, GITHUB_OUTPUT: f.output, EVENT: 'workflow_run', REQUESTED: '', SHA: f.sha, REPUBLISH: 'false', ...extra } })
  return { ...result, output: Object.fromEntries(readFileSync(f.output, 'utf8').trimEnd().split('\n').filter(Boolean).map(line => { const i = line.indexOf('='); return [line.slice(0,i), line.slice(i+1)] })) }
}
const discover = (f, extra) => run(f, 'tag', extra)

test('workflow script extraction tolerates reindentation and reordered steps', () => {
  const alternate = 'jobs:\n  release:\n    steps:\n      - name: Check out the tag\n        run: echo checkout\n      - name: Which tag is this run for?\n        id: tag\n        run: |\n          echo discovery\n'
  assert.equal(script('tag', alternate).trim(), 'echo discovery')
})

test('the workflow uses published discovery from trusted main before tag checkout', async () => {
  const f = fixture(); git(f.cwd, 'tag', 'v1.2.3')
  const r = await discover(f)
  assert.deepEqual(r.output, {skip:'false', tag:'v1.2.3', version:'1.2.3'})
})

test('workflow_run validates SHA, skips no tag, and uses semantic precedence', async () => {
  const f = fixture()
  await assert.rejects(discover(f, {SHA:''}), /SHA/)
  assert.deepEqual((await discover(f)).output, {skip:'true', tag:'', version:''})
  git(f.cwd, 'tag', 'v1.2.3'); git(f.cwd, 'tag', 'v1.10.0'); git(f.cwd, 'tag', 'z-unrelated')
  assert.equal((await discover(f)).output.tag, 'v1.10.0')
  git(f.cwd, 'tag', 'v9.bad')
  await assert.rejects(discover(f), /does not carry a version/)
})

test('discovery refuses equal-precedence tags and shallow history', async () => {
  const f = fixture(); git(f.cwd, 'tag', 'v1.2.3+one'); git(f.cwd, 'tag', 'v1.2.3+two')
  await assert.rejects(discover(f), /equal version precedence/)
  const shallow = mkdtempSync(join(tmpdir(), 'sas-shallow-'))
  git(shallow, 'clone', '-q', '--depth=1', `file://${f.cwd}`, '.')
  const clone = { ...f, cwd: shallow }
  await assert.rejects(discover(clone), /shallow/)
})

test('dispatch rejects empty, non-tag, malformed, off-branch and build-metadata tags', async () => {
  const f = fixture(); git(f.cwd, 'tag', 'v1.2.3'); git(f.cwd, 'branch', 'v8.0.0'); git(f.cwd, 'tag', 'v2.0.0+build'); git(f.cwd, 'tag', 'v3.bad')
  for (const requested of ['', 'v8.0.0', 'v3.bad', 'v2.0.0+build']) await assert.rejects(discover(f, { EVENT:'workflow_dispatch', REQUESTED:requested, SHA:'' }))
  assert.equal((await discover(f, { EVENT:'workflow_dispatch', REQUESTED:'v1.2.3', SHA:'' })).output.tag, 'v1.2.3')
  git(f.cwd, 'checkout', '-qb', 'other'); git(f.cwd, 'commit', '--allow-empty', '-qm', 'off branch'); git(f.cwd, 'tag', 'v9.0.0'); git(f.cwd, 'checkout', '-q', 'main')
  await assert.rejects(discover(f, { EVENT:'workflow_dispatch', REQUESTED:'v9.0.0', SHA:'' }), /not on main/)
})

test('workflow-run rejects a sole malformed prefixed tag instead of skipping', async () => {
  const f = fixture(); git(f.cwd, 'tag', 'vbad')
  await assert.rejects(discover(f), /vbad does not carry a version/)
})

test('dispatch discovery rejects an off-main tag despite a main tag collision', async () => {
  const f = fixture()
  git(f.cwd, 'checkout', '-qb', 'other'); git(f.cwd, 'commit', '--allow-empty', '-qm', 'off branch')
  git(f.cwd, 'tag', 'v9.0.0'); git(f.cwd, 'tag', 'main'); git(f.cwd, 'checkout', '-q', 'refs/heads/main')
  await assert.rejects(discover(f, {EVENT:'workflow_dispatch', REQUESTED:'v9.0.0', SHA:''}), /not on main/)
})

test('preparation rejects an off-main tag despite a main tag collision', async () => {
  const f = fixture()
  git(f.cwd, 'checkout', '-qb', 'other'); git(f.cwd, 'commit', '--allow-empty', '-qm', 'off branch')
  git(f.cwd, 'tag', 'v9.0.0'); git(f.cwd, 'tag', 'main'); git(f.cwd, 'checkout', '-q', 'refs/tags/v9.0.0')
  await assert.rejects(run(f, 'publish', {TAG:'v9.0.0', VERSION:'9.0.0'}), /not on main/)
  assert.equal(JSON.parse(readFileSync(join(f.cwd, 'package.json'))).version, '0.0.0')
})

test('prepare executes trusted tool against tagged source and respects registry results', async t => {
  const f = fixture(); git(f.cwd, 'tag', 'v1.2.3')
  writeFileSync(join(f.cwd, 'package.json'), JSON.stringify({name:'@fixture/wrong', version:'0.0.0', marker:'main'})); git(f.cwd, 'add', 'package.json'); git(f.cwd, 'commit', '-qm', 'main changed')
  let status = 200; const seen = []
  const server = http.createServer((req,res) => {seen.push(req.url); res.writeHead(status); res.end('{}')})
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); t.after(() => server.close())
  const preload = join(f.temp, 'fetch.cjs')
  writeFileSync(preload, `const fetch0=global.fetch; global.fetch=(url, options)=>fetch0(url.replace('https://registry.npmjs.org', 'http://127.0.0.1:${server.address().port}'), options);`)
  git(f.cwd, 'checkout', '-q', 'refs/tags/v1.2.3')
  const extra = {TAG:'v1.2.3', VERSION:'1.2.3', NODE_OPTIONS:`--require=${preload}`}
  assert.equal((await run(f, 'publish', extra)).output.publish, 'false')
  assert.equal(JSON.parse(readFileSync(join(f.cwd, 'package.json'))).marker, 'tagged')
  assert.equal(seen.at(-1), '/@fixture%2Fpkg/1.2.3')
  assert.equal((await run(f, 'publish', {...extra, REPUBLISH:'true'})).output.publish, 'true')
  status = 404
  assert.equal((await run(f, 'publish', extra)).output.publish, 'true')
  status = 500
  await assert.rejects(run(f, 'publish', extra), /500/)
})
