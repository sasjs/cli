import { parseCommandLine } from '../src/utils/commandLine/utils'

describe('parseCommandLine', () => {
  describe('folder command', () => {
    test('without flags', () => {
      const command = 'folder create /Public/folder'.split(' ')

      const expectedOutput = {
        commandValues: ['create', '/Public/folder']
      }

      expect(parseCommandLine(command)).toEqual(expectedOutput)
    })

    test('full syntax', () => {
      const command = 'folder create /Public/folder --target targetName'.split(
        ' '
      )

      const expectedOutput = {
        commandValues: ['create', '/Public/folder'],
        flagValues: [{ target: 'targetName' }]
      }

      expect(parseCommandLine(command)).toEqual(expectedOutput)
    })

    test('short syntax', () => {
      const command = 'folder create /Public/folder -t targetName'.split(' ')

      const expectedOutput = {
        commandValues: ['create', '/Public/folder'],
        flagValues: [{ target: 'targetName' }]
      }

      expect(parseCommandLine(command)).toEqual(expectedOutput)
    })

    test('short syntax with force flag', () => {
      const command = 'folder create /Public/folder -t targetName -f'.split(' ')

      const expectedOutput = {
        commandValues: ['create', '/Public/folder'],
        flagValues: [{ target: 'targetName' }, 'force']
      }

      expect(parseCommandLine(command)).toEqual(expectedOutput)
    })

    test('move command full syntax', () => {
      const command = 'folder move /Public/sourceFolder /Public/targetFolder --target targetName'.split(
        ' '
      )

      const expectedOutput = {
        commandValues: ['move', '/Public/sourceFolder', '/Public/targetFolder'],
        flagValues: [{ target: 'targetName' }]
      }

      expect(parseCommandLine(command)).toEqual(expectedOutput)
    })

    test('move command short syntax', () => {
      const command = 'folder move -t targetName /Public/sourceFolder /Public/targetFolder'.split(
        ' '
      )

      const expectedOutput = {
        commandValues: ['move', '/Public/sourceFolder', '/Public/targetFolder'],
        flagValues: [{ target: 'targetName' }]
      }

      expect(parseCommandLine(command)).toEqual(expectedOutput)
    })

    test('move command without flags', () => {
      const command = 'folder move /Public/sourceFolder /Public/targetFolder'.split(
        ' '
      )

      const expectedOutput = {
        commandValues: ['move', '/Public/sourceFolder', '/Public/targetFolder']
      }

      expect(parseCommandLine(command)).toEqual(expectedOutput)
    })
  })

  describe('context command', () => {
    test('create command full syntax', () => {
      const command = 'context create --source ../contextConfig.json --target targetName'.split(
        ' '
      )

      const expectedOutput = {
        commandValues: ['create'],
        flagValues: [
          { source: '../contextConfig.json' },
          { target: 'targetName' }
        ]
      }

      expect(parseCommandLine(command)).toEqual(expectedOutput)
    })

    test('create command short syntax', () => {
      const command = 'context create -s ../contextConfig.json -t targetName'.split(
        ' '
      )

      const expectedOutput = {
        commandValues: ['create'],
        flagValues: [
          { source: '../contextConfig.json' },
          { target: 'targetName' }
        ]
      }

      expect(parseCommandLine(command)).toEqual(expectedOutput)
    })

    test('delete command short syntax', () => {
      const command = 'context delete contextName -t targetName'.split(' ')

      const expectedOutput = {
        commandValues: ['delete', 'contextName'],
        flagValues: [{ target: 'targetName' }]
      }

      expect(parseCommandLine(command)).toEqual(expectedOutput)
    })

    test('list command short syntax', () => {
      const command = 'context list -t targetName'.split(' ')

      const expectedOutput = {
        commandValues: ['list'],
        flagValues: [{ target: 'targetName' }]
      }

      expect(parseCommandLine(command)).toEqual(expectedOutput)
    })

    test('export command short syntax', () => {
      const command = 'context export contextName -t targetName'.split(' ')

      const expectedOutput = {
        commandValues: ['export', 'contextName'],
        flagValues: [{ target: 'targetName' }]
      }

      expect(parseCommandLine(command)).toEqual(expectedOutput)
    })
  })

  describe('create command', () => {
    test('create command', () => {
      const command = 'create'.split(' ')

      const expectedOutput = {}

      expect(parseCommandLine(command)).toEqual(expectedOutput)
    })

    test('create command with folder name', () => {
      const command = 'create folderName'.split(' ')

      const expectedOutput = { commandValues: ['folderName'] }

      expect(parseCommandLine(command)).toEqual(expectedOutput)
    })

    test('create command with folder name and template full syntax', () => {
      const command = 'create my-sas-project --template react'.split(' ')

      const expectedOutput = {
        commandValues: ['my-sas-project'],
        flagValues: [{ template: 'react' }]
      }

      expect(parseCommandLine(command)).toEqual(expectedOutput)
    })

    test('create command with folder name and template short syntax', () => {
      const command = 'create -t angular my-sas-project'.split(' ')

      const expectedOutput = {
        commandValues: ['my-sas-project'],
        flagValues: [{ template: 'angular' }]
      }

      expect(parseCommandLine(command)).toEqual(expectedOutput)
    })
  })

  describe('web command', () => {
    test('full syntax', () => {
      const command = 'web --target targetName'.split(' ')

      const expectedOutput = { flagValues: [{ target: 'targetName' }] }

      expect(parseCommandLine(command)).toEqual(expectedOutput)
    })

    test('alias', () => {
      const command = 'w -t targetName'.split(' ')

      const expectedOutput = { flagValues: [{ target: 'targetName' }] }

      expect(parseCommandLine(command)).toEqual(expectedOutput)
    })
  })

  describe('build-DB command', () => {
    test('full syntax', () => {
      const command = 'build-DB --target targetName'.split(' ')

      const expectedOutput = { flagValues: [{ target: 'targetName' }] }

      expect(parseCommandLine(command)).toEqual(expectedOutput)
    })

    test('alias', () => {
      const command = 'db -t targetName'.split(' ')

      const expectedOutput = { flagValues: [{ target: 'targetName' }] }

      expect(parseCommandLine(command)).toEqual(expectedOutput)
    })
  })

  describe('compile command', () => {
    test('full syntax', () => {
      const command = 'compile --target targetName'.split(' ')

      const expectedOutput = { flagValues: [{ target: 'targetName' }] }

      expect(parseCommandLine(command)).toEqual(expectedOutput)
    })

    test('alias', () => {
      const command = 'c -t targetName'.split(' ')

      const expectedOutput = { flagValues: [{ target: 'targetName' }] }

      expect(parseCommandLine(command)).toEqual(expectedOutput)
    })
  })

  describe('build command', () => {
    test('full syntax', () => {
      const command = 'build --target targetName'.split(' ')

      const expectedOutput = { flagValues: [{ target: 'targetName' }] }

      expect(parseCommandLine(command)).toEqual(expectedOutput)
    })

    test('alias', () => {
      const command = 'b -t targetName'.split(' ')

      const expectedOutput = { flagValues: [{ target: 'targetName' }] }

      expect(parseCommandLine(command)).toEqual(expectedOutput)
    })
  })

  describe('compilebuild command', () => {
    test('full syntax', () => {
      const command = 'compilebuild --target targetName'.split(' ')

      const expectedOutput = { flagValues: [{ target: 'targetName' }] }

      expect(parseCommandLine(command)).toEqual(expectedOutput)
    })

    test('alias', () => {
      const command = 'cb -t targetName'.split(' ')

      const expectedOutput = { flagValues: [{ target: 'targetName' }] }

      expect(parseCommandLine(command)).toEqual(expectedOutput)
    })
  })

  describe('deploy command', () => {
    test('full syntax', () => {
      const command = 'deploy --target targetName'.split(' ')

      const expectedOutput = { flagValues: [{ target: 'targetName' }] }

      expect(parseCommandLine(command)).toEqual(expectedOutput)
    })

    test('alias', () => {
      const command = 'd -t targetName'.split(' ')

      const expectedOutput = { flagValues: [{ target: 'targetName' }] }

      expect(parseCommandLine(command)).toEqual(expectedOutput)
    })
  })

  describe('compilebuilddeploy command', () => {
    test('full syntax', () => {
      const command = 'compilebuilddeploy --target targetName'.split(' ')

      const expectedOutput = { flagValues: [{ target: 'targetName' }] }

      expect(parseCommandLine(command)).toEqual(expectedOutput)
    })

    test('alias', () => {
      const command = 'cbd -t targetName'.split(' ')

      const expectedOutput = { flagValues: [{ target: 'targetName' }] }

      expect(parseCommandLine(command)).toEqual(expectedOutput)
    })
  })

  describe('servicepack command', () => {
    test('full syntax', () => {
      const command = 'servicepack deploy --source ./path/services.json --target targetName'.split(
        ' '
      )

      const expectedOutput = {
        commandValues: ['deploy'],
        flagValues: [
          { source: './path/services.json' },
          { target: 'targetName' }
        ]
      }

      expect(parseCommandLine(command)).toEqual(expectedOutput)
    })

    test('short syntax', () => {
      const command = 'servicepack deploy -s ./path/services.json -t targetName'.split(
        ' '
      )

      const expectedOutput = {
        commandValues: ['deploy'],
        flagValues: [
          { source: './path/services.json' },
          { target: 'targetName' }
        ]
      }

      expect(parseCommandLine(command)).toEqual(expectedOutput)
    })
  })

  describe('run command', () => {
    test('full syntax', () => {
      const command = 'run ./sasFilePath.sas --target targetName'.split(' ')

      const expectedOutput = {
        commandValues: ['./sasFilePath.sas'],
        flagValues: [{ target: 'targetName' }]
      }

      expect(parseCommandLine(command)).toEqual(expectedOutput)
    })

    test('alias', () => {
      const command = 'r ./sasFilePath.sas -t targetName'.split(' ')

      const expectedOutput = {
        commandValues: ['./sasFilePath.sas'],
        flagValues: [{ target: 'targetName' }]
      }

      expect(parseCommandLine(command)).toEqual(expectedOutput)
    })
  })

  describe('request command', () => {
    test('full syntax', () => {
      const command = 'request ./sasFilePath.sas --datafile <path/to/datafile> --configfile <path/to/configfile> --target targetName'.split(
        ' '
      )

      const expectedOutput = {
        commandValues: ['./sasFilePath.sas'],
        flagValues: [
          { datafile: '<path/to/datafile>' },
          { configfile: '<path/to/configfile>' },
          { target: 'targetName' }
        ]
      }

      expect(parseCommandLine(command)).toEqual(expectedOutput)
    })

    test('alias', () => {
      const command = 'rq ./sasFilePath.sas -d <path/to/datafile> -c <path/to/configfile> -t targetName'.split(
        ' '
      )

      const expectedOutput = {
        commandValues: ['./sasFilePath.sas'],
        flagValues: [
          { datafile: '<path/to/datafile>' },
          { configfile: '<path/to/configfile>' },
          { target: 'targetName' }
        ]
      }

      expect(parseCommandLine(command)).toEqual(expectedOutput)
    })
  })

  describe('job command', () => {
    test('full syntax', () => {
      const command = 'job execute /Public/job --target targetName'.split(' ')

      const expectedOutput = {
        commandValues: ['execute', '/Public/job'],
        flagValues: [{ target: 'targetName' }]
      }

      expect(parseCommandLine(command)).toEqual(expectedOutput)
    })

    test('short syntax', () => {
      const command = 'job execute -t targetName -w -o /Public/job'.split(' ')

      const expectedOutput = {
        commandValues: ['execute', '/Public/job'],
        flagValues: [{ target: 'targetName' }, 'wait', 'output']
      }

      expect(parseCommandLine(command)).toEqual(expectedOutput)
    })
  })
})
