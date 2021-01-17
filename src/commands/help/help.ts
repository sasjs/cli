import chalk from 'chalk'

export async function printHelpText() {
  const commands = [
    {
      name: 'create',
      title: 'create <foldername>.',
      description: [
        `creates the folder structure specified in config.json, inside the provided parent folder e.g. ${chalk.cyanBright(
          'sasjs create my-sas-project'
        )}.`,
        `- if no foldername is specified, it creates the folder structure in the current working directory.`,
        `- If this is an existing NPM project, it will update package.json with the @sasjs/core dependency.`,
        `- An additional option can be specified to create a web app from a template. This supports creation of Angular, React and minimal web apps. There is also a sasonly option. e.g. ${chalk.cyanBright(
          'sasjs create my-sas-project --template react'
        )} and ${chalk.cyanBright('sasjs create my-sas-project -t angular')}`
      ],
      syntax: `creates the folder structure specified in config.json, inside the provided parent folder
        e.g. sasjs create my-sas-project
      - if no foldername is specified, it creates the folder structure in the current working directory.
      - If this is an existing NPM project, it will update package.json with the @sasjs/core dependency.
      - An additional option can be specified to create a web app from a template.
        This supports creation of Angular, React and minimal web apps.  There is also a sasonly option.
        e.g. ${chalk.cyanBright('sasjs create my-sas-project --template react')}
        ${chalk.cyanBright('sasjs create my-sas-project -t angular')}`
    },
    {
      name: 'version',
      title: 'version',
      description: [`displays currently installed version.`]
    },
    {
      name: 'help',
      title: 'help',
      description: [`displays this help text.`]
    },
    {
      name: 'web',
      title: 'web <targetName>',
      description: [
        `compiles the web app service and place at ${chalk.cyanBright(
          'webSourcePath'
        )}.`
      ]
    },
    {
      name: 'build-DB',
      title: 'build-DB <targetName>',
      description: [
        `compiles the dbfiles specified in the ${chalk.cyanBright(
          'db'
        )} folder.`
      ]
    },
    {
      name: 'compile',
      title: 'compile <targetName>',
      description: [
        `compiles the services specified in the ${chalk.cyanBright(
          'serviceFolders'
        )} property of the 'serviceConfig' in your target and common configuration.`
      ]
    },
    {
      name: 'build',
      title: 'build <targetName>',
      description: [
        `prepares a single deployment script (SAS9 or Viya program) per configuration`,
        `in sasjsconfig.json.`,
        `First Build (macro) variables are inserted, then all of the buildinit / buildterm dependencies,then the buildinit (a good place to source the Viya app tokens), then all of the compiled services are added, and finally the buildterm script (where you might perform additional deployment actions such as database build).`,
        `This SAS file could be executed as part of a web service (executed by the Deploy command) or simply copy pasted into Enterprise Guide or SAS Studio.`,
        `It will also perform ${chalk.greenBright(
          'compile'
        )} command if services are not compiled.`
      ]
    },
    {
      name: 'compilebuild',
      title: 'compilebuild <targetName>',
      description: [
        `compiles the services specified in the ${chalk.cyanBright(
          'serviceFolders'
        )}in the 'serviceConfig' in your target and common configurations.`,
        `It will also perform ${chalk.greenBright('build')} command.`
      ]
    },
    {
      name: 'deploy',
      title: 'deploy <targetName>',
      description: [
        `triggers a shell command as specified in the ${chalk.cyanBright(
          'deployScripts'
        )} property in your target's 'deployConfig' and the common 'deployConfig').`,
        `This command would perform tasks such as executing the deployment script, exporting the SPK, triggering tests etc.`,
        `The ${chalk.cyanBright(
          'deployScripts'
        )} specified in each target's 'deployConfig' can include an array of scripts.`,
        `Each script can be a SAS file or a shell script.`,
        `If it is a shell script, it is executed locally and the output is displayed on the command line.`,
        `If it is a SAS file, it is sent to the SAS server for execution.`,
        `To facilitate this, some configuration needs to be provided.`,
        `This configuration is different for SAS VIYA and SAS9 servers:`,
        `For SAS VIYA servers, the following items are required:`,
        `[2spaces]* ${chalk.cyanBright(
          'ACCESS_TOKEN'
        )} - An access token for performing operations with the SAS VIYA API.`,
        `If the target has been specified in your project's local sasjsconfig.json file, this token needs to be present in a '.env' file corresponding to your target's name.`,
        `So if your target was called 'viya-test', your '.env' file must be called '.env.viya-test'.`,
        `You can automatically generate an access token and add it to the correct .env file using the sasjs add or sasjs add cred commands.`,
        `[2spaces]* ${chalk.cyanBright(
          'contextName'
        )} - The name of the compute context that must be used to execute SAS code, e.g. "SharedCompute". This needs to be specified as part of the target JSON as the 'contextName' property.`,
        `For SAS9 servers, the following items are required to be specified in the target JSON:`,
        `[2spaces]* ${chalk.cyanBright(
          'serverName'
        )} - The name of the server where SAS code will be executed, e.g. "SASApp".`,
        `[2spaces]* ${chalk.cyanBright(
          'repositoryName'
        )} - The metadata repository, e.g. "Foundation".`,
        `In addition the following variables must be set:`,
        `[2spaces]* ${chalk.cyanBright(
          'serverUrl'
        )} - The full path to the server (eg https://yourserver)`,
        `[2spaces]* ${chalk.cyanBright('serverType')} - Eg SAS9 or SASVIYA`,
        `NOTE: By default deploy will overwrite an existing deploy (force deploy).`
      ]
    },
    {
      name: 'compilebuilddeploy',
      title: 'compilebuilddeploy <targetName>',
      description: [
        `executes script file specified in the ${chalk.cyanBright(
          'deployScripts'
        )} property in the target and common 'deployConfig'`,
        `It will also perform ${chalk.greenBright('compilebuild')} command.`,
        ``,
        `NOTE: If no target name is specified/matched, it will build the first target present in config.json.`,
        `NOTE: By default deploy will overwrite an existing deploy (force deploy).`
      ]
    },
    {
      name: 'servicepack',
      title: 'servicepack <targetName>',
      description: [
        `performs operations on Service Packs (collections of jobs & folders).`,
        `* ${chalk.cyanBright(
          'deploy'
        )} - deploys service pack from json file.`,
        `[2spaces]command example: sasjs servicepack deploy --source ./path/services.json --target targetName`,
        ``,
        `[4spaces]You can force deploy (overwrite an existing deploy) by passing the (-f) flag.`,
        `[4spaces]Default target name will be used if target name was omitted.`,
        ``,
        `NOTE: The sasjs servicepack operation is only supported for SAS Viya build targets.`,
        `More information available in the online documentation: ${chalk.cyanBright(
          'https://sasjs.io/sasjs-cli-servicepack'
        )}`
      ]
    },
    {
      name: 'context',
      title: 'context <targetName>',
      description: [
        `performs operations on contexts.`,
        `* ${chalk.cyanBright('create')} - creates new context.`,
        `[2spaces]command example: sasjs context create --source ../contextConfig.json --target targetName`,
        `* ${chalk.cyanBright('edit')} - edits existing context.`,
        `[2spaces]command example: sasjs context edit contextName --source ../contextConfig.json --target targetName`,
        `* ${chalk.cyanBright('delete')} - deletes existing context.`,
        `[2spaces]command example: sasjs context delete contextName --target targetName`,
        `* ${chalk.cyanBright(
          'list'
        )} - lists all accessible and inaccessible contexts.`,
        `[2spaces]command example: sasjs context list --target targetName`,
        `* ${chalk.cyanBright(
          'export'
        )} - exports context to contextName.json in the current folder.`,
        `[2spaces]command example: sasjs context export contextName --target targetName`,
        `[2spaces]exported context example:
        [4spaces]{
          [4spaces]"createdBy": "admin",
          [4spaces]"links": [...],
          [4spaces]"id": "id...",
          [4spaces]"version": 2,
          [4spaces]"name": "Compute Context"
        [4spaces]}`,
        ``,
        `NOTE: The sasjs context operation is only supported for SAS Viya build targets. More information available in the online documentation: ${chalk.cyanBright(
          'https://sasjs.io/sasjs-cli-context'
        )}`
      ]
    },
    {
      name: 'add',
      title: 'add',
      description: [
        `lets the user add a build target to either the local project configuration, or to the global .sasjsrc file.`,
        ``,
        `NOTE: This command requires the user to input all the required parameters. More information available in the online documentation: ${chalk.cyanBright(
          'https://sasjs.io/sasjs-cli-add'
        )}`
      ]
    },
    {
      name: 'run',
      title: 'run <sasFilePath> -t <targetName>',
      description: [
        `lets the user run a given SAS file against a specified target.`,
        `The target can exist either in the local project configuration or in the global .sasjsrc file.`
      ]
    },
    {
      name: 'request',
      title:
        'request <sasProgramPath> -d <path/to/datafile> -c <path/to/configfile> -t <targetName>',
      description: [
        `lets`,
        `the user run a SAS job against a specified target.`,
        `The target can exist either in the local project configuration or in the global .sasjsrc file.`,
        `<sasProgramPath> - if this has a leading slash (eg /Public/app/folder/servicename) then it must be the full path. If it is a relative path (eg path/servicename) then it will be pre-pended with the appLoc - which must then be defined in the sasjs config.`
      ]
    },
    {
      name: 'folder',
      title: 'folder <command>',
      description: [
        `performs operations on folders.`,
        `* ${chalk.cyanBright('create')} - creates new folder.`,
        `[2spaces]command example: sasjs folder create /Public/folder -t targetName -f`,
        ``,
        `[2spaces]NOTE: Providing force flag (-f or --force) is optional. If provided and target folder already exists, its content and all subfolders will be deleted.`,
        ``,
        `* ${chalk.cyanBright('delete')} - deletes folder.`,
        `[2spaces]command example: sasjs folder delete /Public/folder --target targetName`,
        ``,
        `* ${chalk.cyanBright('move')} - moves folder to a new location`,
        `[2spaces]command example: sasjs folder move /Public/sourceFolder /Public/targetFolder --target targetName`
      ]
    },
    {
      name: 'job',
      title: 'job <command>',
      description: [
        `performs operations on jobs.`,
        `[2spaces]* ${chalk.cyanBright(
          'execute'
        )} - triggers job for execution.`,
        `[2spaces]command example: sasjs job execute /Public/job -t targetName --output ./outputFolder/output.json --returnStatusOnly --ignoreWarnings`,
        `[2spaces]command example: sasjs job execute /Public/job -t targetName --wait --log ./logFolder/log.json -r -i`,
        ``,
        `[2spaces]NOTE: Providing wait flag (--wait or -w) is optional. If present, CLI will wait for job completion.`,
        `[2spaces]NOTE: Providing output flag (--output or -o) is optional. If present, CLI will immediately print out the response JSON. If value is provided, it will be treated as file path to save the response JSON.`,
        `[2spaces]NOTE: Providing log flag (--log or -l) is optional. If present, CLI will fetch and save job log to local file.`,
        `[2spaces]NOTE: Providing return status only (--returnStatusOnly or -r) flag is optional. If present and wait flag is provided, CLI will job status only (0 = success, 1 = warning, 2 = error).`,
        `[2spaces]NOTE: Providing ignore warnings (--ignoreWarnings or -i) flag is optional. If present and return status only is provided, CLI will return status '0', when the job state is warning.`
      ]
    },
    {
      name: 'flow',
      title: 'flow <command>',
      description: [
        `performs operations on flows of jobs.`,
        `[2spaces]* ${chalk.cyanBright(
          'execute'
        )} - triggers flow for execution.`,
        `[2spaces]command example: sasjs flow execute --source /local/flow.json --logFolder /local/log/folder --csvFile /local/some.csv`
      ]
    },
    {
      name: 'doc',
      title: 'doc <command>',
      description: [
        `Generates docs for all SAS Programs / Macros / Jobs / Services listed in the sasjsconfig.json file by default. If a target is provided, the generated docs will ignore content from the other targets.`,
        `[2spaces]command example: sasjs doc -t <targetName> --outDirectory <sasFilePath>`,
        `[2spaces]NOTE: Providing outDirectory flag is optional. If not present, CLI will generate docs in the sasjsbuild/docs directory.`,
        `The target can exist either in the local project configuration or in the global .sasjsrc file.`
      ]
    }
  ]

  const aliases = [
    { name: 'doc', aliases: ['docs'] },
    { name: 'build-DB', aliases: ['DB', 'db'] },
    { name: 'build', aliases: ['b'] },
    { name: 'compile', aliases: ['c'] },
    { name: 'compilebuild', aliases: ['cb'] },
    { name: 'deploy', aliases: ['d'] },
    { name: 'compilebuilddeploy', aliases: ['cbd'] },
    { name: 'web', aliases: ['w'] },
    { name: 'version', aliases: ['-version', '--version', '-v', '--v', 'v'] },
    { name: 'help', aliases: ['--help', '-help', '-h', '--h', 'h'] },
    { name: 'add', aliases: ['a'] },
    { name: 'run', aliases: ['r'] },
    { name: 'request', aliases: ['rq'] }
  ]

  const outputCommands = `${commands
    .sort((a, b) => (a.name < b.name ? -1 : 1))
    .map(
      (command) =>
        `* ${chalk.greenBright(
          limitLineLength(command.title)
        )} - ${command.description
          .map((line) => limitLineLength(line))
          .join(`\n\t`)}`
    ).join(`
  `)}`

  const outputAliases = `${aliases
    .sort((a, b) => (a.name < b.name ? -1 : 1))
    .map(
      (alias) =>
        `* ${chalk.greenBright(alias.name)} : ${alias.aliases
          .sort((a, b) => (a > b ? -1 : 1))
          .join(', ')}`
    ).join(`
  `)}`

  console.log(`
  ${chalk.yellow.bold('Welcome to the Command Line Interface for SASjs!')}

  ${chalk.cyan('Here are the commands currently available:')}
  ${outputCommands}


  ${limitLineLength(
    'GENERAL NOTE: Providing target name (--target targetName or -t targetName) is optional. [6spaces]Default target name will be used if target name was omitted.'
  )}

  ${chalk.cyan('Alias commands:')}
  ${outputAliases}
  `)

  return { outputCommands, outputAliases }
}

const limitLineLength = (str: string, maxLength = 80) => {
  const words = str.split(' ')
  const lines = []
  let line = ''

  while (words.length) {
    while (line.length <= maxLength && words.length) {
      let word = words.shift()
      if (!word) {
        return
      }
      let spaces

      if (word.match(/\[\dspaces\]/)?.length) {
        spaces = word.match(/\[\dspaces\]/)![0].match(/\d/)![0]
      }

      word = spaces
        ? ' '.repeat(spaces.length) + word.split(`[${spaces}spaces]`).join('')
        : word

      line += line.length ? ' ' + word : word
    }

    lines.push(line)

    line = ''
  }

  return lines.join(`\n\t  `)
}
