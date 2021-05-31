import path from 'path'
import { createFile, createFolder, deleteFolder } from '@sasjs/utils'
import { generateTimestamp } from '../../../utils/utils'
import { compareFolders } from '../internal/compareFolders'

describe('compareFolders', () => {
  let sourceFolderPath: string
  let destinationFolderPath: string

  beforeEach(async (done) => {
    const timestamp = generateTimestamp()
    sourceFolderPath = path.join(__dirname, `cli-tests-source-${timestamp}`)
    destinationFolderPath = path.join(
      __dirname,
      `cli-tests-destination-${timestamp}`
    )
    await createFolder(sourceFolderPath)
    await createFolder(destinationFolderPath)
    done()
  })

  afterEach(async (done) => {
    await deleteFolder(sourceFolderPath)
    await deleteFolder(destinationFolderPath)
    done()
  })

  it('should throw an error when the source folder is missing', async (done) => {
    const nonExistentSourcePath = path.join(__dirname, 'nothing')
    await expect(
      compareFolders(nonExistentSourcePath, destinationFolderPath)
    ).rejects.toThrowError(
      `Source path ${nonExistentSourcePath} does not exist. Please check the \`serviceFolders\` and \`jobFolders\` in your target configuration and try again.`
    )
    done()
  })

  it('should return the correct response when destination path is missing', async (done) => {
    const nonExistentDestinationPath = path.join(__dirname, 'nothing')

    const response = await compareFolders(
      sourceFolderPath,
      nonExistentDestinationPath
    )

    expect(response.equal).toBeFalse()
    expect(response.reason).toEqual(
      `Destination path ${nonExistentDestinationPath} does not exist.`
    )
    done()
  })

  it('should return the correct response when a subfolder is missing', async (done) => {
    await createFolder(path.join(sourceFolderPath, 'missing-subfolder'))

    const response = await compareFolders(
      sourceFolderPath,
      destinationFolderPath
    )

    expect(response.equal).toBeFalse()
    expect(response.reason).toEqual(
      `Subfolders missing from ${destinationFolderPath}: missing-subfolder`
    )
    done()
  })

  it('should return the correct response when multiple subfolders are missing', async (done) => {
    await createFolder(path.join(sourceFolderPath, 'missing-subfolder-1'))
    await createFolder(path.join(sourceFolderPath, 'missing-subfolder-2'))

    const response = await compareFolders(
      sourceFolderPath,
      destinationFolderPath
    )

    expect(response.equal).toBeFalse()
    expect(response.reason).toEqual(
      `Subfolders missing from ${destinationFolderPath}: missing-subfolder-1, missing-subfolder-2`
    )
    done()
  })

  it('should return the correct response when a file is missing', async (done) => {
    await createFile(
      path.join(sourceFolderPath, 'test.sas'),
      "%put 'hello, world!'"
    )

    const response = await compareFolders(
      sourceFolderPath,
      destinationFolderPath
    )

    expect(response.equal).toBeFalse()
    expect(response.reason).toEqual(
      `Files missing from ${destinationFolderPath}: test.sas`
    )
    done()
  })

  it('should return the correct response when multiple files are missing', async (done) => {
    await createFile(
      path.join(sourceFolderPath, 'test1.sas'),
      "%put 'hello, world!'"
    )
    await createFile(
      path.join(sourceFolderPath, 'test2.sas'),
      "%put 'hello, world!'"
    )

    const response = await compareFolders(
      sourceFolderPath,
      destinationFolderPath
    )

    expect(response.equal).toBeFalse()
    expect(response.reason).toEqual(
      `Files missing from ${destinationFolderPath}: test1.sas, test2.sas`
    )
    done()
  })

  it('should return the correct response when folders are matching', async (done) => {
    await createFile(
      path.join(sourceFolderPath, 'test1.sas'),
      "%put 'hello, world!'"
    )
    await createFile(
      path.join(destinationFolderPath, 'test1.sas'),
      "%put 'hello, world!'"
    )

    const response = await compareFolders(
      sourceFolderPath,
      destinationFolderPath
    )

    expect(response.equal).toBeTrue()
    expect(response.reason).toEqual('All files and subfolders are matching.')
    done()
  })
})
