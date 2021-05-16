# SASjs CLI

[![npm package][npm-image]][npm-url]
[![Github Workflow][githubworkflow-image]][githubworkflow-url]
[![Dependency Status][dependency-image]][dependency-url]
[![npm](https://img.shields.io/npm/dt/@sasjs/cli)]()
![Snyk Vulnerabilities for npm package](https://img.shields.io/snyk/vulnerabilities/npm/@sasjs/cli)
[![License](https://img.shields.io/apm/l/atomic-design-ui.svg)](/LICENSE)
![GitHub top language](https://img.shields.io/github/languages/top/sasjs/cli)
![total lines](https://tokei.rs/b1/github/sasjs/cli)
[![Gitpod ready-to-code](https://img.shields.io/badge/Gitpod-ready--to--code-908a85?logo=gitpod)](https://gitpod.io/#https://github.com/sasjs/cli)


[npm-image]:https://img.shields.io/npm/v/@sasjs/cli.svg
[npm-url]:http://npmjs.org/package/@sasjs/cli
[githubworkflow-image]:https://github.com/sasjs/cli/actions/workflows/run-tests.yml/badge.svg
[githubworkflow-url]:https://github.com/sasjs/cli/blob/main/.github/workflows/run-tests.yml
[dependency-image]:https://david-dm.org/sasjs/cli.svg
[dependency-url]:https://github.com/sasjs/cli/blob/main/package.json

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

## Star Gazing

If you find this library useful, help us grow our star graph!

![](https://starchart.cc/sasjs/cli.svg)

