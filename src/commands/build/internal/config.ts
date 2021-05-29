import path from 'path'
import { Target } from '@sasjs/utils/types'
import { getConstants } from '../../../constants'
import { getConfiguration } from '../../../utils/config'
import { readFile } from '@sasjs/utils/file'

export const getBuildInit = async (target: Target) => {
  const { buildSourceFolder } = await getConstants()
  let buildInitContent = ''
  if (target?.buildConfig?.initProgram) {
    buildInitContent = await readFile(
      path.isAbsolute(target.buildConfig.initProgram)
        ? target.buildConfig.initProgram
        : path.join(buildSourceFolder, target.buildConfig.initProgram)
    )
  } else {
    const configuration = await getConfiguration(
      path.join(buildSourceFolder, 'sasjs', 'sasjsconfig.json')
    )
    if (configuration?.buildConfig?.initProgram) {
      buildInitContent = await readFile(
        path.isAbsolute(configuration.buildConfig.initProgram)
          ? configuration.buildConfig.initProgram
          : path.join(buildSourceFolder, configuration.buildConfig.initProgram)
      )
    }
  }

  return buildInitContent
    ? `\n* BuildInit start;\n${buildInitContent}\n* BuildInit end;`
    : ''
}

export const getBuildTerm = async (target: Target) => {
  const { buildSourceFolder } = await getConstants()
  let buildTermContent = ''
  if (target?.buildConfig?.termProgram) {
    buildTermContent = await readFile(
      path.isAbsolute(target.buildConfig.termProgram)
        ? target.buildConfig.termProgram
        : path.join(buildSourceFolder, target.buildConfig.termProgram)
    )
  } else {
    const configuration = await getConfiguration(
      path.join(buildSourceFolder, 'sasjs', 'sasjsconfig.json')
    )
    if (configuration?.buildConfig?.termProgram) {
      buildTermContent = await readFile(
        path.isAbsolute(configuration.buildConfig.termProgram)
          ? configuration.buildConfig.termProgram
          : path.join(buildSourceFolder, configuration.buildConfig.termProgram)
      )
    }
  }

  return buildTermContent
    ? `\n* BuildTerm start;\n${buildTermContent}\n* BuildTerm end;`
    : ''
}
