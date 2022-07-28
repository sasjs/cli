import { createTestApp, removeTestApp } from '../../../utils/test'
import {
  Logger,
  LogLevel,
  generateTimestamp,
  readFile,
  createFile
} from '@sasjs/utils'
import { findTargetInConfiguration } from '../../../utils'
import { build } from '../build'
import { compile } from '../..'
import path from 'path'

describe('sasjs build', () => {
  let appName: string

  beforeAll(() => {
    process.logger = new Logger(LogLevel.Off)
  })

  afterEach(async () => {
    await removeTestApp(__dirname, appName)
  })

  it(
    `should build with minimal template`,
    async () => {
      appName = `test-app-build-minimal-${generateTimestamp()}`
      await createTestApp(__dirname, appName)
      const target = (await findTargetInConfiguration('viya')).target

      await expect(build(target)).toResolve()
    },
    2 * 60 * 1000
  )

  it(
    `should compile and build(skipping compile)`,
    async () => {
      appName = `test-app-build-${generateTimestamp()}`

      await createTestApp(__dirname, appName)
      const target = (await findTargetInConfiguration('viya')).target

      await compile(target)
      await expect(build(target)).toResolve()
    },
    2 * 60 * 1000
  )

  it(`should compile and build remaining multiline comments`, async () => {
    const beforeComment = 'before comment;'
    const afterComment = 'after comment;'
    const commentLine1 = `/*Name_corrected2=translate(trim(Name_corrected),'_','~!@#$%^&*()+-=[]\{}|;:",./<>?Â°²³µ ');`
    const commentLine2 = `/* Name_corrected2=translate(trim(Name_corrected),'_','/','(',')','?','Â²','#','°C','µ','³'); */`
    const testContent = [
      beforeComment,
      commentLine1,
      commentLine2,
      afterComment
    ].join('\n')

    appName = `test-app-build-${generateTimestamp()}`

    await createTestApp(__dirname, appName)

    const macroPath = path.join(
      __dirname,
      appName,
      'sasjs',
      'macros',
      'examplemacro.sas'
    )

    await createFile(macroPath, (await readFile(macroPath)) + testContent)

    const target = (await findTargetInConfiguration('viya')).target

    await compile(target)
    await build(target)

    const finalSasFilePath = path.join(
      __dirname,
      appName,
      'sasjsbuild',
      target.buildConfig!.buildOutputFileName
    )
    const finalSasFile = await readFile(finalSasFilePath)

    expect(finalSasFile.includes(beforeComment)).toBeTruthy()
    expect(
      finalSasFile.includes(commentLine1.split(`'`).join(`'`.repeat(2)))
    ).toBeTruthy()
    expect(commentLine2.split(`'`).join(`'`.repeat(2))).toBeTruthy()
    expect(finalSasFile.includes(afterComment)).toBeTruthy()
  })
})
