import path from 'path'
import { Target } from '@sasjs/utils/types'
import { getConstants } from '../../constants'
import { getConfiguration } from '../../utils/config-utils'
import { readFile } from '../../utils/file'

export async function getBuildInit(target: Target) {
  const { buildSourceFolder } = getConstants()
  let buildInitContent = ''
  if (target && target.buildConfig && target.buildConfig.initProgram) {
    buildInitContent = await readFile(
      path.join(buildSourceFolder, target.buildConfig.initProgram)
    )
  } else {
    const configuration = await getConfiguration(
      path.join(buildSourceFolder, 'sasjsconfig.json')
    )
    if (
      configuration &&
      configuration.buildConfig &&
      configuration.buildConfig.initProgram
    ) {
      buildInitContent = await readFile(
        path.join(buildSourceFolder, configuration.buildConfig.initProgram)
      )
    }
  }

  return buildInitContent
    ? `\nBuildInit start;\n${buildInitContent}\nBuildInit end;`
    : ''
}

export async function getBuildTerm(target: Target) {
  const { buildSourceFolder } = getConstants()
  let buildTermContent = ''
  if (target && target.buildConfig && target.buildConfig.termProgram) {
    buildTermContent = await readFile(
      path.join(buildSourceFolder, target.buildConfig.termProgram)
    )
  } else {
    const configuration = await getConfiguration(
      path.join(buildSourceFolder, 'sasjsconfig.json')
    )
    if (
      configuration &&
      configuration.buildConfig &&
      configuration.buildConfig.termProgram
    ) {
      buildTermContent = await readFile(
        path.join(buildSourceFolder, configuration.buildConfig.termProgram)
      )
    }
  }

  return buildTermContent
    ? `\nBuildTerm start;\n${buildTermContent}\nBuildTerm end;`
    : ''
}

export async function getServiceInit(target: Target) {
  const { buildSourceFolder } = getConstants()
  let serviceInitContent = ''
  if (target && target.serviceConfig && target.serviceConfig.initProgram) {
    serviceInitContent = await readFile(
      path.join(buildSourceFolder, target.serviceConfig.initProgram)
    )
  } else {
    const configuration = await getConfiguration(
      path.join(buildSourceFolder, 'sasjsconfig.json')
    )
    if (
      configuration &&
      configuration.serviceConfig &&
      configuration.serviceConfig.initProgram
    ) {
      serviceInitContent = await readFile(
        path.join(buildSourceFolder, configuration.serviceConfig.initProgram)
      )
    }
  }

  return serviceInitContent
    ? `\nServiceInit start;\n${serviceInitContent}\nServiceInit end;`
    : ''
}

export async function getServiceTerm(target: Target) {
  const { buildSourceFolder } = getConstants()
  let serviceTermContent = ''
  if (target && target.serviceConfig && target.serviceConfig.termProgram) {
    serviceTermContent = await readFile(
      path.join(buildSourceFolder, target.serviceConfig.termProgram)
    )
  } else {
    const configuration = await getConfiguration(
      path.join(buildSourceFolder, 'sasjsconfig.json')
    )
    if (
      configuration &&
      configuration.serviceConfig &&
      configuration.serviceConfig.termProgram
    ) {
      serviceTermContent = await readFile(
        path.join(buildSourceFolder, configuration.serviceConfig.termProgram)
      )
    }
  }

  return serviceTermContent
    ? `\nServiceTerm start;\n${serviceTermContent}\nServiceTerm end;`
    : ''
}

export async function getJobInit(target: Target) {
  const { buildSourceFolder } = getConstants()
  let jobInitContent = ''
  if (target && target.jobConfig && target.jobConfig.initProgram) {
    jobInitContent = await readFile(
      path.join(buildSourceFolder, target.jobConfig.initProgram)
    )
  } else {
    const configuration = await getConfiguration(
      path.join(buildSourceFolder, 'sasjsconfig.json')
    )
    if (
      configuration &&
      configuration.jobConfig &&
      configuration.jobConfig.initProgram
    ) {
      jobInitContent = await readFile(
        path.join(buildSourceFolder, configuration.jobConfig.initProgram)
      )
    }
  }

  return jobInitContent
    ? `\nJobInit start;\n${jobInitContent}\nJobInit end;`
    : ''
}

export async function getJobTerm(target: Target) {
  const { buildSourceFolder } = getConstants()
  let jobTermContent = ''
  if (target && target.jobConfig && target.jobConfig.termProgram) {
    jobTermContent = await readFile(
      path.join(buildSourceFolder, target.jobConfig.termProgram)
    )
  } else {
    const configuration = await getConfiguration(
      path.join(buildSourceFolder, 'sasjsconfig.json')
    )
    if (
      configuration &&
      configuration.jobConfig &&
      configuration.jobConfig.termProgram
    ) {
      jobTermContent = await readFile(
        path.join(buildSourceFolder, configuration.jobConfig.termProgram)
      )
    }
  }

  return jobTermContent
    ? `\nJobTerm start;\n${jobTermContent}\nJobTerm end;`
    : ''
}
