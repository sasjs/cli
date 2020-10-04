# SASjs CLI

`@sasjs/cli` is a Command-Line Interface to assist with creating, building, and deploying HTML5 Web Applications on the SAS platform. It fulfills 3 main purposes:

- Creation of a project repository in an 'opinionated' way.
- Compilation each service, including all the dependent macros and pre / post code.
- Deployment script generation - run this in SAS Studio to create all your backend services in Viya or SAS9.

There is also a feature to let you deploy your frontend as a service, bypassing the need to access the SAS Web Server.

## Usage

1. Install globally using `npm` as follows:

```
  npm i -g @sasjs/cli
```

2. You will then be able to run the command `sasjs` from your command line with one of the available options.

```
  sasjs <option>
```

[![IMAGE ALT TEXT HERE](https://img.youtube.com/vi/hUpBqExNec4/0.jpg)](https://www.youtube.com/watch?v=hUpBqExNec4)

Additional documentation can be found on the [SASjs](https://sasjs.io) website.

## Available Options

- `create`: creates the folders and files required for SAS development. You can use this command in two ways:
  1. `sasjs create folderName` - which creates a new folder with the name specified.
  2. `sasjs create` - which creates the files and folder in the current working directory. If this directory is an existing NPM project with a `package.json` file, this command adds `@sasjs/core` to the list of dependencies in that file. Else, it will initialise a new NPM project and then install `@sasjs/core`. An alias for this command is `sasjs c`.
- `sasjs build [targetName]`: loads dependencies and builds services for SAS, for the specified build target name. If no target is specified, it builds the first target specified in the `sasconfig.json`. An alias for this command is `sasjs b`.
- `web`: generates SAS services for streaming your HTML, CSS and JavaScript-based app from a SAS server. This command is automatically run as part of `sasjs build` if `streamWeb` is set to true for a particular build target. An alias for this command is `sasjs w`.
- `sasjs help`: displays help text. Aliases for this command are `sasjs h`, `sasjs --help`, `sasjs -help` and `sasjs --h`.
- `sasjs version`: displays the currently installed version of SASjs CLI. Aliases for this command are `sasjs v`, `sasjs --version`, `sasjs -version` and `sasjs --v`.
- `sasjs context`: performs context related operations
  1. `sasjs context create --source ../contextConfig.json --target targetName` - creates new context using provided context config.
  2. `sasjs context edit --source ../contextConfig.json --target targetName` - updates existing context using provided context config.
  3. `sasjs context delete contextName --target targetName` - deletes context.
  4. `sasjs context list --target targetName` - lists all accessible and inaccessible contexts.
- `sasjs folder`: performs folder related operations
  1. `sasjs folder create /Public/folder --target targetName` - creates new new folder.
  2. `sasjs folder delete /Public/folder --target targetName` - deletes folder.
  3. `sasjs folder move /Public/sourceFolder /Public/targetFolder --target targetName` - moves folder to a new location.

## Command Operations

- `sasjs db` (Alias: `build-DB`, `DB`)
  Remove only db folder if present in "sasjsbuild".
- `sasjs compile` (Alias: `c`)
  Remove all buildfolders("services", and anyother) along deployment script but not "db" folder.
- `sasjs build` (Alias: `b`)
  Compile if needed, and recreate deployment script.
- `sasjs compilebuild` (Alias: `cb`)
  Compile and recreate deployment script.
- `sasjs add` (Alias: `a`)
  Lets the user add a build target either to the local project configuration or to the global `.sasjsrc` file.
- `sasjs run` (Alias: `r`)
  Lets the user run the specified SAS file against a target present either in the local project configuration or the global `.sasjsrc` file.

## Notes

- In order to update existing version of `sasjs` consider using `npm update -g @sasjs/cli` command to get the latest version of it.
