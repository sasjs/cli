import { runSasCode } from '../../src/commands'

describe('sasjs run', () => {
  describe('runSasCode', () => {
    it('should throw an error if file type is not *.sas', async () => {
      const file = 'test.sas.txt'
      const error = new Error(`'sasjs run' command supports only *.sas files.`)

      await expect(runSasCode(`run ${file}`)).rejects.toEqual(error)
    })
  })
})
