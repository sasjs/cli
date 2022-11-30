# Contributing

The purpose of this repo is to create the `sasjs` command line utility. The build and release happens automatically when merging with master.

## Prerequisites

* NPM (v7)
* Doxygen (v1.9.1) - https://www.doxygen.nl/download.html
* Jest (`npm i -g jest`) - not needed for build, but useful for debugging

## Build Process
For development, the following steps are needed to build:

```
git clone git@github.com:sasjs/cli.git
cd cli
npm ci
npm run build
npm link
npm start
```

The `npm start` script watches for changes in the source files and automatically rebuilds them.  Once done, you can use `npm unlink` from the repository to unlink it.  If this doesn't work, you can try: `npm rm -g @sasjs/cli`.

## Development Notes

If you want to run `npm run test:server` or anything remote on Viya, you will need to provide credentials - you can rename `.env.example` as `.env` and provide your CLIENT/SECRET/ACCESS_TOKEN/REFRESH_TOKEN.  To make this process easier, you can deploy the [Viya Token Generator](https://sasjs.io/apps/#viya-client-token-generator).

All server-side tests should be written in `name.spec.server.viya.ts`, `name.spec.server.sas9.ts` or `name.spec.server.sasjs.ts` to be conducted with `Viya`, `SAS9` or [SASjs](https://server.sasjs.io) accordingly. There is a way to filter what kind of server types will be used to execute server-side tests as part of `test:server` npm script. To provide server types a comma-separated string containing server types (`viya`, `sas9` or `sasjs`) should be set as Github secret `TEST_SERVER_TYPES`. If Github secret does not exist (local development environment), a comma-separated string containing server type should be provided as `testServerTypes` entry in `package.json`.

All code should be written in TypeScript. See the checks in the PULL_REQUEST_TEMPLATE.md that must be completed before review.  If you can, please test in a Windows environment as 99% of our customers will use the CLI there.

For support, you can contact team members in our matrix channel.  Just reach out to us [here](https://matrix.to/#/%23sasjs:4gl.io) and we'll add you.
