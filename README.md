# SASjs CLI

[![npm package][npm-image]][npm-url]
[![Github Workflow][githubworkflow-image]][githubworkflow-url]
[![npm](https://img.shields.io/npm/dt/@sasjs/cli)]()
![GitHub top language](https://img.shields.io/github/languages/top/sasjs/cli)
[![GitHub closed issues](https://img.shields.io/github/issues-closed-raw/sasjs/cli)](https://github.com/sasjs/cli/issues?q=is%3Aissue+is%3Aclosed)
[![GitHub issues](https://img.shields.io/github/issues-raw/sasjs/cli)](https://github.com/sasjs/cli/issues)

[npm-image]: https://img.shields.io/npm/v/@sasjs/cli.svg
[npm-url]: http://npmjs.org/package/@sasjs/cli
[githubworkflow-image]: https://github.com/sasjs/cli/actions/workflows/run-tests.yml/badge.svg
[githubworkflow-url]: https://github.com/sasjs/cli/blob/main/.github/workflows/run-tests.yml

`@sasjs/cli` is a Command-Line Interface to assist with creating, building, and deploying Data Science projects and HTML5 Web Applications on the SAS platform (both SAS 9 and Viya). Features include:

- Scaffold a new SAS App in seconds (`sasjs create myApp -t jobs`)
- Compile / Build SAS Jobs, Services & Macros _locally_ and deploy / execute _remotely_, in isolation from other developers (`sasjs cbd`)
- No dependency on the server filesystem
- Optionally synchronise a local folder onto the server filesystem using `sasjs fs`
- Trigger Viya Jobs & Flows (`sasjs job execute` / `sasjs flow execute`)
- Enforce code quality rules with `sasjs lint`
- Generate HTML5 documentation (requires doxygen) with `sasjs doc`
- Create and execute SAS tests (`sasjs test`)

There is also a feature to let you deploy a frontend application as a set of streaming web services, bypassing the need to deploy to the SAS Web Server.

A quick demonstration of using it to compile, build and deploy a set of SAS Viya jobs is shown below.

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

Additional documentation can be found on the [SASjs CLI documentation](https://cli.sasjs.io) site.

## Notes

Running `npm i -g @sasjs/cli@latest` does not always upgrade properly. This is due to a known bug in npm, which is fixed in npm 7.

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
  <tbody>
    <tr>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/saadjutt01"><img src="https://avatars.githubusercontent.com/u/8914650?v=4?s=100" width="100px;" alt="Muhammad Saad "/><br /><sub><b>Muhammad Saad </b></sub></a><br /><a href="https://github.com/sasjs/cli/commits?author=saadjutt01" title="Code">💻</a> <a href="https://github.com/sasjs/cli/commits?author=saadjutt01" title="Tests">⚠️</a> <a href="https://github.com/sasjs/cli/pulls?q=is%3Apr+reviewed-by%3Asaadjutt01" title="Reviewed Pull Requests">👀</a> <a href="#mentoring-saadjutt01" title="Mentoring">🧑‍🏫</a> <a href="https://github.com/sasjs/cli/commits?author=saadjutt01" title="Documentation">📖</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://www.erudicat.com"><img src="https://avatars.githubusercontent.com/u/25773492?v=4?s=100" width="100px;" alt="Yury Shkoda"/><br /><sub><b>Yury Shkoda</b></sub></a><br /><a href="https://github.com/sasjs/cli/commits?author=YuryShkoda" title="Code">💻</a> <a href="#projectManagement-YuryShkoda" title="Project Management">📆</a> <a href="https://github.com/sasjs/cli/commits?author=YuryShkoda" title="Tests">⚠️</a> <a href="#video-YuryShkoda" title="Videos">📹</a> <a href="https://github.com/sasjs/cli/commits?author=YuryShkoda" title="Documentation">📖</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://krishna-acondy.io/"><img src="https://avatars.githubusercontent.com/u/2980428?v=4?s=100" width="100px;" alt="Krishna Acondy"/><br /><sub><b>Krishna Acondy</b></sub></a><br /><a href="https://github.com/sasjs/cli/commits?author=krishna-acondy" title="Code">💻</a> <a href="https://github.com/sasjs/cli/commits?author=krishna-acondy" title="Tests">⚠️</a> <a href="#infra-krishna-acondy" title="Infrastructure (Hosting, Build-Tools, etc)">🚇</a> <a href="#content-krishna-acondy" title="Content">🖋</a> <a href="#maintenance-krishna-acondy" title="Maintenance">🚧</a> <a href="#platform-krishna-acondy" title="Packaging/porting to new platform">📦</a> <a href="https://github.com/sasjs/cli/pulls?q=is%3Apr+reviewed-by%3Akrishna-acondy" title="Reviewed Pull Requests">👀</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/medjedovicm"><img src="https://avatars.githubusercontent.com/u/18329105?v=4?s=100" width="100px;" alt="Mihajlo Medjedovic"/><br /><sub><b>Mihajlo Medjedovic</b></sub></a><br /><a href="https://github.com/sasjs/cli/commits?author=medjedovicm" title="Code">💻</a> <a href="#infra-medjedovicm" title="Infrastructure (Hosting, Build-Tools, etc)">🚇</a> <a href="https://github.com/sasjs/cli/commits?author=medjedovicm" title="Tests">⚠️</a> <a href="https://github.com/sasjs/cli/pulls?q=is%3Apr+reviewed-by%3Amedjedovicm" title="Reviewed Pull Requests">👀</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/allanbowe"><img src="https://avatars.githubusercontent.com/u/4420615?v=4?s=100" width="100px;" alt="Allan Bowe"/><br /><sub><b>Allan Bowe</b></sub></a><br /><a href="https://github.com/sasjs/cli/commits?author=allanbowe" title="Code">💻</a> <a href="https://github.com/sasjs/cli/pulls?q=is%3Apr+reviewed-by%3Aallanbowe" title="Reviewed Pull Requests">👀</a> <a href="https://github.com/sasjs/cli/commits?author=allanbowe" title="Tests">⚠️</a> <a href="#video-allanbowe" title="Videos">📹</a> <a href="https://github.com/sasjs/cli/commits?author=allanbowe" title="Documentation">📖</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/sabhas"><img src="https://avatars.githubusercontent.com/u/82647447?v=4?s=100" width="100px;" alt="Sabir Hassan"/><br /><sub><b>Sabir Hassan</b></sub></a><br /><a href="https://github.com/sasjs/cli/commits?author=sabhas" title="Code">💻</a> <a href="https://github.com/sasjs/cli/pulls?q=is%3Apr+reviewed-by%3Asabhas" title="Reviewed Pull Requests">👀</a> <a href="https://github.com/sasjs/cli/commits?author=sabhas" title="Tests">⚠️</a> <a href="#ideas-sabhas" title="Ideas, Planning, & Feedback">🤔</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/VladislavParhomchik"><img src="https://avatars.githubusercontent.com/u/83717836?v=4?s=100" width="100px;" alt="VladislavParhomchik"/><br /><sub><b>VladislavParhomchik</b></sub></a><br /><a href="https://github.com/sasjs/cli/commits?author=VladislavParhomchik" title="Tests">⚠️</a> <a href="https://github.com/sasjs/cli/pulls?q=is%3Apr+reviewed-by%3AVladislavParhomchik" title="Reviewed Pull Requests">👀</a></td>
    </tr>
    <tr>
      <td align="center" valign="top" width="14.28%"><a href="http://rudvfaden.github.io/"><img src="https://avatars.githubusercontent.com/u/2445577?v=4?s=100" width="100px;" alt="Rud Faden"/><br /><sub><b>Rud Faden</b></sub></a><br /><a href="https://github.com/sasjs/cli/issues?q=author%3Arudvfaden" title="Bug reports">🐛</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://sead.dev"><img src="https://avatars.githubusercontent.com/u/8067014?v=4?s=100" width="100px;" alt="Sead Mulahasanović"/><br /><sub><b>Sead Mulahasanović</b></sub></a><br /><a href="https://github.com/sasjs/cli/commits?author=mulahasanovic" title="Code">💻</a></td>
    </tr>
  </tbody>
</table>

<!-- markdownlint-restore -->
<!-- prettier-ignore-end -->

<!-- ALL-CONTRIBUTORS-LIST:END -->

This project follows the [all-contributors](https://github.com/all-contributors/all-contributors) specification. Contributions of any kind welcome!
