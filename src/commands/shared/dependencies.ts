import path from 'path'
import find from 'find'
import uniqBy from 'lodash.uniqby'
import groupBy from 'lodash.groupby'
import { getConstants } from '../../constants'
import { getSourcePaths } from '../../utils/config'
import { getList, folderExists, readFile } from '../../utils/file'
import { asyncForEach, diff, chunk } from '../../utils/utils'

export async function getDependencyPaths(
  fileContent: string,
  macroFolders: string[] = []
) {
  const { buildSourceFolder } = getConstants()
  const sourcePaths = await getSourcePaths(buildSourceFolder)
  if (macroFolders.length) {
    macroFolders.forEach((macroFolder) => {
      const macroPath = path.join(buildSourceFolder, macroFolder)
      sourcePaths.push(macroPath)
    })
  }

  const dependenciesHeader = fileContent.includes('<h4> SAS Macros </h4>')
    ? '<h4> SAS Macros </h4>'
    : '<h4> Dependencies </h4>'

  let dependencies = getList(dependenciesHeader, fileContent).filter((d) =>
    d.endsWith('.sas')
  )

  let dependencyPaths: string[] = []
  const foundDependencies: string[] = []

  await asyncForEach(sourcePaths, async (sourcePath) => {
    if (await folderExists(sourcePath)) {
      await asyncForEach(dependencies, async (dep) => {
        const filePaths = find.fileSync(dep, sourcePath)
        if (filePaths.length) {
          const fileContent = await readFile(filePaths[0])
          foundDependencies.push(dep)
          dependencyPaths.push(
            ...(await getDependencyPaths(fileContent, macroFolders))
          )
        }
        dependencyPaths.push(...filePaths)
      })
    } else {
      const errorMessage = `Error listing dependency paths: Source path ${sourcePath} does not exist.`

      process.logger?.error(errorMessage)

      const unFoundDependencies = diff(dependencies, foundDependencies)

      if (unFoundDependencies.length) {
        process.logger?.error(
          'Unable to locate dependencies: ' + unFoundDependencies.join(', ')
        )
      }

      throw errorMessage
    }
  })

  dependencyPaths = prioritiseDependencyOverrides(
    dependencies,
    dependencyPaths,
    macroFolders
  )

  return [...new Set(dependencyPaths)]
}

export function prioritiseDependencyOverrides(
  dependencyNames: string[],
  dependencyPaths: string[],
  macroPaths: string[] = []
) {
  dependencyNames.forEach((depFileName) => {
    const paths = dependencyPaths.filter((p) => p.includes(`/${depFileName}`))

    let overriddenDependencyPaths = paths.filter(
      (p) => !p.includes('node_modules')
    )
    if (macroPaths.length) {
      const foundInMacroPaths = overriddenDependencyPaths.filter((p) => {
        const pathExist = macroPaths.find((tm) => p.includes(tm))
        return pathExist ? true : false
      })
      if (foundInMacroPaths.length)
        overriddenDependencyPaths = foundInMacroPaths
    }

    if (
      overriddenDependencyPaths.length &&
      overriddenDependencyPaths.length != paths.length
    ) {
      const pathsToRemove = paths.filter(
        (el) => overriddenDependencyPaths.indexOf(el) < 0
      )
      dependencyPaths = dependencyPaths.filter(
        (el) => pathsToRemove.indexOf(el) < 0
      )
      if (overriddenDependencyPaths.length > 1) {
        // remove duplicates
        dependencyPaths = dependencyPaths.filter(
          (p) => p != overriddenDependencyPaths[0]
        )
        dependencyPaths.push(overriddenDependencyPaths[0])
      }
    }
  })

  return dependencyPaths
}

export async function getProgramDependencies(
  fileContent: string,
  programFolders: string[],
  buildSourceFolder: string
) {
  programFolders = (uniqBy as any)(programFolders)
  const programs = getProgramList(fileContent)
  if (programs.length) {
    const foundPrograms: string[] = []
    const foundProgramNames: string[] = []
    await asyncForEach(programFolders, async (programFolder) => {
      await asyncForEach(programs, async (program) => {
        const filePath = path.join(buildSourceFolder, programFolder)
        const filePaths = find.fileSync(program.fileName, filePath)
        if (filePaths.length) {
          const fileContent = await readFile(filePaths[0])

          if (!fileContent) {
            process.logger?.warn(
              `Program file ${path.join(filePath, program.fileName)} is empty.`
            )
          }

          const programDependencyContent = getProgramDependencyText(
            fileContent,
            program.fileRef
          )
          foundPrograms.push(programDependencyContent)
          foundProgramNames.push(program.fileName)
        }
      })
    })

    const unfoundProgramNames = programs.filter(
      (program) => !foundProgramNames.includes(program.fileName)
    )
    if (unfoundProgramNames.length) {
      process.logger
        ?.warn(`The following files were listed under SAS Programs but could not be found:
${unfoundProgramNames.join(', ')}
Please check that they exist in the folder(s) listed in the \`programFolders\` array in your sasjsconfig.json file.\n`)
    }

    return foundPrograms.join('\n')
  }

  return ''
}

function getProgramDependencyText(
  fileContent: string,
  fileRef: string
): string {
  let output = `filename ${fileRef} temp;\ndata _null_;\nfile ${fileRef} lrecl=32767;\n`

  const sourceLines = fileContent
    .replace(/\r\n/g, '\n')
    .split('\n')
    .filter((l) => !!l)

  sourceLines.forEach((line) => {
    const chunkedLines = chunk(line)
    if (chunkedLines.length === 1) {
      output += `put '${chunkedLines[0].split("'").join("''")}';\n`
    } else {
      let combinedLines = ''
      chunkedLines.forEach((chunkedLine, index) => {
        let text = `put '${chunkedLine.split("'").join("''")}'`
        if (index !== chunkedLines.length - 1) {
          text += '@;\n'
        } else {
          text += ';\n'
        }
        combinedLines += text
      })
      output += combinedLines
    }
  })

  output += 'run;'

  return output
}

export function getProgramList(
  fileContent: string
): { fileName: string; fileRef: string }[] {
  let programList = getList('<h4> SAS Programs </h4>', fileContent)
  programList = programList.map((l) => {
    const [fileName, fileRef] = l.split(' ')

    if (!fileName) {
      throw new Error(
        `SAS Program ${fileName} is missing file name. Please specify SAS program dependencies in the format: @li <filename> <fileref>`
      )
    }

    if (fileName && !fileRef) {
      throw new Error(
        `SAS Program ${fileName} is missing fileref. Please specify SAS program dependencies in the format: @li <filename> <fileref>`
      )
    }

    validateFileRef(fileRef)
    return { fileName, fileRef }
  })

  validateProgramsList(programList)

  return uniqBy(programList, 'fileName')
}

export function validateProgramsList(
  programsList: { fileName: string; fileRef: string }[]
) {
  const areFileRefsUnique =
    uniqBy(
      programsList.map((p) => p.fileRef),
      (x) => x.toLocaleUpperCase()
    ).length === programsList.length

  if (areFileRefsUnique) {
    return true
  }

  const duplicatePrograms: { fileName: string; fileRef: string }[] = []
  programsList.forEach((program, index, list) => {
    const duplicates = list.filter(
      (p, i) =>
        i !== index &&
        p.fileRef.toLocaleUpperCase() === program.fileRef.toLocaleUpperCase() &&
        !duplicatePrograms.some(
          (d) =>
            d.fileName === p.fileName &&
            d.fileRef.toLocaleUpperCase() === p.fileRef.toLocaleUpperCase()
        )
    )
    duplicatePrograms.push(...duplicates)
  })
  const groupedDuplicates = groupBy(duplicatePrograms, (x) =>
    x.fileRef.toLocaleUpperCase()
  )
  let errorMessage = ''
  Object.keys(groupedDuplicates).forEach((fileRef) => {
    errorMessage += `The following files have duplicate fileref '${fileRef}':\n${groupedDuplicates[
      fileRef
    ]
      .map((d) => d.fileName)
      .join(', ')}\n`
  })
  throw new Error(errorMessage)
}

export function validateFileRef(fileRef: string): boolean {
  if (!fileRef) {
    throw new Error('Missing file ref.')
  }

  if (fileRef.length > 8) {
    throw new Error(
      'File ref is too long. File refs can have a maximum of 8 characters.'
    )
  }

  if (!/^[_a-zA-Z][_a-zA-Z0-9]*/.test(fileRef)) {
    throw new Error(
      'Invalid file ref. File refs can only start with a letter or an underscore, and contain only letters, numbers and underscores.'
    )
  }

  return true
}
