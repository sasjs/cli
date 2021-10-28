// Define global TextEncoder and TextDecoder for `jsdom`
const { TextEncoder, TextDecoder } = require('util')
global.TextEncoder = TextEncoder
global.TextDecoder = TextDecoder
