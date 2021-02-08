import path from 'path'
import { graphviz } from 'node-graphviz'

import { doc } from '../../../main'
import { Command } from '../../../utils/command'
import { createTestApp, removeTestApp } from '../../../utils/test'
import { generateTimestamp } from '../../../utils/utils'
import {
  folderExists,
  fileExists,
  createFile,
  deleteFile,
  readFile
} from '../../../utils/file'
import { getConfiguration } from '../../../utils/config'
import { getConstants } from '../../../constants'
import { Target } from '@sasjs/utils'
import { DocConfig } from '@sasjs/utils/types/config'

describe('sasjs doc lineage', () => {
  let appName: string

  afterEach(async () => {
    await removeTestApp(__dirname, appName)
  })

  it(
    `should generate dot-files (fallback first Target from config)`,
    async () => {
      appName = `test-app-doc-${generateTimestamp()}`
      const docOutputDefault = path.join(
        __dirname,
        appName,
        'sasjsbuild',
        'docs'
      )

      await createTestApp(__dirname, appName)

      await expect(doc(new Command(`doc lineage`))).resolves.toEqual(0)

      await verifyDotFiles(docOutputDefault)
    },
    60 * 1000
  )

  it(
    `should generate dot-files for supplied target`,
    async () => {
      appName = `test-app-doc-${generateTimestamp()}`
      const docOutputDefault = path.join(
        __dirname,
        appName,
        'sasjsbuild',
        'docs'
      )

      await createTestApp(__dirname, appName)

      await expect(doc(new Command(`doc lineage -t sas9`))).resolves.toEqual(0)

      await verifyDotFiles(docOutputDefault)
    },
    60 * 1000
  )

  it(
    `should generate dot-files to ./my-docs`,
    async () => {
      appName = `test-app-doc-${generateTimestamp()}`

      const docOutputProvided = path.join(__dirname, appName, 'my-docs')

      await createTestApp(__dirname, appName)

      await expect(folderExists(docOutputProvided)).resolves.toEqual(false)

      await expect(
        doc(new Command(`doc lineage --outDirectory ${docOutputProvided}`))
      ).resolves.toEqual(0)

      await verifyDotFiles(docOutputProvided)
    },
    60 * 1000
  )

  it(
    `should generate dot-files to sasjsconfig.json's outDirectory`,
    async () => {
      appName = `test-app-doc-${generateTimestamp()}`

      const docOutputProvided = path.join(__dirname, appName, 'xyz')

      await createTestApp(__dirname, appName)
      await updateConfig({
        docConfig: { outDirectory: docOutputProvided }
      } as Target)

      await expect(folderExists(docOutputProvided)).resolves.toEqual(false)

      await expect(doc(new Command(`doc lineage`))).resolves.toEqual(0)

      await verifyDotFiles(docOutputProvided)
    },
    60 * 1000
  )

  it(
    `should generate dot-files to default location having docConfig.outDirectory is empty`,
    async () => {
      appName = `test-app-doc-${generateTimestamp()}`
      const docOutputDefault = path.join(
        __dirname,
        appName,
        'sasjsbuild',
        'docs'
      )

      await createTestApp(__dirname, appName)
      await updateConfig({ docConfig: { outDirectory: '' } } as Target)

      await expect(folderExists(docOutputDefault)).resolves.toEqual(false)

      await expect(doc(new Command(`doc lineage`))).resolves.toEqual(0)

      await verifyDotFiles(docOutputDefault)
    },
    60 * 1000
  )

  it(
    `should generate dot-files custom jobs`,
    async () => {
      appName = `test-app-doc-${generateTimestamp()}`
      const docOutputDefault = path.join(
        __dirname,
        appName,
        'sasjsbuild',
        'docs'
      )

      await createTestApp(__dirname, appName)
      await updateConfig({
        jobConfig: {
          jobFolders: ['../../testJobs']
        }
      } as Target)

      await expect(folderExists(docOutputDefault)).resolves.toEqual(false)

      await expect(doc(new Command(`doc lineage`))).resolves.toEqual(0)

      await verifyDotFiles(docOutputDefault)
      await verifyCustomDotFiles(docOutputDefault)
    },
    60 * 1000
  )
})

const updateConfig = async (target: Target) => {
  const { buildSourceFolder } = getConstants()
  const configPath = path.join(buildSourceFolder, 'sasjsconfig.json')
  const config = await getConfiguration(configPath)
  if (config?.targets?.[0])
    config.targets[0] = { ...config.targets[0], ...target }

  await createFile(configPath, JSON.stringify(config, null, 1))
}

const verifyDotFiles = async (docsFolder: string) => {
  const dotCodeFile = path.join(docsFolder, 'generated_code.dot')
  const dotGraphFile = path.join(docsFolder, 'graph_diagram.svg')

  await expect(folderExists(docsFolder)).resolves.toEqual(true)

  await expect(fileExists(dotCodeFile)).resolves.toEqual(true)
  await expect(fileExists(dotGraphFile)).resolves.toEqual(true)
}

const verifyCustomDotFiles = async (docsFolder: string) => {
  const dotCodeFile = path.join(docsFolder, 'generated_code.dot')
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
    (edge) => edge.tail === tail._gvid && edge.head === head._gvid
  )
}
