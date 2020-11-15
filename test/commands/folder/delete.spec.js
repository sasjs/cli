import { folder } from '../../../src/sasjs-folder/index'
import { generateTimestamp } from '../../../src/utils/utils'

describe('sasjs folder delete', () => {
  beforeAll(async (done) => {
    dotenv.config()
    done()
  })

  it('should delete folders when a relative path is provided', async (done) => {
    const timestamp = generateTimestamp()
    await folder(`folder create /Public/app/test-${timestamp}`)

    await expect(folder(`folder delete test-${timestamp}`)).resolves.toEqual(
      true
    )
    done()
  })

  it('should delete folders when an absolute path is provided', async (done) => {
    const timestamp = generateTimestamp()
    await folder(`folder create /Public/app/test-${timestamp}`)

    await expect(
      folder(`folder delete /Public/app/test-${timestamp}`)
    ).resolves.toEqual(true)
    done()
  })
})
