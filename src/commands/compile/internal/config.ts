import { Target } from '@sasjs/utils/types'
import { readFile } from '../../../utils/file'
import path from 'path'
import { getConstants } from '../../../constants'
import { getConfiguration } from '../../../utils/config'

export const getServiceInit = async (target: Target) => {
  const { buildSourceFolder } = getConstants()
  let serviceInitContent = ''
  if (target?.serviceConfig?.initProgram) {
    serviceInitContent = await readFile(
      path.join(buildSourceFolder, target.serviceConfig.initProgram)
    )
  } else {
    const configuration = await getConfiguration(
      path.join(buildSourceFolder, 'sasjs', 'sasjsconfig.json')
    )
    if (configuration?.serviceConfig?.initProgram) {
      serviceInitContent = await readFile(
        path.join(buildSourceFolder, configuration.serviceConfig.initProgram)
      )
    }
  }

  return serviceInitContent
    ? `\n* ServiceInit start;\n${serviceInitContent}\n* ServiceInit end;`
    : ''
}

export const getServiceTerm = async (target: Target) => {
  const { buildSourceFolder } = getConstants()
  let serviceTermContent = ''
  if (target?.serviceConfig?.termProgram) {
    serviceTermContent = await readFile(
      path.join(buildSourceFolder, target.serviceConfig.termProgram)
    )
  } else {
    const configuration = await getConfiguration(
      path.join(buildSourceFolder, 'sasjs', 'sasjsconfig.json')
    )
    if (configuration?.serviceConfig?.termProgram) {
      serviceTermContent = await readFile(
        path.join(buildSourceFolder, configuration.serviceConfig.termProgram)
      )
    }
  }

  return serviceTermContent
    ? `\n* ServiceTerm start;\n${serviceTermContent}\n* ServiceTerm end;`
    : ''
}

export const getJobInit = async (target: Target) => {
  const { buildSourceFolder } = getConstants()
  let jobInitContent = ''
  if (target?.jobConfig?.initProgram) {
    jobInitContent = await readFile(
      path.join(buildSourceFolder, target.jobConfig.initProgram)
    )
  } else {
    const configuration = await getConfiguration(
      path.join(buildSourceFolder, 'sasjs', 'sasjsconfig.json')
    )
    if (configuration?.jobConfig?.initProgram) {
      jobInitContent = await readFile(
        path.join(buildSourceFolder, configuration.jobConfig.initProgram)
      )
    }
  }

  return jobInitContent
    ? `\n* JobInit start;\n${jobInitContent}\n* JobInit end;`
    : ''
}

export const getJobTerm = async (target: Target) => {
  const { buildSourceFolder } = getConstants()
  let jobTermContent = ''
  if (target?.jobConfig?.termProgram) {
    jobTermContent = await readFile(
      path.join(buildSourceFolder, target.jobConfig.termProgram)
    )
  } else {
    const configuration = await getConfiguration(
      path.join(buildSourceFolder, 'sasjs', 'sasjsconfig.json')
    )
    if (configuration?.jobConfig?.termProgram) {
      jobTermContent = await readFile(
        path.join(buildSourceFolder, configuration.jobConfig.termProgram)
      )
    }
  }

  return jobTermContent
    ? `\n* JobTerm start;\n${jobTermContent}\n* JobTerm end;`
    : ''
}
