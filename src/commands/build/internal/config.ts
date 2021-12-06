import path from 'path'
import { Target, readFile, getAbsolutePath } from '@sasjs/utils'
import { getConfiguration } from '../../../utils/config'

export const getBuildInit = async (target: Target) => {
  const { buildSourceFolder } = process.sasjsConstants
  let buildInitContent = ''
  if (target?.buildConfig?.initProgram) {
    buildInitContent = await readFile(
      getAbsolutePath(target.buildConfig.initProgram, buildSourceFolder)
    )
  } else {
    const configuration = await getConfiguration(
      path.join(buildSourceFolder, 'sasjs', 'sasjsconfig.json')
    )
    if (configuration?.buildConfig?.initProgram) {
      buildInitContent = await readFile(
        getAbsolutePath(
          configuration.buildConfig.initProgram,
          buildSourceFolder
        )
      )
    }
  }

  return buildInitContent
    ? `\n* BuildInit start;\n${buildInitContent}\n* BuildInit end;`
    : ''
}

export const getBuildTerm = async (target: Target) => {
  const { buildSourceFolder } = process.sasjsConstants
  let buildTermContent = ''
  if (target?.buildConfig?.termProgram) {
    buildTermContent = await readFile(
      getAbsolutePath(target.buildConfig.termProgram, buildSourceFolder)
    )
  } else {
    const configuration = await getConfiguration(
      path.join(buildSourceFolder, 'sasjs', 'sasjsconfig.json')
    )
    if (configuration?.buildConfig?.termProgram) {
      buildTermContent = await readFile(
        getAbsolutePath(
          configuration.buildConfig.termProgram,
          buildSourceFolder
        )
      )
    }
  }

  return buildTermContent
    ? `\n* BuildTerm start;\n${buildTermContent}\n* BuildTerm end;`
    : ''
}
