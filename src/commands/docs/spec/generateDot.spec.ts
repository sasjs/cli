import path from 'path'
import { graphviz } from 'node-graphviz'
import {
  createTestApp,
  removeTestApp,
  verifyDotFiles
} from '../../../utils/test'
import {
  readFile,
  JobConfig,
  generateTimestamp,
  Target,
  Configuration,
  deleteFolder
} from '@sasjs/utils'
import { generateDot } from '../generateDot'
import { findTargetInConfiguration, getLocalConfig } from '../../../utils'
import { TargetScope } from '../../../types'

describe('sasjs doc lineage', () => {
  const appName = `test-app-doc-${generateTimestamp()}`
  const docOutputDefault = path.join(__dirname, appName, 'sasjsbuild', 'docs')
  let defaultTarget: Target
  let defaultConfig: Configuration

  beforeAll(async () => {
    await createTestApp(__dirname, appName)
    ;({ target: defaultTarget } = await findTargetInConfiguration(
      'viya',
      TargetScope.Local
    ))
    defaultConfig = await getLocalConfig()
  })

  afterEach(async () => {
    await deleteFolder(docOutputDefault)
  })

  afterAll(async () => {
    await removeTestApp(__dirname, appName)
  })

  it(`should generate dot-files`, async () => {
    await expect(generateDot(defaultTarget, defaultConfig)).resolves.toEqual({
      outDirectory: docOutputDefault
    })

    await verifyDotFiles(docOutputDefault)
  })

  it(`should generate dot-files to ./my-docs-<timestamp>`, async () => {
    const docOutputProvided = path.join(
      __dirname,
      appName,
      `my-docs-${generateTimestamp()}`
    )

    await expect(
      generateDot(defaultTarget, defaultConfig, docOutputProvided)
    ).resolves.toEqual({
      outDirectory: docOutputProvided
    })

    await verifyDotFiles(docOutputProvided)
  })

  it(`should generate dot-files to sasjsconfig.json's outDirectory`, async () => {
    const docOutputProvided = path.join(
      __dirname,
      appName,
      `xyz-${generateTimestamp()}`
    )
    const target = new Target({
      ...defaultTarget.toJson(),
      docConfig: { outDirectory: docOutputProvided }
    })

    await expect(generateDot(target, defaultConfig)).resolves.toEqual({
      outDirectory: docOutputProvided
    })

    await verifyDotFiles(docOutputProvided)
  })

  it(`should generate dot-files to default location having docConfig.outDirectory is empty`, async () => {
    const target = new Target({
      ...defaultTarget.toJson(),
      docConfig: { outDirectory: '' }
    })

    await expect(generateDot(target, defaultConfig)).resolves.toEqual({
      outDirectory: docOutputDefault
    })

    await verifyDotFiles(docOutputDefault)
  })

  it(`should generate dot-files custom jobs`, async () => {
    const target = new Target({
      ...defaultTarget.toJson(),
      jobConfig: {
        jobFolders: ['../testJobs']
      } as JobConfig
    })

    await expect(generateDot(target, defaultConfig)).resolves.toEqual({
      outDirectory: docOutputDefault
    })

    await verifyDotFiles(docOutputDefault)
    await verifyCustomDotFiles(docOutputDefault)
  })

  it(`should generate dot-files custom jobs having double qoutes`, async () => {
    const target = new Target({
      ...defaultTarget.toJson(),
      jobConfig: {
        jobFolders: ['../testJobHavingDoubleQoutes']
      } as JobConfig
    })

    await expect(generateDot(target, defaultConfig)).resolves.toEqual({
      outDirectory: docOutputDefault
    })

    await verifyDotFiles(docOutputDefault)
  })

  it(`should generate dot-files custom jobs having back slashes`, async () => {
    const target = new Target({
      ...defaultTarget.toJson(),
      jobConfig: {
        jobFolders: ['../testJobHavingBackSlashes']
      } as JobConfig
    })

    await expect(generateDot(target, defaultConfig)).resolves.toEqual({
      outDirectory: docOutputDefault
    })

    await verifyDotFiles(docOutputDefault)
  })
})

const verifyCustomDotFiles = async (docsFolder: string) => {
  const dotCodeFile = path.join(docsFolder, 'data_lineage.dot')
  const dotFileContent = await readFile(dotCodeFile)

  const { objects: nodes, edges } = JSON.parse(
    await graphviz.dot(dotFileContent, 'dot_json')
  )

  const file1 = 'jobinit.sas'.toUpperCase()
  const file2 = 'jobterm.sas'.toUpperCase()
  const input1 = 'LIB.test_input_1'.toUpperCase()
  const input2 = 'LIB.test_input_2'.toUpperCase()
  const input3 = 'LIBr.test_input_3'.toUpperCase()
  const input4 = 'LIBf.test_input_4'.toUpperCase()
  const input5 = 'LIBf.test_input_5'.toUpperCase()
  const output1 = 'LND.test_output_1'.toUpperCase()
  const output2 = 'LND.test_output_2'.toUpperCase()
  const output3 = 'LND.test_output_3'.toUpperCase()
  const output4 = 'LND.test_output_4'.toUpperCase()
  const param = 'BOTH.as_input_and_output'.toUpperCase()

  const nodeFileJobInit = nodes.find((node: any) => node.label?.includes(file1))
  const nodeFileJobTerm = nodes.find((node: any) => node.label?.includes(file2))
  const nodeInput1 = nodes.find((node: any) => node.label === input1)
  const nodeInput2 = nodes.find((node: any) => node.label === input2)
  const nodeInput3 = nodes.find((node: any) => node.label === input3)
  const nodeInput4 = nodes.find((node: any) => node.label === input4)
  const nodeInput5 = nodes.find((node: any) => node.label === input5)
  const nodeOutput1 = nodes.find((node: any) => node.label === output1)
  const nodeOutput2 = nodes.find((node: any) => node.label === output2)
  const nodeOutput3 = nodes.find((node: any) => node.label === output3)
  const nodeOutput4 = nodes.find((node: any) => node.label === output4)
  const nodeParam = nodes.find((node: any) => node.label === param)

  // checking colors of same libs should be same
  expect(nodeInput1.color).toEqual(nodeInput2.color)
  expect(nodeInput4.color).toEqual(nodeInput5.color)
  expect(nodeInput1.color).not.toEqual(nodeInput4.color)
  expect(nodeInput1.color).not.toEqual(nodeInput3.color)
  expect(nodeOutput1.color).toEqual(nodeOutput2.color)
  expect(nodeOutput1.color).toEqual(nodeOutput3.color)
  expect(nodeOutput1.color).toEqual(nodeOutput4.color)
  expect(nodeParam.color).not.toEqual(nodeInput1.color)
  expect(nodeParam.color).not.toEqual(nodeInput4.color)
  expect(nodeParam.color).not.toEqual(nodeOutput1.color)

  // checking edges as per ./testjobs
  expect(findEdge(edges, nodeInput1, nodeFileJobInit)).toBeTruthy()
  expect(findEdge(edges, nodeInput4, nodeFileJobInit)).toBeTruthy()
  expect(findEdge(edges, nodeInput5, nodeFileJobInit)).toBeTruthy()
  expect(findEdge(edges, nodeFileJobInit, nodeOutput1)).toBeTruthy()

  expect(findEdge(edges, nodeInput1, nodeFileJobTerm)).toBeTruthy()
  expect(findEdge(edges, nodeInput2, nodeFileJobTerm)).toBeTruthy()
  expect(findEdge(edges, nodeInput3, nodeFileJobTerm)).toBeTruthy()
  expect(findEdge(edges, nodeInput4, nodeFileJobTerm)).toBeTruthy()
  expect(findEdge(edges, nodeFileJobTerm, nodeOutput1)).toBeTruthy()
  expect(findEdge(edges, nodeFileJobTerm, nodeOutput2)).toBeTruthy()
  expect(findEdge(edges, nodeFileJobTerm, nodeOutput3)).toBeTruthy()
  expect(findEdge(edges, nodeFileJobTerm, nodeOutput4)).toBeTruthy()

  expect(findEdge(edges, nodeParam, nodeFileJobTerm)).toBeTruthy()
  expect(findEdge(edges, nodeFileJobInit, nodeParam)).toBeTruthy()

  expect(findEdge(edges, nodeFileJobTerm, nodeParam)).toBeUndefined()
  expect(findEdge(edges, nodeParam, nodeFileJobInit)).toBeUndefined()
}

function findEdge(edges: any[], tail: any, head: any) {
  return edges.find(
    edge => edge.tail === tail._gvid && edge.head === head._gvid
  )
}
