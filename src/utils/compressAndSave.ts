import path from 'path'
import AdmZip from 'adm-zip'

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
