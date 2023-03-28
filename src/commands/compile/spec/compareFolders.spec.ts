import path from 'path'
import {
  createFile,
  createFolder,
  deleteFolder,
  generateTimestamp
} from '@sasjs/utils'
import { compareFolders } from '../internal'

describe('compareFolders', () => {
  let sourceFolderPath: string
  let destinationFolderPath: string

  beforeEach(async () => {
    const timestamp = generateTimestamp()
    sourceFolderPath = path.join(__dirname, `cli-tests-source-${timestamp}`)
    destinationFolderPath = path.join(
      __dirname,
      `cli-tests-destination-${timestamp}`
    )
    await createFolder(sourceFolderPath)
    await createFolder(destinationFolderPath)
  })

  afterEach(async () => {
    await deleteFolder(sourceFolderPath)
    await deleteFolder(destinationFolderPath)
  })

  it('should throw an error when the source folder is missing', async () => {
    const nonExistentSourcePath = path.join(__dirname, 'nothing')
    await expect(
      compareFolders(nonExistentSourcePath, destinationFolderPath)
    ).rejects.toThrowError(
      `Source path ${nonExistentSourcePath} does not exist. Please check the \`serviceFolders\` and \`jobFolders\` in your target configuration and try again.`
    )
  })

  it('should return the correct response when destination path is missing', async () => {
    const nonExistentDestinationPath = path.join(__dirname, 'nothing')

    const response = await compareFolders(
      sourceFolderPath,
      nonExistentDestinationPath
    )

    expect(response.equal).toBeFalse()
    expect(response.reason).toEqual(
      `Destination path ${nonExistentDestinationPath} does not exist.`
    )
  })

  it('should return the correct response when a subfolder is missing', async () => {
    await createFolder(path.join(sourceFolderPath, 'missing-subfolder'))

    const response = await compareFolders(
      sourceFolderPath,
      destinationFolderPath
    )

    expect(response.equal).toBeFalse()
    expect(response.reason).toEqual(
      `Subfolders missing from ${destinationFolderPath}: missing-subfolder`
    )
  })

  it('should return the correct response when multiple subfolders are missing', async () => {
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
  })

  it('should return the correct response when a file is missing', async () => {
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
  })

  it('should return the correct response when multiple files are missing', async () => {
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
  })

  it('should return the correct response when folders are matching', async () => {
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
  })
})
