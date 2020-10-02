import { test } from 'shelljs'
import { runSasCode } from '../src/sasjs-run/index'

describe('sasjs run', () => {
  describe('runSasCode', () => {
    it('should throw if file type is not *.sas', async () => {
      const file = 'test.txt'
      const error = new Error(`'sasjs run' command supports only *.sas files.`)

      await expect(runSasCode(file, '')).rejects.toEqual(error)
    })
  })
})
