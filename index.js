#!/usr/bin/env node

require = require('esm')(module /*, options*/)
try {
  require('./cli').cli(process.argv)
} catch (e) {
  require('./build/src/cli').cli(process.argv)
}
