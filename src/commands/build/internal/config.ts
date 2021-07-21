import path from 'path'
import { Target } from '@sasjs/utils/types'
import { getConstants } from '../../../constants'
import { getConfiguration } from '../../../utils/config'
import { getAbsolutePath } from '../../../utils/utils'
import { readFile } from '@sasjs/utils'

export const getBuildInit = async (target: Target) => {
  const { buildSourceFolder } = await getConstants()
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
  const { buildSourceFolder } = await getConstants()
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
