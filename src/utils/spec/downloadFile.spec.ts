import * as shell from '../shell'
import { isLinux, isWindows } from '@sasjs/utils'
import { downloadFile } from '../utils'

jest.mock('../shell', () => ({
  ...jest.requireActual('../shell'),
  exec: jest.fn(() => ({ stdout: '', stderr: '', code: 0 })),
  which: jest.fn()
}))

jest.mock('@sasjs/utils', () => ({
  ...jest.requireActual('@sasjs/utils'),
  isLinux: jest.fn(),
  isWindows: jest.fn()
}))

describe('downloadFile', () => {
  const exec = shell.exec as unknown as jest.Mock
  const which = shell.which as unknown as jest.Mock
  const linux = isLinux as unknown as jest.Mock
  const windows = isWindows as unknown as jest.Mock

  beforeEach(() => {
    jest.clearAllMocks()
    exec.mockReturnValue({ stdout: '', stderr: '', code: 0 })
  })

  it('uses wget on linux when it is installed', () => {
    linux.mockReturnValue(true)
    windows.mockReturnValue(false)
    which.mockReturnValue('/usr/bin/wget')

    downloadFile('https://example.com/main.zip', 'main.zip')

    expect(exec).toHaveBeenCalledWith(
      'wget https://example.com/main.zip -O main.zip',
      { silent: true }
    )
  })

  it('falls back to curl on linux when wget is not installed', () => {
    linux.mockReturnValue(true)
    windows.mockReturnValue(false)
    which.mockReturnValue(null)

    downloadFile('https://example.com/main.zip', 'main.zip')

    expect(exec).toHaveBeenCalledWith(
      'curl https://example.com/main.zip -L -f -o main.zip',
      { silent: true }
    )
  })

  it('uses curl on linux without a filename, saving under the remote basename', () => {
    linux.mockReturnValue(true)
    windows.mockReturnValue(false)
    which.mockReturnValue(null)

    downloadFile('https://example.com/main.zip')

    expect(exec).toHaveBeenCalledWith(
      'curl https://example.com/main.zip -L -f -O',
      { silent: true }
    )
  })

  it('uses curl on macOS', () => {
    linux.mockReturnValue(false)
    windows.mockReturnValue(false)
    which.mockReturnValue(null)

    downloadFile('https://example.com/main.zip', 'main.zip')

    expect(exec).toHaveBeenCalledWith(
      'curl https://example.com/main.zip -L -f -o main.zip',
      { silent: true }
    )
  })

  it('uses powershell on windows', () => {
    linux.mockReturnValue(false)
    windows.mockReturnValue(true)

    downloadFile('https://example.com/main.zip', 'main.zip')

    expect(exec.mock.calls[0][0]).toContain(
      'Invoke-WebRequest https://example.com/main.zip -O main.zip'
    )
  })
})
