import chalk from 'chalk'

export async function printHelpText() {
  console.log(`
    ${chalk.yellow.bold('Welcome to the Command Line Interface for SASjs!')}

    ${chalk.cyan('Here are commands currently available:')}
    * ${chalk.greenBright(
      'create <foldername>'
    )} - creates the folder structure specified in config.json, inside the provided parent folder
          e.g. sasjs create my-sas-project
        - if no foldername is specified, it creates the folder structure in the current working directory.
        - If this is an existing NPM project, it will update package.json with the @sasjs/core dependency.
        - An additional option can be specified to create a web app from a template.
          This supports creation of Angular, React and minimal web apps.  There is also a sasonly option.
          e.g. ${chalk.cyanBright(
            'sasjs create my-sas-project --template react'
          )}
          ${chalk.cyanBright('sasjs create my-sas-project -t angular')}
    * ${chalk.greenBright('help')} - displays this help text
    * ${chalk.greenBright('version')} - displays currenlty installed version
    * ${chalk.greenBright(
      'web <targetName>'
    )} - compiles the web app service and place at ${chalk.cyanBright(
    'webSourcePath'
  )}.
    * ${chalk.greenBright(
      'build-DB <targetName>'
    )} - compiles the dbfiles specified in the ${chalk.cyanBright('db')} folder.
    * ${chalk.greenBright(
      'compile <targetName>'
    )} - compiles the services specified in the ${chalk.cyanBright(
    'cmnServices'
  )} and ${chalk.cyanBright('tgtServices')}
    * ${chalk.greenBright(
      'build <targetName>'
    )} - Prepares a single deployment script (SAS9 or Viya program) per configuration in sasjsconfig.json.
        First Build (macro) variables are inserted, then all of the buildinit / buildterm dependencies,
          then the buildinit (a good place to source the Viya app tokens), then all of the compiled
          services are added, and finally the buildterm script (where you might perform additional
          deployment actions such as database build).
        This SAS file could be executed as part of a web service (executed by the Deploy command)
          or simply copy pasted into Enterprise Guide or SAS Studio.
        It will also perform ${chalk.greenBright(
          'compile'
        )} command if services are not compiled.
    * ${chalk.greenBright(
      'compilebuild <targetName>'
    )} - compiles the services specified in the ${chalk.cyanBright(
    'cmnServices'
  )} and ${chalk.cyanBright('tgtServices')}
        It will also perform ${chalk.greenBright('build')} command.
    * ${chalk.greenBright(
      'deploy <targetName>'
    )} - Triggers a shell command as specified in ${chalk.cyanBright(
    'tgtDeployScripts'
  )} (or ${chalk.cyanBright('cmnDeployScript')}).
        This command would perform tasks such as executing the deployment script, exporting the SPK, triggering tests etc.
        The ${chalk.cyanBright(
          'tgtDeployScripts'
        )} specified for each target can include an array of scripts.
        Each script can be a SAS file or a shell script.
        If it is a shell script, it is executed locally and the output is displayed on the command line.
        If it is a SAS file, it is sent to the SAS server for execution.
        To facilitate this, some configuration needs to be provided as part of the build target as ${chalk.cyanBright(
          'tgtDeployVars'
        )}.
        This configuration is different for SAS VIYA and SAS9 servers:
        For SAS VIYA servers, the following items are required in the ${chalk.cyanBright(
          'tgtDeployVars'
        )}:
          * ${chalk.cyanBright(
            'access_token'
          )} - An access token for performing operations with the SAS VIYA API.
          * ${chalk.cyanBright(
            'contextName'
          )} - The name of the compute context that must be used to execute SAS code, e.g. "SharedCompute".
        For SAS9 servers, the following items are required in the ${chalk.cyanBright(
          'tgtDeployVars'
        )}:
          * ${chalk.cyanBright(
            'serverName'
          )} - The name of the server where SAS code will be executed, e.g. "SASApp".
          * ${chalk.cyanBright(
            'repositoryName'
          )} - The metadata repository, e.g. "Foundation".
          In addition the following variables must be set:
          * ${chalk.cyanBright(
            'serverUrl'
          )} - The full path to the server (eg https://yourserver)
          * ${chalk.cyanBright('serverType')} - Eg SAS9 or SASVIYA
    * ${chalk.greenBright(
      'compilebuilddeploy <targetName>'
    )} - executes script file specified in the ${chalk.cyanBright(
    'cmnDeployScript'
  )} OR ${chalk.cyanBright('tgtDeployScript')}
        It will also perform ${chalk.greenBright('compilebuild')} command.

      NOTE: If no target name is specified/matched, it will build the first target present in config.json.

    * ${chalk.greenBright(
      'servicepack <command>'
    )} - performs operations on Service Packs (collections of jobs & folders).
        * ${chalk.cyanBright('deploy')} - deploys service pack from json file.
          command example: sasjs servicepack deploy -s ./path/services.json -t targetName
          command example: sasjs servicepack deploy --source ./path/services.json --target targetName

          NOTE: Providing target name (--target targetName or -t targetName) is optional.
                By default deploy will overwrite an existing deploy (force deploy).
                Default target name will be used if target name was omitted.

      NOTE: The sasjs servicepack operation is only supported for SAS Viya build targets.
            More information available in the online documentation: https://sasjs.io/sasjs-cli-servicepack


    * ${chalk.greenBright(
      'context <command>'
    )} - performs operations on contexts.
        * ${chalk.cyanBright('create')} - creates new context.
          command example: sasjs context create --source ../contextConfig.json --target targetName
          command example: sasjs context create -s ../contextConfig.json -t targetName
          NOTE: Providing target name (--target targetName or -t targetName) is optional.
                Default target name will be used if target name was omitted.

        * ${chalk.cyanBright('edit')} - edits existing context.
          command example: sasjs context edit contextName --source ../contextConfig.json --target targetName
          command example: sasjs context edit contextName -s ../contextConfig.json -t targetName
          NOTE: Providing target name (--target targetName or -t targetName) is optional.
                Default target name will be used if target name was omitted.

        * ${chalk.cyanBright('delete')} - deletes existing context.
          command example: sasjs context delete contextName --target targetName
          command example: sasjs context delete contextName -t targetName
          NOTE: Providing target name (--target targetName or -t targetName) is optional.
                Default target name will be used if target name was omitted.
        * ${chalk.cyanBright(
          'list'
        )} - lists all accessible and inaccessible contexts.
          command example: sasjs context list --target targetName
          command example: sasjs context list -t targetName
          NOTE: Providing target name (--target targetName or -t targetName) is optional.
                Default target name will be used if target name was omitted.
        * ${chalk.cyanBright(
          'export'
        )} - exports context to contextName.json in the current folder.
          command example: sasjs context export contextName --target targetName
          command example: sasjs context export contextName -t targetName
          NOTE: Providing target name (--target targetName or -t targetName) is optional.
                Default target name will be used if target name was omitted.

          exported context example:
            {
              "createdBy": "admin",
              "links": [...],
              "id": "id...",
              "version": 2,
              "name": "Compute Context"
            }

      NOTE: The sasjs context operation is only supported for SAS Viya build targets.
            More information available in the online documentation: https://sasjs.io/sasjs-cli-context

    * ${chalk.greenBright(
      'add'
    )} - Lets the user add a build target to either the local project configuration, or to the global .sasjsrc file.
      NOTE:  This command requires the user to input all the required parameters.
             More information available in the online documentation: https://sasjs.io/sasjs-cli-add/

    * ${chalk.greenBright(
      'run <sasFilePath> -t <targetName>'
    )} - Lets the user run a given SAS file against a specified target.
    The target can exist either in the local project configuration or in the global .sasjsrc file.

    * ${chalk.greenBright(
      'request <sasProgramPath> -d <path/to/datafile> -c <path/to/configfile> -t <targetName>'
    )} - Lets the user run a SAS job against a specified target.
    The target can exist either in the local project configuration or in the global .sasjsrc file.
    <sasProgramPath> - If this has a leading slash (eg /Public/app/folder/servicename) then it must
      be the full path. If it is a relative path (eg path/servicename) then it will be pre-pended
      with the appLoc - which must then be defined in the sasjs config.

    * ${chalk.greenBright('folder <command>')} - performs operations on folders.
        * ${chalk.cyanBright('create')} - creates new folder.
          command example: sasjs folder create /Public/folder --target targetName
          command example: sasjs folder create /Public/folder -t targetName
          command example: sasjs folder create /Public/folder -t targetName -f
          command example: sasjs folder create /Public/folder
          NOTE: Providing target name (--target targetName or -t targetName) is optional. Default target name will be used if target name was omitted.
          NOTE: Providing force flag (-f or --force) is optional. If provided and target folder already exists, its content and all subfolders will be deleted.

        * ${chalk.cyanBright('delete')} - deletes folder.
          command example: sasjs folder delete /Public/folder --target targetName
          command example: sasjs folder delete /Public/folder -t targetName
          command example: sasjs folder delete /Public/folder
          NOTE: Providing target name (--target targetName or -t targetName) is optional. Default target name will be used if target name was omitted.

        * ${chalk.cyanBright('move')} - moves folder to a new location.
          command example: sasjs folder move /Public/sourceFolder /Public/targetFolder --target targetName
          command example: sasjs folder move /Public/sourceFolder /Public/targetFolder -t targetName
          command example: sasjs folder move /Public/sourceFolder /Public/targetFolder
          NOTE: Providing target name (--target targetName or -t targetName) is optional. Default target name will be used if target name was omitted.

    * ${chalk.greenBright('job <command>')} - performs operations on jobs.
        * ${chalk.cyanBright('execute')} - triggers job for execution.
          command example: sasjs job execute /Public/job --target targetName
          command example: sasjs job execute /Public/job -t targetName
          command example: sasjs job execute /Public/job --target targetName --wait
          command example: sasjs job execute /Public/job -t targetName -w
          command example: sasjs job execute /Public/job --target targetName --output
          command example: sasjs job execute /Public/job -t targetName -o
          command example: sasjs job execute /Public/job -t targetName -o ./outputFolder/output.json
          command example: sasjs job execute /Public/job --target targetName --wait --output
          command example: sasjs job execute /Public/job -t targetName -w -o
          command example: sasjs job execute /Public/job -t targetName --log ./logFolder/log.json
          command example: sasjs job execute /Public/job -t targetName -l ./logFolder/log.json
          NOTE: Providing target name (--target targetName or -t targetName) is optional. Default target name will be used if target name was omitted.
          NOTE: Providing wait flag (--wait or -w) is optional. If present, CLI will wait for job completion.
          NOTE: Providing output flag (--output or -o) is optional. If present, CLI will immediately print out the response JSON. If value is provided, it will be treated as file path to save the response JSON.
          NOTE: Providing log flag (--log or -l) is optional. If present, CLI will fetch and save job log to local file.

    ${chalk.cyan('Alias commands:')}
    * ${chalk.greenBright('build-DB')}, ${chalk.cyanBright(
    'DB'
  )}, ${chalk.cyanBright('db')}
    * ${chalk.greenBright('compile')}, ${chalk.cyanBright('c')}
    * ${chalk.greenBright('build')}, ${chalk.cyanBright('b')}
    * ${chalk.greenBright('compilebuild')}, ${chalk.cyanBright('cb')}
    * ${chalk.greenBright('deploy')}, ${chalk.cyanBright('d')}
    * ${chalk.greenBright('compilebuilddeploy')}, ${chalk.cyanBright('cbd')}
    * ${chalk.greenBright('web')}, ${chalk.cyanBright('w')}
    * ${chalk.greenBright('version')}, ${chalk.cyanBright(
    '--version'
  )}, ${chalk.cyanBright('-version')}, ${chalk.cyanBright(
    '-v'
  )}, ${chalk.cyanBright('--v')}, ${chalk.cyanBright('v')}
    * ${chalk.greenBright('help')}, ${chalk.cyanBright(
    '--help'
  )}, ${chalk.cyanBright('-help')}, ${chalk.cyanBright(
    '-h'
  )}, ${chalk.cyanBright('--h')}, ${chalk.cyanBright('h')},
    * ${chalk.greenBright('add')}, ${chalk.cyanBright('a')}
    * ${chalk.greenBright('run')}, ${chalk.cyanBright('r')}
    * ${chalk.greenBright('request')}, ${chalk.cyanBright('rq')}
  `)
}
