import path from 'path'
import AdmZip from 'adm-zip'

/**
 * Creates a zip file.
 * Having single JSON file in it.
 * @param {string} saveTo - full path to save the file.
 * @param {string} contents - contents of JSON file.
 */
export const compressAndSave = async (saveTo: string, contents: string) => {
  const zip = new AdmZip()

  const filenameInZip = path.basename(saveTo, path.extname(saveTo))

  // add file directly
  zip.addFile(
    filenameInZip,
    Buffer.from(contents, 'utf8'),
    'entry comment goes here'
  )

  await zip.writeZipPromise(saveTo, { overwrite: true })
}
