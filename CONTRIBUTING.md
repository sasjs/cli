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
npm install
npm link
npm start
```

The `npm start` script watches for changes in the source files and automatically rebuilds them.  Once done, you can use `npm unlink` from the repository to unlink it.

## Development Notes

If you want to run `npm run test:server` or anything remote on Viya, you will need to provide credentials - you can rename `.env.example` as `.env` and provide your CLIENT/SECRET/ACCESS_TOKEN/REFRESH_TOKEN.  To make this process easier, you can deploy the [Viya Token Generator](https://sasjs.io/apps/#viya-client-token-generator).

All code should be written in TypeScript. See the checks in the PULL_REQUEST_TEMPLATE.md that must be completed before review.  If you can, please test in a Windows environment as 99% of our customers will use the CLI there.

For support, you can contact team members in our slack channel.  Just reach out to us [here](https://sasapps.io/contact-us) and we'll add you.


