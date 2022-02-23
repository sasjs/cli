import { SasFileType, getAllFolders } from '../getAllFolders'
import { Target, readFile, ServerType, Configuration } from '@sasjs/utils'
import { generateTestTarget } from '../../../../utils/test'
import * as configUtils from '../../../../utils/config'
import { setConstants } from '../../../../utils'
import path from 'path'

describe('getAllFolders', () => {
  let config: Configuration
  let target: Target

  beforeAll(async () => {
    await setConstants()
    ;({ config } = JSON.parse(
      await readFile(
        path.join(__dirname, '..', '..', '..', '..', 'config.json')
      )
    ))
    config.jobConfig = {
      jobFolders: ['sasjs/targets/viya/jobs'],
      initProgram: '',
      termProgram: '',
      macroVars: {}
    }

    const temp: Target = generateTestTarget(
      'testTarget',
      '/Public/app',
      {
        serviceFolders: [
          path.join('sasjs', 'targetServices'),
          config.serviceConfig?.serviceFolders[0]! // duplicate
        ],
        initProgram: '',
        termProgram: '',
        macroVars: {}
      },
      ServerType.SasViya,
      {
        jobFolders: [
          path.join('sasjs', 'targetJobs'),
          config.jobConfig?.jobFolders[0]! // duplicate
        ],
        initProgram: '',
        termProgram: '',
        macroVars: {}
      }
    )
    target = new Target({
      ...temp.toJson()
    })
  })

  beforeAll(async () => {})

  it('should get all service and job folders', async () => {
    jest
      .spyOn(configUtils, 'getLocalOrGlobalConfig')
      .mockImplementation(async () =>
        Promise.resolve({
          configuration: config,
          isLocal: true
        })
      )

    const { buildSourceFolder } = process.sasjsConstants

    await expect(
      getAllFolders(target, SasFileType.Service, config)
    ).resolves.toEqual([
      ...new Set(
        Array.prototype.concat(
          config.serviceConfig?.serviceFolders.map((folder: string) =>
            path.join(buildSourceFolder, folder)
          ),
          target.serviceConfig?.serviceFolders.map((folder: string) =>
            path.join(buildSourceFolder, folder)
          )
        )
      )
    ])

    await expect(
      getAllFolders(target, SasFileType.Job, config)
    ).resolves.toEqual([
      ...new Set(
        Array.prototype.concat(
          config.jobConfig?.jobFolders.map((folder: string) =>
            path.join(buildSourceFolder, folder)
          ),
          target.jobConfig?.jobFolders.map((folder: string) =>
            path.join(buildSourceFolder, folder)
          )
        )
      )
    ])
  })
})
