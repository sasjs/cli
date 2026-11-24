// Supply Node APIs that Jest's jsdom environment does not expose to jsdom 31.
const { TextEncoder, TextDecoder } = require('node:util')
const {
  ReadableStream,
  TransformStream,
  WritableStream
} = require('node:stream/web')
const { MessageChannel, MessagePort } = require('node:worker_threads')
const { setImmediate, clearImmediate } = require('node:timers')
Object.assign(global, {
  TextEncoder,
  TextDecoder,
  ReadableStream,
  TransformStream,
  WritableStream,
  MessageChannel,
  MessagePort,
  setImmediate,
  clearImmediate
})
