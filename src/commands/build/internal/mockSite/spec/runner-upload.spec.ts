import fs from 'fs'
import path from 'path'
import vm from 'vm'

test('CLI runner remains compatible with the released server Buffer contract', () => {
  const code = fs.readFileSync(
    path.resolve('mocks/sasjs/sasjs/runner.js'),
    'utf8'
  )
  const readFileSync = jest.fn(() => {
    throw new Error('must not read a Buffer as a path')
  })
  const context: any = {
    require,
    Buffer,
    fs: { readFileSync },
    _requestMethod: 'POST',
    _WEBIN_FILEREF1: Buffer.from('data test; run;'),
    _webout: ''
  }
  vm.runInNewContext(`(function () { ${code} })()`, context)
  expect(readFileSync).not.toHaveBeenCalled()
  expect(context._webout).toBe('Runner POST \n' + 'data test; run;')
})

test('CLI runner reads an uploaded program through its file reference', () => {
  const code = fs.readFileSync(
    path.resolve('mocks/sasjs/sasjs/runner.js'),
    'utf8'
  )
  const fileRef = '/session/input'
  const readFileSync = jest.fn(() => Buffer.from('data test; run;'))
  const context: any = {
    require,
    fs: { readFileSync },
    _requestMethod: 'POST',
    _WEBIN_FILEREF1: fileRef,
    _webout: ''
  }
  vm.runInNewContext(`(function () { ${code} })()`, context)
  expect(readFileSync).toHaveBeenCalledWith(fileRef)
  expect(context._webout).toBe('Runner POST \n' + 'data test; run;')
})
