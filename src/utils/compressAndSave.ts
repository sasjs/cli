import path from 'path'
import fs from 'fs'
import yazl from 'yazl'

/**
 * Creates a zip file.
 * Having single JSON file in it.
 * @param {string} saveTo - full path to save the file.
 * @param {string} contents - contents of JSON file.
 */
export const compressAndSave = async (saveTo: string, contents: string) => {
  const zip = new yazl.ZipFile()

  const filenameInZip = path.basename(saveTo, path.extname(saveTo))

  // add file directly
  zip.addBuffer(Buffer.from(contents, 'utf8'), filenameInZip)

  await new Promise<void>((resolve, reject) => {
    zip.outputStream.on('error', reject)
    zip.outputStream.pipe(fs.createWriteStream(saveTo)).on('close', resolve)
    zip.end()
  })
}
