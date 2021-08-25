import { Target } from '@sasjs/utils/types'
import { readFile } from '@sasjs/utils'
import path from 'path'
import { getLocalOrGlobalConfig } from '../../../utils/config'
import { getAbsolutePath } from '../../../utils/utils'

// TODO: REFACTOR

export const getServiceInit = async (
  target: Target
): Promise<{ content: string; filePath: string }> => {
  const { buildSourceFolder } = process.sasjsConstants
  let serviceInitContent = '',
    filePath = ''
  if (target?.serviceConfig?.initProgram) {
    filePath = getAbsolutePath(
      target.serviceConfig.initProgram,
      buildSourceFolder
    )
    serviceInitContent = await readFile(filePath)
  } else {
    const { configuration } = await getLocalOrGlobalConfig()

    if (configuration?.serviceConfig?.initProgram) {
      filePath = getAbsolutePath(
        configuration.serviceConfig.initProgram,
        buildSourceFolder
      )
      serviceInitContent = await readFile(filePath)
    }
  }

  return serviceInitContent
    ? {
        content: `\n* ServiceInit start;\n${serviceInitContent}\n* ServiceInit end;`,
        filePath
      }
    : {
        content: '',
        filePath: ''
      }
}

export const getServiceTerm = async (
  target: Target
): Promise<{ content: string; filePath: string }> => {
  const { buildSourceFolder } = process.sasjsConstants
  let serviceTermContent = '',
    filePath = ''
  if (target?.serviceConfig?.termProgram) {
    filePath = path.join(buildSourceFolder, target.serviceConfig.termProgram)
    filePath = getAbsolutePath(
      target.serviceConfig.termProgram,
      buildSourceFolder
    )
    serviceTermContent = await readFile(filePath)
  } else {
    const { configuration } = await getLocalOrGlobalConfig()

    if (configuration?.serviceConfig?.termProgram) {
      filePath = getAbsolutePath(
        configuration.serviceConfig.termProgram,
        buildSourceFolder
      )
      serviceTermContent = await readFile(filePath)
    }
  }

  return serviceTermContent
    ? {
        content: `\n* ServiceTerm start;\n${serviceTermContent}\n* ServiceTerm end;`,
        filePath
      }
    : {
        content: '',
        filePath: ''
      }
}

export const getJobInit = async (
  target: Target
): Promise<{ content: string; filePath: string }> => {
  const { buildSourceFolder } = process.sasjsConstants
  let jobInitContent = '',
    filePath = ''
  if (target?.jobConfig?.initProgram) {
    filePath = path.join(buildSourceFolder, target.jobConfig.initProgram)
    filePath = getAbsolutePath(target.jobConfig.initProgram, buildSourceFolder)
    jobInitContent = await readFile(filePath)
  } else {
    const { configuration } = await getLocalOrGlobalConfig()

    if (configuration?.jobConfig?.initProgram) {
      filePath = getAbsolutePath(
        configuration.jobConfig.initProgram,
        buildSourceFolder
      )
      jobInitContent = await readFile(filePath)
    }
  }

  return jobInitContent
    ? {
        content: `\n* JobInit start;\n${jobInitContent}\n* JobInit end;`,
        filePath
      }
    : {
        content: '',
        filePath: ''
      }
}

export const getJobTerm = async (
  target: Target
): Promise<{ content: string; filePath: string }> => {
  const { buildSourceFolder } = process.sasjsConstants
  let jobTermContent = '',
    filePath = ''
  if (target?.jobConfig?.termProgram) {
    filePath = getAbsolutePath(target.jobConfig.termProgram, buildSourceFolder)
    jobTermContent = await readFile(filePath)
  } else {
    const { configuration } = await getLocalOrGlobalConfig()

    if (configuration?.jobConfig?.termProgram) {
      filePath = getAbsolutePath(
        configuration.jobConfig.termProgram,
        buildSourceFolder
      )
      jobTermContent = await readFile(filePath)
    }
  }

  return jobTermContent
    ? {
        content: `\n* JobTerm start;\n${jobTermContent}\n* JobTerm end;`,
        filePath
      }
    : {
        content: '',
        filePath: ''
      }
}

export const getTestInit = async (
  target: Target
): Promise<{ content: string; filePath: string }> => {
  const { buildSourceFolder } = process.sasjsConstants
  let testInitContent = '',
    filePath = ''

  if (target?.testConfig?.initProgram) {
    filePath = getAbsolutePath(target.testConfig.initProgram, buildSourceFolder)

    testInitContent = await readFile(filePath)
  } else {
    const { configuration } = await getLocalOrGlobalConfig()

    if (configuration?.testConfig?.initProgram) {
      filePath = getAbsolutePath(
        configuration.testConfig.initProgram,
        buildSourceFolder
      )

      testInitContent = await readFile(filePath)
    }
  }

  return testInitContent
    ? {
        content: `\n* TestInit start;\n${testInitContent}\n* TestInit end;`,
        filePath
      }
    : {
        content: '',
        filePath: ''
      }
}

export const getTestTerm = async (
  target: Target
): Promise<{ content: string; filePath: string }> => {
  const { buildSourceFolder } = process.sasjsConstants
  let testTermContent = '',
    filePath = ''

  if (target?.testConfig?.termProgram) {
    filePath = path.join(buildSourceFolder, target.testConfig.termProgram)
    filePath = getAbsolutePath(target.testConfig.termProgram, buildSourceFolder)

    testTermContent = await readFile(filePath)
  } else {
    const { configuration } = await getLocalOrGlobalConfig()

    if (configuration?.testConfig?.termProgram) {
      filePath = getAbsolutePath(
        configuration.testConfig.termProgram,
        buildSourceFolder
      )

      testTermContent = await readFile(filePath)
    }
  }

  return testTermContent
    ? {
        content: `\n* TestTerm start;\n${testTermContent}\n* TestTerm end;`,
        filePath
      }
    : {
        content: '',
        filePath: ''
      }
}
