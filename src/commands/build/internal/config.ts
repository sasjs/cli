import path from 'path'
import { Target } from '@sasjs/utils/types'
import { getConstants } from '../../../constants'
import { getConfiguration } from '../../../utils/config'
import { readFile } from '../../../utils/file'

export const getBuildInit = async (target: Target) => {
  const { buildSourceFolder } = getConstants()
  let buildInitContent = ''
  if (target && target.buildConfig && target.buildConfig.initProgram) {
    buildInitContent = await readFile(
      path.join(buildSourceFolder, target.buildConfig.initProgram)
    )
  } else {
    const configuration = await getConfiguration(
      path.join(buildSourceFolder, 'sasjs', 'sasjsconfig.json')
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
    ? `\n* BuildInit start;\n${buildInitContent}\n* BuildInit end;`
    : ''
}

export const getBuildTerm = async (target: Target) => {
  const { buildSourceFolder } = getConstants()
  let buildTermContent = ''
  if (target && target.buildConfig && target.buildConfig.termProgram) {
    buildTermContent = await readFile(
      path.join(buildSourceFolder, target.buildConfig.termProgram)
    )
  } else {
    const configuration = await getConfiguration(
      path.join(buildSourceFolder, 'sasjs', 'sasjsconfig.json')
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
    ? `\n* BuildTerm start;\n${buildTermContent}\n* BuildTerm end;`
    : ''
}
