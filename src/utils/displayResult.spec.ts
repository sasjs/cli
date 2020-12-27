import { displayError, displaySuccess } from './displayResult'
import { ErrorResponse } from '@sasjs/adapter/node'
import { Logger, LogLevel } from '@sasjs/utils'

describe('display error', () => {
  beforeEach(() => {
    process.logger = new Logger(LogLevel.Off)
  })
  test('error is object, details is object', () => {
    jest.spyOn(process.logger, 'error')
    let error = new ErrorResponse('Test error', { status: 500, error: 'Test' })

    let result = displayError(error, 'Execution error')
    let expected = `Execution error\nTest error\n{"status":500,"error":"Test"}`

    expect(result).toEqual(expected)
    expect(process.logger.error).toHaveBeenCalledWith(
      `Execution error`,
      `Test error\n{"status":500,"error":"Test"}`
    )
  })

  test('error is object, details is string', () => {
    jest.spyOn(process.logger, 'error')
    let error = {
      error: {
        message: 'Test error',
        details: 'Details string',
        raw: undefined
      }
    }

    let result = displayError(error, 'Execution error')
    let expected = `Execution error\nTest error\nDetails string`

    expect(result).toEqual(expected)
    expect(process.logger.error).toHaveBeenCalledWith(
      `Execution error`,
      `Test error\nDetails string`
    )
  })

  test('error is object, details property missing, raw present', () => {
    jest.spyOn(process.logger, 'error')
    let error = {
      error: { message: 'Test error', details: undefined, raw: 'Raw response' }
    }

    let result = displayError(error, 'Execution error')
    let expected = `Execution error\nTest error\nRaw response`

    expect(result).toEqual(expected)
    expect(process.logger.error).toHaveBeenCalledWith(
      `Execution error`,
      `Test error\nRaw response`
    )
  })

  test('error is object, error property missing', () => {
    jest.spyOn(process.logger, 'error')
    let error = { status: 500, details: 'Test' }

    let result = displayError(error, 'Execution error')
    let expected = `Execution error\n{"status":500,"details":"Test"}`

    expect(result).toEqual(expected)
    expect(process.logger.error).toHaveBeenCalledWith(
      'Execution error',
      '{"status":500,"details":"Test"}'
    )
  })

  test('error is string', () => {
    jest.spyOn(process.logger, 'error')
    let error = 'Something went wrong'

    let result = displayError(error, 'Execution error')
    let expected = `Execution error\nSomething went wrong`

    expect(result).toEqual(expected)
    expect(process.logger.error).toHaveBeenCalledWith(
      'Execution error',
      'Something went wrong'
    )
  })

  test('error JS Error object', () => {
    jest.spyOn(process.logger, 'error')
    let error = new Error('Something went wrong')

    let result = displayError(error, 'Execution error')
    let expected = `Execution error\nSomething went wrong`

    expect(result).toEqual(expected)
    expect(process.logger.error).toHaveBeenCalledWith(
      'Execution error',
      'Something went wrong'
    )
  })
})

describe('display result success', () => {
  test('success message', () => {
    jest.spyOn(process.logger, 'success')

    displaySuccess('Success')

    expect(process.logger.success).toHaveBeenCalledWith('Success')
  })
})
