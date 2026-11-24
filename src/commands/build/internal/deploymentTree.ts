import fs from 'fs'
import path from 'path'
import {
  asyncForEach,
  base64EncodeFile,
  chunk,
  listFilesInFolder,
  listSubFoldersInFolder,
  readFile,
  removeHeader,
  ServerType,
  Target
} from '@sasjs/utils'
import { FileTree, FolderMember, MemberType } from '@sasjs/utils/types'

import { isSasFile } from '../../../utils/file'
import { getWebServiceScriptInvocation } from './webServiceInvocation'
import {
  isMockSiteFolder,
  isSameOrChild,
  mockSiteOutputFolder
} from './mockSite/mockSite'

/**
 * A deployment as one tree: the folders compiled into the build, plus any file
 * the build wrote at its root.
 *
 * The folders keep their names - `services`, `jobs`, `tests` - because those
 * are the folders the deployment has at the appLoc. Root files matter now that
 * a streamed app's entry page sits beside the assets folder instead of inside
 * the services folder: it is the page a browser opens, and it has to travel with
 * the deployment that its asset links point into.
 *
 * @param {ServerType} serverType
 * @param {string} rootDirectory - folder whose contents become the tree
 * @param {string[]} excluded - absolute folders that are never packed, whether
 * they are configuration (the published frontend) or artefacts recognised by
 * their marker (a mock site)
 * @param {boolean} includeSasContent - whether to assemble the SAS that recreates
 * the tree. A caller that only needs the JSON (the published frontend) says no:
 * that text is base64 and chunked per file, and it is thrown away otherwise.
 */
export async function getDeploymentTree(
  serverType: ServerType,
  rootDirectory: string,
  excluded: string[] = [],
  skipRootFile?: (fileName: string) => boolean,
  includeSasContent: boolean = true
): Promise<{ folderContent: string; folderContentJSON: FileTree }> {
  const folderContentJSON: FileTree = { members: [] }
  let folderContent = ''

  const { buildDestinationFolder } = process.sasjsConstants
  const isBuildRoot =
    path.resolve(rootDirectory) === path.resolve(buildDestinationFolder)

  const root = await getFilesContent(
    rootDirectory,
    serverType,
    isBuildRoot ? skipRootFile : undefined,
    includeSasContent
  )

  const buildSubFolders = await listSubFoldersInFolder(rootDirectory)

  for (const subFolder of buildSubFolders) {
    const folderPath = path.join(rootDirectory, subFolder)

    if (shouldSkipFolder(folderPath, excluded)) continue

    const walked = await walkFolder(
      folderPath,
      serverType,
      subFolder,
      excluded,
      includeSasContent
    )

    if (walked === undefined) continue

    if (walked.content) folderContent += `\n${walked.content}`
    folderContentJSON.members.push(walked.contentJSON)
  }

  // the root files come last: a deploy creates the folders first, and an entry
  // page is written into the appLoc they establish
  if (includeSasContent && root.content) {
    folderContent += `\n%let path=;\n${root.content}`
  }

  folderContentJSON.members.push(...root.contentJSON)

  return { folderContent, folderContentJSON }
}

/**
 * The files a deploy writes into one folder, as SAS code that recreates them and
 * as the JSON members a service pack carries.
 *
 * The `%let path=` the SAS block needs is emitted by `walkFolder`, which knows
 * the folder's position in the deployment; this function only reads the folder.
 */
async function getFilesContent(
  folderPath: string,
  serverType: ServerType,
  skipFile?: (fileName: string) => boolean,
  includeSasContent: boolean = true
): Promise<{ content: string; contentJSON: FileTree['members'] }> {
  let content = ''
  const contentJSON: FileTree['members'] = []

  const files = await listFilesInFolder(folderPath)

  await asyncForEach(files, async (file) => {
    if (skipFile?.(file)) return

    const filePath = path.join(folderPath, file)

    if (isSasFile(file)) {
      const fileContent = removeHeader(await readFile(filePath), filePath)

      if (includeSasContent) {
        const transformedContent = getServiceText(file, fileContent, serverType)
        content += `\n${transformedContent}\n`
      }

      contentJSON.push({
        name: file.replace(/.sas$/, ''),
        type: MemberType.service,
        code: removeHeader(fileContent, filePath)
      })
    } else {
      const fileContentEncoded = await base64EncodeFile(filePath)

      if (includeSasContent) {
        const transformedContent = getFileText(
          file,
          fileContentEncoded,
          serverType
        )
        content += `\n${transformedContent}\n`
      }

      contentJSON.push({
        name: file.replace(/.sas$/, ''),
        type: MemberType.file,
        code: fileContentEncoded,
        // the deploy format carries text by default; a built asset is bytes
        encoding: 'base64'
      })
    }
  })

  return { content, contentJSON }
}

async function walkFolder(
  folderPath: string,
  serverType: ServerType,
  relativePath: string,
  excluded: string[] = [],
  includeSasContent: boolean = true
): Promise<{ content: string; contentJSON: FolderMember } | undefined> {
  const folderName = path.basename(folderPath)
  const relative = relativePath.split(path.sep).join('/')

  const { content: fileContent, contentJSON: fileMembers } =
    await getFilesContent(folderPath, serverType, undefined, includeSasContent)

  let content = includeSasContent
    ? `\n%let path=/${relative};\n${fileContent}`
    : ''
  const contentJSON: FolderMember = {
    name: folderName,
    type: MemberType.folder,
    members: [...fileMembers]
  }

  const subFolders = await listSubFoldersInFolder(folderPath)

  await asyncForEach(subFolders, async (subFolder) => {
    const childPath = path.join(folderPath, subFolder)

    if (shouldSkipFolder(childPath, excluded)) return

    const walked = await walkFolder(
      childPath,
      serverType,
      `${relative}/${subFolder}`,
      excluded,
      includeSasContent
    )

    if (walked === undefined) return

    contentJSON.members!.push(walked.contentJSON)
    content += walked.content
  })

  // A folder with nothing left in it carries nothing a deploy needs, and the one
  // way it appears is a child the walk skipped - a mock site nested under a
  // project folder. Dropping it keeps an excluded site from leaving its parent
  // behind as an empty deployment folder.
  if (contentJSON.members!.length === 0) return undefined

  return { content, contentJSON }
}

/**
 * A mock site written before the marker file existed.
 *
 * The site's default used to be `<build>/mock`, so a build made by an older CLI
 * leaves a folder there that carries no marker. Its shape is unmistakable - the
 * service worker at its root, with the runtime folder beside it - and nothing else
 * the CLI writes into the build has both.
 */
const isLegacyMockSiteFolder = (folderPath: string): boolean =>
  path.basename(folderPath) === 'mock' &&
  fs.existsSync(path.join(folderPath, 'sw.js')) &&
  fs.existsSync(path.join(folderPath, 'host'))

/**
 * Folders that are never part of a deployment.
 *
 * Two kinds: what the CLI itself writes beside the deployment (the published
 * frontend), and a mock site recognised by its own marker - which catches an
 * output an earlier build left in the build folder under a path no longer
 * configured, the case moving the default alone cannot cover.
 */
const shouldSkipFolder = (folderPath: string, excluded: string[]): boolean => {
  if (isMockSiteFolder(folderPath)) return true
  if (isLegacyMockSiteFolder(folderPath)) return true

  return excluded.some((folder) => isSameOrChild(folder, folderPath))
}

/**
 * The folders the build itself keeps out of the pack.
 *
 * The published frontend always (a stale copy is never deployment content, and
 * the folder name is reserved), and the mock output when a project points
 * `mockWebFolder` inside the build folder: an explicit path is allowed, but the
 * site is still not deployment content.
 */
export const excludedFromPack = (
  target: Target,
  publishFolder: string
): string[] => {
  const { buildDestinationFolder } = process.sasjsConstants
  const excluded = [publishFolder]
  const mockFolder = mockSiteOutputFolder(target)

  if (
    mockFolder !== buildDestinationFolder &&
    isSameOrChild(buildDestinationFolder, mockFolder)
  ) {
    excluded.push(mockFolder)
  }

  return excluded
}

function getServiceText(
  serviceFileName: string,
  fileContent: string,
  serverType: ServerType
) {
  const serviceName = serviceFileName.replace(/.sas$/, '')
  const sourceCodeLines = getLines(fileContent)
  let content = ``
  sourceCodeLines.forEach((line) => {
    const escapedLine = line.split("'").join("''")
    if (escapedLine.trim()) {
      content += `\n put '${escapedLine.trim()}';`
    }
  })
  return `%let service=${serviceName};
filename sascode temp lrecl=32767;
data _null_;
file sascode;
${content}\n
run;
${
  serverType !== ServerType.Sasjs
    ? getWebServiceScriptInvocation(serverType)
    : ''
}
filename sascode clear;
`
}

function getFileText(
  fileName: string,
  fileContent: string,
  serverType: ServerType
) {
  const fileExtension = path.extname(fileName).substring(1).toUpperCase()

  const { content, maxLineLength } = getWebFileContent(
    fileContent,
    fileExtension
  )

  return `%let filename=${fileName};
filename filecode temp lrecl=${maxLineLength};
data _null_;
file filecode;
${content}\n
run;
${
  serverType !== ServerType.Sasjs
    ? getWebServiceScriptInvocation(serverType, false, true, fileName)
    : ''
}
filename filecode clear;
`
}

function getWebFileContent(filecontent: string, type: string) {
  let parsedContent = ''

  const chunkedLines = chunk(filecontent)
  if (chunkedLines.length === 1) {
    parsedContent = ` put '${chunkedLines[0].split("'").join("''")}';\n`
  } else {
    let combinedLines = ''
    chunkedLines.forEach((chunkedLine, index) => {
      let text = ` put '${chunkedLine.split("'").join("''")}'`
      if (index !== chunkedLines.length - 1) text += '@;\n'
      else text += ';\n'

      combinedLines += text
    })
    parsedContent += combinedLines
  }
  const maxLineLength = Math.max(32767, filecontent.length)

  return { content: parsedContent, maxLineLength }
}

function getLines(text: string): string[] {
  if (!text) {
    return []
  }
  let lines = text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((l) => l.trim())
  return lines
}
