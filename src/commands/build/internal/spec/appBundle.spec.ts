import { BACKEND_FOLDER, FRONTEND_FOLDER } from '@sasjs/api'
import { FileTree, MemberType } from '@sasjs/utils'

import { packageTree } from '../appBundle'
import { APP_MANIFEST } from '../appManifest'

describe('the bundle a SASjs deploy sends', () => {
  const backend: FileTree = {
    members: [
      { name: 'services', type: MemberType.folder, members: [] },
      { name: 'demo.html', type: MemberType.file, code: 'PGh0bWw+' }
    ]
  }

  const frontend: FileTree = {
    members: [{ name: 'index.html', type: MemberType.file, code: 'PGh0bWw+' }]
  }

  const manifest = { name: 'demo', appLoc: '/Public/apps/demo' }

  it('names the frontend and the backend, and states the app at the root', () => {
    const tree = packageTree(backend, frontend, manifest)
    const names = tree.members.map((member) => member.name)

    // the names come from @sasjs/api: a host splits the bundle by them
    expect(names).toEqual([FRONTEND_FOLDER, BACKEND_FOLDER, APP_MANIFEST])
    expect(FRONTEND_FOLDER).toEqual('web')
    expect(BACKEND_FOLDER).toEqual('backend')
  })

  it('carries the frontend contents, so the app root is the page a browser opens', () => {
    const tree = packageTree(backend, frontend, manifest)
    const web = tree.members.find(
      (member) => member.name === FRONTEND_FOLDER
    ) as any

    expect(web.type).toBe(MemberType.folder)
    expect(web.members.map((member: any) => member.name)).toEqual([
      'index.html'
    ])
  })

  it('carries the deployment whole, including its entry page', () => {
    const tree = packageTree(backend, frontend, manifest)
    const deployed = tree.members.find(
      (member) => member.name === BACKEND_FOLDER
    ) as any

    expect(deployed.members.map((member: any) => member.name)).toEqual([
      'services',
      'demo.html'
    ])
  })

  it('writes the manifest as readable JSON at the root', () => {
    const tree = packageTree(backend, frontend, manifest)
    const file = tree.members.find(
      (member) => member.name === APP_MANIFEST
    ) as any

    expect(file.type).toBe(MemberType.file)
    expect(JSON.parse(file.code)).toEqual(manifest)
  })

  it('does not copy the trees it is given', () => {
    const tree = packageTree(backend, frontend, manifest)

    expect((tree.members[0] as any).members).toBe(frontend.members)
    expect((tree.members[1] as any).members).toBe(backend.members)
  })
})
