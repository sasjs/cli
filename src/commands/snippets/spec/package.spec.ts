import { execSync } from 'child_process'
import { mkdtempSync, readFileSync, rmSync } from 'fs'
import os from 'os'
import path from 'path'

describe('published snippet documentation', () => {
  it('includes the README-linked guide in the npm tarball', () => {
    const project = path.resolve(__dirname, '../../../..')
    const destination = mkdtempSync(path.join(os.tmpdir(), 'sasjs-pack-'))
    try {
      const readme = readFileSync(path.join(project, 'README.md'), 'utf8')
      const link = readme.match(/\[macro snippet generation\]\(([^)]+)\)/)
      expect(link).not.toBeNull()
      const output = execSync('npm pack --json --ignore-scripts', {
        cwd: project,
        env: { ...process.env, npm_config_pack_destination: destination },
        encoding: 'utf8'
      })
      const result = JSON.parse(output)
      const pack = Array.isArray(result) ? result[0] : result['@sasjs/cli']
      const files = pack.files.map((file: { path: string }) => file.path)
      expect(files).toContain('README.md')
      expect(files).toContain(link![1])
    } finally {
      rmSync(destination, { recursive: true, force: true })
    }
  })
})
