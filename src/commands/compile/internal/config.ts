import { Target } from '@sasjs/utils/types'
import { readFile } from '../../../utils/file'
import path from 'path'
import { getConstants } from '../../../constants'
import { getLocalOrGlobalConfig } from '../../../utils/config'

export const getServiceInit = async (
  target: Target
): Promise<{ content: string; filePath: string }> => {
  const { buildSourceFolder } = await getConstants()
  let serviceInitContent = '',
    filePath = ''
  if (target?.serviceConfig?.initProgram) {
    filePath = path.isAbsolute(target.serviceConfig.initProgram)
      ? target.serviceConfig.initProgram
      : path.join(buildSourceFolder, target.serviceConfig.initProgram)
    serviceInitContent = await readFile(filePath)
  } else {
    const { configuration } = await getLocalOrGlobalConfig()

    if (configuration?.serviceConfig?.initProgram) {
      filePath = path.isAbsolute(configuration.serviceConfig.initProgram)
        ? configuration.serviceConfig.initProgram
        : path.join(buildSourceFolder, configuration.serviceConfig.initProgram)
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
  const { buildSourceFolder } = await getConstants()
  let serviceTermContent = '',
    filePath = ''
  if (target?.serviceConfig?.termProgram) {
    filePath = path.join(buildSourceFolder, target.serviceConfig.termProgram)
    filePath = path.isAbsolute(target.serviceConfig.termProgram)
      ? target.serviceConfig.termProgram
      : path.join(buildSourceFolder, target.serviceConfig.termProgram)
    serviceTermContent = await readFile(filePath)
  } else {
    const { configuration } = await getLocalOrGlobalConfig()

    if (configuration?.serviceConfig?.termProgram) {
      filePath = path.isAbsolute(configuration.serviceConfig.termProgram)
        ? configuration.serviceConfig.termProgram
        : path.join(buildSourceFolder, configuration.serviceConfig.termProgram)
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
  const { buildSourceFolder } = await getConstants()
  let jobInitContent = '',
    filePath = ''
  if (target?.jobConfig?.initProgram) {
    filePath = path.join(buildSourceFolder, target.jobConfig.initProgram)
    filePath = path.isAbsolute(target.jobConfig.initProgram)
      ? target.jobConfig.initProgram
      : path.join(buildSourceFolder, target.jobConfig.initProgram)
    jobInitContent = await readFile(filePath)
  } else {
    const { configuration } = await getLocalOrGlobalConfig()

    if (configuration?.jobConfig?.initProgram) {
      filePath = path.isAbsolute(configuration.jobConfig.initProgram)
        ? configuration.jobConfig.initProgram
        : path.join(buildSourceFolder, configuration.jobConfig.initProgram)
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
  const { buildSourceFolder } = await getConstants()
  let jobTermContent = '',
    filePath = ''
  if (target?.jobConfig?.termProgram) {
    filePath = path.isAbsolute(target.jobConfig.termProgram)
      ? target.jobConfig.termProgram
      : path.join(buildSourceFolder, target.jobConfig.termProgram)
    jobTermContent = await readFile(filePath)
  } else {
    const { configuration } = await getLocalOrGlobalConfig()

    if (configuration?.jobConfig?.termProgram) {
      filePath = path.isAbsolute(configuration.jobConfig.termProgram)
        ? configuration.jobConfig.termProgram
        : path.join(buildSourceFolder, configuration.jobConfig.termProgram)
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
