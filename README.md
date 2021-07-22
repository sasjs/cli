# SASjs CLI
<!-- ALL-CONTRIBUTORS-BADGE:START - Do not remove or modify this section -->
[![All Contributors](https://img.shields.io/badge/all_contributors-3-orange.svg?style=flat-square)](#contributors-)
<!-- ALL-CONTRIBUTORS-BADGE:END -->
[![npm package][npm-image]][npm-url]
[![Github Workflow][githubworkflow-image]][githubworkflow-url]
[![Dependency Status][dependency-image]][dependency-url]
[![npm](https://img.shields.io/npm/dt/@sasjs/cli)]()
![Snyk Vulnerabilities for npm package](https://img.shields.io/snyk/vulnerabilities/npm/@sasjs/cli)
[![License](https://img.shields.io/apm/l/atomic-design-ui.svg)](/LICENSE)
![GitHub top language](https://img.shields.io/github/languages/top/sasjs/cli)
[![GitHub closed issues](https://img.shields.io/github/issues-closed-raw/sasjs/cli)](https://github.com/sasjs/cli/issues?q=is%3Aissue+is%3Aclosed)
[![GitHub issues](https://img.shields.io/github/issues-raw/sasjs/cli)](https://github.com/sasjs/cli/issues)
[![Gitpod ready-to-code](https://img.shields.io/badge/Gitpod-ready--to--code-908a85?logo=gitpod)](https://gitpod.io/#https://github.com/sasjs/cli)


[npm-image]:https://img.shields.io/npm/v/@sasjs/cli.svg
[npm-url]:http://npmjs.org/package/@sasjs/cli
[githubworkflow-image]:https://github.com/sasjs/cli/actions/workflows/run-tests.yml/badge.svg
[githubworkflow-url]:https://github.com/sasjs/cli/blob/main/.github/workflows/run-tests.yml
[dependency-image]:https://david-dm.org/sasjs/cli.svg
[dependency-url]:https://github.com/sasjs/cli/blob/main/package.json

`@sasjs/cli` is a Command-Line Interface to assist with creating, building, and deploying Data Science projects and HTML5 Web Applications on the SAS platform (both SAS 9 and Viya). Features include:

- Scaffold a new SAS App in seconds  (`sasjs create myApp -t jobs`)
- Compile / Build SAS Jobs, Services & Macros _locally_ and deploy / execute _remotely_, in isolation from other developers (`sasjs cbd`)
- No dependency on the server filesystem
- Trigger Viya Jobs & Flows (`sasjs job execute` / `sasjs flow execute`)
- Enforce code quality rules with `sasjs lint`
- Generate HTML5 documentation (requires doxygen) with `sasjs doc`
- Create and execute SAS tests (`sasjs test`)

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

If you find this library useful, please leave a star and help us grow our star graph!

![](https://starchart.cc/sasjs/cli.svg)


## Contributors ✨

Thanks goes to these wonderful people ([emoji key](https://allcontributors.org/docs/en/emoji-key)):

<!-- ALL-CONTRIBUTORS-LIST:START - Do not remove or modify this section -->
<!-- prettier-ignore-start -->
<!-- markdownlint-disable -->
<table>
  <tr>
    <td align="center"><a href="https://github.com/saadjutt01"><img src="https://avatars.githubusercontent.com/u/8914650?v=4?s=100" width="100px;" alt=""/><br /><sub><b>Muhammad Saad </b></sub></a><br /><a href="https://github.com/sasjs/cli/commits?author=saadjutt01" title="Code">💻</a></td>
    <td align="center"><a href="https://www.erudicat.com"><img src="https://avatars.githubusercontent.com/u/25773492?v=4?s=100" width="100px;" alt=""/><br /><sub><b>Yury Shkoda</b></sub></a><br /><a href="https://github.com/sasjs/cli/commits?author=YuryShkoda" title="Code">💻</a> <a href="#projectManagement-YuryShkoda" title="Project Management">📆</a> <a href="https://github.com/sasjs/cli/commits?author=YuryShkoda" title="Tests">⚠️</a></td>
    <td align="center"><a href="https://krishna-acondy.io/"><img src="https://avatars.githubusercontent.com/u/2980428?v=4?s=100" width="100px;" alt=""/><br /><sub><b>Krishna Acondy</b></sub></a><br /><a href="https://github.com/sasjs/cli/commits?author=krishna-acondy" title="Code">💻</a> <a href="#infra-krishna-acondy" title="Infrastructure (Hosting, Build-Tools, etc)">🚇</a></td>
  </tr>
</table>

<!-- markdownlint-restore -->
<!-- prettier-ignore-end -->

<!-- ALL-CONTRIBUTORS-LIST:END -->

This project follows the [all-contributors](https://github.com/all-contributors/all-contributors) specification. Contributions of any kind welcome!
