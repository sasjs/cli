import { BACKEND_FOLDER, FRONTEND_FOLDER } from '@sasjs/api'
import { FileTree, MemberType } from '@sasjs/utils'
import { APP_MANIFEST, AppManifest } from './appManifest'

/**
 * One zip that is both a deployment and a publication.
 *
 * A SASjs Server app has two halves and one upload: the backend is written to
 * the target's appLoc, and the frontend is published as an app served at its own
 * URL. Naming the halves is what tells the server which is which - it does not
 * infer a frontend from a folder called `web` inside the deployment, because a
 * deployment may legitimately carry one:
 *
 *     sasjs.app.json   which app the frontend is, and the appLoc of its backend
 *     web/             the compiled frontend: served at apps/<name>
 *     backend/         the deployment: services, streamed assets, entry page
 *
 * `web/` is the frontend's *contents*, not the folder holding them, so the
 * published app's root is the page a browser opens.
 */
export const packageTree = (
  backend: FileTree,
  frontend: FileTree,
  manifest: AppManifest
): FileTree => ({
  members: [
    {
      name: FRONTEND_FOLDER,
      type: MemberType.folder,
      members: frontend.members
    },
    {
      name: BACKEND_FOLDER,
      type: MemberType.folder,
      members: backend.members
    },
    {
      name: APP_MANIFEST,
      type: MemberType.file,
      code: JSON.stringify(manifest, null, 2)
    }
  ]
})
