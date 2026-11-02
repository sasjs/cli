import SASjs from '@sasjs/adapter/node'

import * as jobUtils from '../internal/utils'
import * as logcheck from '../../../utils/logcheck'
import { executeJobSas9 } from '../internal/execute/sas9'

/**
 * A run that fails the log check is the run whose log someone wants to read, so
 * the file has to be written before the check can throw - otherwise `--log`
 * produces nothing exactly when it is needed.
 */
describe('job execute log handling', () => {
  beforeEach(() => {
    process.logger = {
      success: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    } as any
  })

  it('writes the log before a failing check can throw', async () => {
    const sasjs = new SASjs()

    jest.spyOn(sasjs, 'request').mockResolvedValue({
      status: 200,
      log: 'ERROR 22-322: Syntax error',
      result: {}
    } as any)

    const saveSpy = jest
      .spyOn(jobUtils, 'saveLog')
      .mockResolvedValue(undefined as any)

    const checkSpy = jest
      .spyOn(logcheck, 'checkLog')
      .mockRejectedValue(new Error('SAS log check failed'))

    await expect(
      executeJobSas9(sasjs, {} as any, 'job/path', 'job.log')
    ).rejects.toThrow('SAS log check failed')

    expect(saveSpy).toHaveBeenCalledWith(
      'ERROR 22-322: Syntax error',
      'job.log',
      'job/path'
    )

    expect(saveSpy.mock.invocationCallOrder[0]).toBeLessThan(
      checkSpy.mock.invocationCallOrder[0]
    )
  })
})
