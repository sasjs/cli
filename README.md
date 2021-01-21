# SASjs CLI

`@sasjs/cli` is a Command-Line Interface to assist with creating, building, and deploying Data Science projects and SAS-Powered HTML5 Web Applications on the SAS platform (both SAS 9 and Viya). It fulfills 3 main purposes:

- Creation of a project GIT repository in an 'opinionated' (structured) way.
- Compilation of each service and job, including all the dependent macros, SAS programs and pre / post code and global macro variables.
- Build & Deployment of the local project into SAS Metadata or SAS Drive of the target server, with no dependency on the physical server file system.

There is also a feature to let you deploy a frontend application as a set of streaming web services, bypassing the need to deploy to the SAS Web Server.

A quick demonstration of using it to compile, build & deploy a set of SAS Viya jobs is shown below.

[![IMAGE ALT TEXT HERE](https://img.youtube.com/vi/KKfUHTngSFo/0.jpg)](https://www.youtube.com/watch?v=KKfUHTngSFo)

## Installation

1. Install globally using `npm` as follows:

```
  npm i -g @sasjs/cli
```

You can also use the tool without deploying through NPX as follows:
```
npx @sasjs/cli <command>
```

## Documentation


Additional documentation can be found on the [SASjs CLI documentation](https://cli.sasjs.io)  site.


## Notes

Running `npm i -g @sasjs/cli@latest` does not always upgrade properly.  This is due to a known bug in npm, which is fixed in npm 7.

If you are running NPM in version 6 or below, you can try running `npm update -g @sasjs/cli` instead, or - the sledgehammer approach - delete the files from the NPM folder and then do a fresh install.

