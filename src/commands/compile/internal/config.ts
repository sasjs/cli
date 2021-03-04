import { Target } from '@sasjs/utils/types'
import { readFile } from '../../../utils/file'
import path from 'path'
import { getConstants } from '../../../constants'
import { getConfiguration } from '../../../utils/config'

export const getServiceInit = async (
  target: Target
): Promise<{ content: string; filePath: string }> => {
  const { buildSourceFolder } = getConstants()
  let serviceInitContent = '',
    filePath = ''
  if (target?.serviceConfig?.initProgram) {
    filePath = path.join(buildSourceFolder, target.serviceConfig.initProgram)
    serviceInitContent = await readFile(filePath)
  } else {
    const configuration = await getConfiguration(
      path.join(buildSourceFolder, 'sasjs', 'sasjsconfig.json')
    )
    if (configuration?.serviceConfig?.initProgram) {
      filePath = path.join(
        buildSourceFolder,
        configuration.serviceConfig.initProgram
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
  const { buildSourceFolder } = getConstants()
  let serviceTermContent = '',
    filePath = ''
  if (target?.serviceConfig?.termProgram) {
    filePath = path.join(buildSourceFolder, target.serviceConfig.termProgram)
    serviceTermContent = await readFile(filePath)
  } else {
    const configuration = await getConfiguration(
      path.join(buildSourceFolder, 'sasjs', 'sasjsconfig.json')
    )
    if (configuration?.serviceConfig?.termProgram) {
      filePath = path.join(
        buildSourceFolder,
        configuration.serviceConfig.termProgram
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
  const { buildSourceFolder } = getConstants()
  let jobInitContent = '',
    filePath = ''
  if (target?.jobConfig?.initProgram) {
    filePath = path.join(buildSourceFolder, target.jobConfig.initProgram)
    jobInitContent = await readFile(filePath)
  } else {
    const configuration = await getConfiguration(
      path.join(buildSourceFolder, 'sasjs', 'sasjsconfig.json')
    )
    if (configuration?.jobConfig?.initProgram) {
      filePath = path.join(
        buildSourceFolder,
        configuration.jobConfig.initProgram
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
  const { buildSourceFolder } = getConstants()
  let jobTermContent = '',
    filePath = ''
  if (target?.jobConfig?.termProgram) {
    filePath = path.join(buildSourceFolder, target.jobConfig.termProgram)
    jobTermContent = await readFile(filePath)
  } else {
    const configuration = await getConfiguration(
      path.join(buildSourceFolder, 'sasjs', 'sasjsconfig.json')
    )
    if (configuration?.jobConfig?.termProgram) {
      filePath = path.join(
        buildSourceFolder,
        configuration.jobConfig.termProgram
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
