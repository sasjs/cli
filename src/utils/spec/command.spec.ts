import { Command } from '../command'

describe('parseCommandLine', () => {
  const defaultFlagNames = ['target']
  const defaultFlagValues = ['targetName']

  afterEach(() => {
    jest.resetAllMocks()
  })

  describe('folder command', () => {
    const expectedName = 'folder'
    let expectedValues = ['create', '/Public/folder']
    const expectedFlagNames = ['target', 'force']
    const expectedFlagValues = ['targetName', undefined]

    test('without flags', () => {
      const commandLine = 'folder create /Public/folder'

      const command = new Command(commandLine)

      expect(command.name).toEqual(expectedName)
      expect(command.values).toEqual(expectedValues)
    })

    test('full syntax', () => {
      const commandLine = 'folder create /Public/folder --target targetName'

      const command = new Command(commandLine)

      expect(command.name).toEqual(expectedName)
      expect(command.values).toEqual(expectedValues)
      expect(command.flags.map((flag) => flag.name)).toEqual(defaultFlagNames)
      expect(command.flags.map((f) => f.value)).toEqual(defaultFlagValues)
    })

    test('short syntax', () => {
      const commandLine = 'folder create /Public/folder -t targetName'

      const command = new Command(commandLine)

      expect(command.name).toEqual(expectedName)
      expect(command.values).toEqual(expectedValues)
      expect(command.flags.map((flag) => flag.name)).toEqual(defaultFlagNames)
      expect(command.flags.map((f) => f.value)).toEqual(defaultFlagValues)
    })

    test('short syntax with force flag', () => {
      const commandLine = 'folder create /Public/folder -t targetName -f'

      const command = new Command(commandLine)

      expect(command.name).toEqual(expectedName)
      expect(command.values).toEqual(expectedValues)
      expect(command.flags.map((flag) => flag.name)).toEqual(expectedFlagNames)
      expect(command.flags.map((f) => f.value)).toEqual(expectedFlagValues)
    })

    test('move command full syntax', () => {
      const commandLine =
        'folder move /Public/sourceFolder /Public/targetFolder --target targetName'

      expectedValues = ['move', '/Public/sourceFolder', '/Public/targetFolder']

      const command = new Command(commandLine)

      expect(command.name).toEqual(expectedName)
      expect(command.values).toEqual(expectedValues)
      expect(command.flags.map((flag) => flag.name)).toEqual(defaultFlagNames)
      expect(command.flags.map((f) => f.value)).toEqual(defaultFlagValues)
    })

    test('move command short syntax', () => {
      const commandLine =
        'folder move -t targetName /Public/sourceFolder /Public/targetFolder'

      const command = new Command(commandLine)

      expect(command.name).toEqual(expectedName)
      expect(command.values).toEqual(expectedValues)
      expect(command.flags.map((flag) => flag.name)).toEqual(defaultFlagNames)
      expect(command.flags.map((f) => f.value)).toEqual(defaultFlagValues)
    })

    test('move command without flags', () => {
      const commandLine =
        'folder move /Public/sourceFolder /Public/targetFolder'

      const command = new Command(commandLine)

      expect(command.name).toEqual(expectedName)
      expect(command.values).toEqual(expectedValues)
      expect(command.flags.map((flag) => flag.name)).toEqual([])
    })
  })

  describe('context command', () => {
    const expectedName = 'context'
    let expectedValues = ['create']
    let expectedFlagNames = ['source', 'target']
    let expectedFlagValues = ['../contextConfig.json', 'targetName']

    test('create command full syntax', () => {
      const commandLine =
        'context create --source ../contextConfig.json --target targetName'

      const command = new Command(commandLine)

      expect(command.name).toEqual(expectedName)
      expect(command.values).toEqual(expectedValues)
      expect(command.flags.map((flag) => flag.name)).toEqual(expectedFlagNames)
      expect(command.flags.map((f) => f.value)).toEqual(expectedFlagValues)
    })

    test('create command short syntax', () => {
      const commandLine =
        'context create -s ../contextConfig.json -t targetName'

      const command = new Command(commandLine)

      expect(command.name).toEqual(expectedName)
      expect(command.values).toEqual(expectedValues)
      expect(command.flags.map((flag) => flag.name)).toEqual(expectedFlagNames)
      expect(command.flags.map((f) => f.value)).toEqual(expectedFlagValues)
    })

    test('delete command short syntax', () => {
      const commandLine = 'context delete contextName -t targetName'

      const command = new Command(commandLine)

      expectedValues = ['delete', 'contextName']

      expect(command.name).toEqual(expectedName)
      expect(command.values).toEqual(expectedValues)
      expect(command.flags.map((flag) => flag.name)).toEqual(defaultFlagNames)
      expect(command.flags.map((f) => f.value)).toEqual(defaultFlagValues)
    })

    test('list command short syntax', () => {
      const commandLine = 'context list -t targetName'

      const command = new Command(commandLine)

      expectedValues = ['list']

      expect(command.name).toEqual(expectedName)
      expect(command.values).toEqual(expectedValues)
      expect(command.flags.map((flag) => flag.name)).toEqual(defaultFlagNames)
      expect(command.flags.map((f) => f.value)).toEqual(defaultFlagValues)
    })

    test('export command short syntax', () => {
      const commandLine = 'context export contextName -t targetName'

      const command = new Command(commandLine)

      expectedValues = ['export', 'contextName']

      expect(command.name).toEqual(expectedName)
      expect(command.values).toEqual(expectedValues)
      expect(command.flags.map((flag) => flag.name)).toEqual(defaultFlagNames)
      expect(command.flags.map((f) => f.value)).toEqual(defaultFlagValues)
    })
  })

  describe('create command', () => {
    const expectedName = 'create'
    const expectedValues = ['folderName']
    const expectedFlagNames = ['template']
    let expectedFlagValues = ['react']

    test('create command', () => {
      const commandLine = 'create'

      const command = new Command(commandLine)

      expect(command.name).toEqual(expectedName)
    })

    test('create command with folder name', () => {
      const commandLine = 'create folderName'

      const command = new Command(commandLine)

      expect(command.name).toEqual(expectedName)
      expect(command.values).toEqual(expectedValues)
    })

    test('create command with folder name and template full syntax', () => {
      const commandLine = 'create folderName --template react'

      const command = new Command(commandLine)

      expect(command.name).toEqual(expectedName)
      expect(command.values).toEqual(expectedValues)
      expect(command.flags.map((flag) => flag.name)).toEqual(expectedFlagNames)
      expect(command.flags.map((f) => f.value)).toEqual(expectedFlagValues)
    })

    test('create command with folder name and template short syntax', () => {
      const commandLine = 'create -t angular folderName'

      const command = new Command(commandLine)

      expectedFlagValues = ['angular']

      expect(command.name).toEqual(expectedName)
      expect(command.values).toEqual(expectedValues)
      expect(command.flags.map((flag) => flag.name)).toEqual(expectedFlagNames)
      expect(command.flags.map((f) => f.value)).toEqual(expectedFlagValues)
    })
  })

  describe('web command', () => {
    const expectedName = 'web'

    test('full syntax', () => {
      const commandLine = 'web --target targetName'

      const command = new Command(commandLine)

      expect(command.name).toEqual(expectedName)
      expect(command.flags.map((flag) => flag.name)).toEqual(defaultFlagNames)
      expect(command.flags.map((f) => f.value)).toEqual(defaultFlagValues)
    })

    test('alias', () => {
      const commandLine = 'w -t targetName'

      const command = new Command(commandLine)

      expect(command.name).toEqual(expectedName)
      expect(command.flags.map((flag) => flag.name)).toEqual(defaultFlagNames)
      expect(command.flags.map((f) => f.value)).toEqual(defaultFlagValues)
    })
  })

  describe('build-DB command', () => {
    const expectedName = 'build-DB'

    test('full syntax', () => {
      const commandLine = 'build-DB --target targetName'

      const command = new Command(commandLine)

      expect(command.name).toEqual(expectedName)
      expect(command.flags.map((flag) => flag.name)).toEqual(defaultFlagNames)
      expect(command.flags.map((f) => f.value)).toEqual(defaultFlagValues)
    })

    test('alias', () => {
      const commandLine = 'db -t targetName'

      const command = new Command(commandLine)

      expect(command.name).toEqual(expectedName)
      expect(command.flags.map((flag) => flag.name)).toEqual(defaultFlagNames)
      expect(command.flags.map((f) => f.value)).toEqual(defaultFlagValues)
    })
  })

  describe('compile command', () => {
    const expectedName = 'compile'

    test('full syntax', () => {
      const commandLine = 'compile --target targetName'

      const command = new Command(commandLine)

      expect(command.name).toEqual(expectedName)
      expect(command.flags.map((flag) => flag.name)).toEqual(defaultFlagNames)
      expect(command.flags.map((f) => f.value)).toEqual(defaultFlagValues)
    })

    test('alias', () => {
      const commandLine = 'c -t targetName'

      const command = new Command(commandLine)

      expect(command.name).toEqual(expectedName)
      expect(command.flags.map((flag) => flag.name)).toEqual(defaultFlagNames)
      expect(command.flags.map((f) => f.value)).toEqual(defaultFlagValues)
    })
  })

  describe('build command', () => {
    const expectedName = 'build'

    test('full syntax', () => {
      const commandLine = 'build --target targetName'

      const command = new Command(commandLine)

      expect(command.name).toEqual(expectedName)
      expect(command.flags.map((flag) => flag.name)).toEqual(defaultFlagNames)
      expect(command.flags.map((f) => f.value)).toEqual(defaultFlagValues)
    })

    test('alias', () => {
      const commandLine = 'b -t targetName'

      const command = new Command(commandLine)

      expect(command.name).toEqual(expectedName)
      expect(command.flags.map((flag) => flag.name)).toEqual(defaultFlagNames)
      expect(command.flags.map((f) => f.value)).toEqual(defaultFlagValues)
    })
  })

  describe('compilebuild command', () => {
    const expectedName = 'compilebuild'

    test('full syntax', () => {
      const commandLine = 'compilebuild --target targetName'

      const command = new Command(commandLine)

      expect(command.name).toEqual(expectedName)
      expect(command.flags.map((flag) => flag.name)).toEqual(defaultFlagNames)
      expect(command.flags.map((f) => f.value)).toEqual(defaultFlagValues)
    })

    test('alias', () => {
      const commandLine = 'cb -t targetName'

      const command = new Command(commandLine)

      expect(command.name).toEqual(expectedName)
      expect(command.flags.map((flag) => flag.name)).toEqual(defaultFlagNames)
      expect(command.flags.map((f) => f.value)).toEqual(defaultFlagValues)
    })
  })

  describe('deploy command', () => {
    const expectedName = 'deploy'

    test('full syntax', () => {
      const commandLine = 'deploy --target targetName'

      const command = new Command(commandLine)

      expect(command.name).toEqual(expectedName)
      expect(command.flags.map((flag) => flag.name)).toEqual(defaultFlagNames)
      expect(command.flags.map((f) => f.value)).toEqual(defaultFlagValues)
    })

    test('alias', () => {
      const commandLine = 'd -t targetName'

      const command = new Command(commandLine)

      expect(command.name).toEqual(expectedName)
      expect(command.flags.map((flag) => flag.name)).toEqual(defaultFlagNames)
      expect(command.flags.map((f) => f.value)).toEqual(defaultFlagValues)
    })
  })

  describe('compilebuilddeploy command', () => {
    const expectedName = 'compilebuilddeploy'

    test('full syntax', () => {
      const commandLine = 'compilebuilddeploy --target targetName'

      const command = new Command(commandLine)

      expect(command.name).toEqual(expectedName)
      expect(command.flags.map((flag) => flag.name)).toEqual(defaultFlagNames)
      expect(command.flags.map((f) => f.value)).toEqual(defaultFlagValues)
    })

    test('alias', () => {
      const commandLine = 'cbd -t targetName'

      const command = new Command(commandLine)

      expect(command.name).toEqual(expectedName)
      expect(command.flags.map((flag) => flag.name)).toEqual(defaultFlagNames)
      expect(command.flags.map((f) => f.value)).toEqual(defaultFlagValues)
    })
  })

  describe('servicepack command', () => {
    const expectedName = 'servicepack'
    const expectedValues = ['deploy']
    const expectedFlagNames = ['source', 'target']
    const expectedFlagValues = ['./path/services.json', 'targetName']

    test('full syntax', () => {
      const commandLine =
        'servicepack deploy --source ./path/services.json --target targetName'

      const command = new Command(commandLine)

      expect(command.name).toEqual(expectedName)
      expect(command.values).toEqual(expectedValues)
      expect(command.flags.map((flag) => flag.name)).toEqual(expectedFlagNames)
      expect(command.flags.map((f) => f.value)).toEqual(expectedFlagValues)
    })

    test('short syntax', () => {
      const commandLine =
        'servicepack deploy -s ./path/services.json -t targetName'

      const command = new Command(commandLine)

      expect(command.name).toEqual(expectedName)
      expect(command.values).toEqual(expectedValues)
      expect(command.flags.map((flag) => flag.name)).toEqual(expectedFlagNames)
      expect(command.flags.map((f) => f.value)).toEqual(expectedFlagValues)
    })
  })

  describe('run command', () => {
    const expectedName = 'run'
    const expectedValues = ['./sasFilePath.sas']

    test('full syntax', () => {
      const commandLine = 'run ./sasFilePath.sas --target targetName'

      const command = new Command(commandLine)

      expect(command.name).toEqual(expectedName)
      expect(command.values).toEqual(expectedValues)
      expect(command.flags.map((flag) => flag.name)).toEqual(defaultFlagNames)
      expect(command.flags.map((f) => f.value)).toEqual(defaultFlagValues)
    })

    test('alias', () => {
      const commandLine = 'r ./sasFilePath.sas -t targetName'

      const command = new Command(commandLine)

      expect(command.name).toEqual(expectedName)
      expect(command.values).toEqual(expectedValues)
      expect(command.flags.map((flag) => flag.name)).toEqual(defaultFlagNames)
      expect(command.flags.map((f) => f.value)).toEqual(defaultFlagValues)
    })
  })

  describe('request command', () => {
    const expectedName = 'request'
    const expectedValues = ['./sasFilePath.sas']
    const expectedFlagNames = ['datafile', 'configfile', 'target']
    const expectedFlagValues = [
      '<path/to/datafile>',
      '<path/to/configfile>',
      'targetName'
    ]

    test('full syntax', () => {
      const commandLine =
        'request ./sasFilePath.sas --datafile <path/to/datafile> --configfile <path/to/configfile> --target targetName'

      const command = new Command(commandLine)

      expect(command.name).toEqual(expectedName)
      expect(command.values).toEqual(expectedValues)
      expect(command.flags.map((flag) => flag.name)).toEqual(expectedFlagNames)
      expect(command.flags.map((f) => f.value)).toEqual(expectedFlagValues)
    })

    test('alias', () => {
      const commandLine =
        'rq ./sasFilePath.sas -d <path/to/datafile> -c <path/to/configfile> -t targetName'

      const command = new Command(commandLine)

      expect(command.name).toEqual(expectedName)
      expect(command.values).toEqual(expectedValues)
      expect(command.flags.map((flag) => flag.name)).toEqual(expectedFlagNames)
      expect(command.flags.map((f) => f.value)).toEqual(expectedFlagValues)
    })
  })

  describe('job command', () => {
    const expectedName = 'job'
    const expectedValues = ['execute', '/Public/job']

    test('full syntax', () => {
      const commandLine = 'job execute /Public/job --target targetName'

      const command = new Command(commandLine)

      expect(command.name).toEqual(expectedName)
      expect(command.values).toEqual(expectedValues)
      expect(command.flags.map((flag) => flag.name)).toEqual(defaultFlagNames)
      expect(command.flags.map((f) => f.value)).toEqual(defaultFlagValues)
    })

    test('short syntax', () => {
      const commandLine =
        'job execute /Public/job -t targetName -w -o ./output.json -l ./log.txt -s ./status.txt'

      const command = new Command(commandLine)

      const expectedFlagNames = [
        'target',
        'wait',
        'output',
        'logFile',
        'source'
      ]
      const expectedFlagValues = [
        'targetName',
        undefined,
        './output.json',
        './log.txt',
        './status.txt'
      ]

      expect(command.name).toEqual(expectedName)
      expect(command.values).toEqual(expectedValues)
      expect(command.flags.map((flag) => flag.name)).toEqual(expectedFlagNames)
      expect(command.flags.map((f) => f.value)).toEqual(expectedFlagValues)
    })
  })

  describe('doc command', () => {
    const expectedName = 'doc'
    const expectedFlagNames = ['target', 'outDirectory']
    const expectedFlagValues = ['targetName', '<path/to/folder>']

    test('full syntax', () => {
      const commandLine =
        'doc --target targetName --outDirectory <path/to/folder>'

      const command = new Command(commandLine)

      expect(command.name).toEqual(expectedName)
      expect(command.flags.map((flag) => flag.name)).toEqual(expectedFlagNames)
      expect(command.flags.map((f) => f.value)).toEqual(expectedFlagValues)
    })

    test('short syntax', () => {
      const commandLine = 'doc -t targetName --outDirectory <path/to/folder>'

      const command = new Command(commandLine)

      expect(command.name).toEqual(expectedName)
      expect(command.flags.map((flag) => flag.name)).toEqual(expectedFlagNames)
      expect(command.flags.map((f) => f.value)).toEqual(expectedFlagValues)
    })
  })

  test('not supported command', () => {
    const commandLine = 'notSupported command'

    const command = new Command(commandLine)

    expect(command.name).toEqual('')
    expect(command.values).toEqual([])
    expect(command.flags.map((flag) => flag.name)).toEqual([])
  })
})
