import { displayResult } from '../../utils/displayResult'
import { fileExists, readFile, isJsonFile } from '../../utils/file-utils'
import { getAccessToken } from '../../utils/config-utils'
import SASjs from '@sasjs/adapter/node'

export async function execute(
  source,
  logFolder,
  csvFile,
  target,
  prefixAppLoc
) {
  console.log(`[{source,logFolder,csvFile,target}]`, {
    source,
    logFolder,
    csvFile
  })

  const commandExample = `sasjs flow execute --source /local/flow.json --logFolder /local/log/folder --csvFile /local/some.csv --target targetName`

  if (!source || !isJsonFile(source)) {
    displayResult(
      {},
      `Please provide flow source (--source) file.\nCommand example: ${commandExample}`
    )

    return false
  }

  if (!(await fileExists(source))) {
    displayResult(
      true,
      `Source file does not exist.\nCommand example: ${commandExample}`
    )

    return false
  }

  let sourceConfig = await readFile(source)

  try {
    sourceConfig = JSON.parse(sourceConfig)
  } catch (error) {
    throw `Invalid json file.`
  }

  let flows = sourceConfig.flows

  if (!flows) {
    displayResult(
      true,
      `Source file is not valid. Source file example:
{
  "name": "myAmazingFlow",
  "flows": {
    "firstFlow": {
      "jobs": [
        {
          "location": "/Projects/job1"
        },
        {
          "location": "/Projects/job2"
        },
        {
          "location": "/Projects/job3"
        }
      ],
      "predecessors": []
    },
    "secondFlow": {
      "jobs": [
        {
          "location": "/Projects/job11"
        }
      ],
      "predecessors": [
        "firstFlow"
      ]
    },
    "anotherFlow": {
      "jobs": [
        {
          "location": "/Public/job15"
        }
      ],
      "predecessors": [
        "firstFlow",
        "secondFlow"
      ]
    },
    "yetAnotherFlow": {
      "jobs": [
        {
          "location": "/Public/job115"
        }
      ],
      "predecessors": []
    }
  }
}`
    )

    return false
  }

  const sasjs = new SASjs({
    serverUrl: target.serverUrl,
    appLoc: target.appLoc,
    serverType: target.serverType
  })
  const accessToken = await getAccessToken(target).catch((err) => {
    displayResult(err)
  })

  Object.keys(flows).forEach((flowName) => {
    const flow = flows[flowName]
    console.log(`[flow]`, flow)

    if (!flow.jobs || !Array.isArray(flow.jobs)) return

    if (flow.predecessors && flow.predecessors.length) {
    } else {
      flow.jobs.forEach((job) => {
        sasjs
          .startComputeJob(
            prefixAppLoc(target.appLoc, job.location),
            null,
            {
              contextName: target.tgtDeployVars.contextName
            },
            accessToken,
            true
          )
          .then((res) => {
            console.log(`[res]`, res)
          })
          .catch((err) => {
            displayResult(
              err,
              'An error has occurred when executing a job.',
              null
            )
          })
      })
    }
  })
}
