# Contributing

The purpose of this repo is to create the `sasjs` command line utility. This happens automatically when merging with master. For development, the following steps are needed to build:

```
git clone git@github.com:sasjs/cli.git
cd cli
npm run build
npm link
npm start
```

The `npm start` script watches for changes in the source files and automatically rebuilds them.

We are in the process of migrating the project to TypeScript, so you may see a mix of `.ts` and `.js` files.
Any new functionality being added should be written in TypeScript. If you're modifying an existing piece of functionality, the general guideline is to try to convert the file to TypeScript and fix compile errors if any.

Once done, you can use `npm unlink` from the repository to unlink it.
