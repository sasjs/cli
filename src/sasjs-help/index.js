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
          This supports creation of Angular, React and minimal web apps.
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
    )} - Prepares a single deployment script (SAS9 or Viya program) per configuration in sasjs.config.json.    
        First Build (macro) variables are inserted, then all of the buildinit / buildterm dependencies,
          then the buildinit (a good place to source the Viya app tokens),
          then all of the compiled services are added,
          and finally the buildterm script (where you might perform additional deployment actions such as database build).
        This SAS file could be executed as part of a web service (executed by the Deploy command) or simply copy pasted into Enterprise Guide or SAS Studio.
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
      'listcontexts <targetName>'
    )} - displays a list of executable compute contexts for the given build target.

      NOTE: This operation is only supported for SAS Viya build targets.

    * ${chalk.greenBright(
      'add'
    )} - Lets the user add a build target to either the local project configuration, or to the global .sasjsrc file.
    This command requires the user to input all the required parameters.

    * ${chalk.greenBright(
      'run <sasFilePath> -t <targetName>'
    )} - Lets the user run a given SAS file against a specified target.
    The target can exist either in the local project configuration or in the global .sasjsrc file.

    * ${chalk.greenBright(
      'request <sasJob> -d <path/to/datafile> -c <path/to/configfile> -t <targetName>`.'
    )} - Lets the user run a SAS job against a specified target.
    The target can exist either in the local project configuration or in the global .sasjsrc file.

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
    * ${chalk.greenBright('listcontexts')}, ${chalk.cyanBright('lc')},
    * ${chalk.greenBright('add')}, ${chalk.cyanBright('a')}
    * ${chalk.greenBright('run')}, ${chalk.cyanBright('r')}
    * ${chalk.greenBright('request')}, ${chalk.cyanBright('rq')}
  `)
}
