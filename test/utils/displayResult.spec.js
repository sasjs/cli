import { displayResult } from '../../src/utils/displayResult'
import { ErrorResponse } from '@sasjs/adapter/node'

describe('display result error', () => {
  test('error is object, details is object', () => {
    let error = new ErrorResponse('Test error', { status: 500, error: 'Test' })

    let result = displayResult(error, 'Execution error')
    let expected = `Execution error\nTest error\n{"status":500,"error":"Test"}`

    expect(result).toEqual(expected)
  })

  test('error is object, details is string', () => {
    let error = {
      error: {
        message: 'Test error',
        details: 'Details string',
        raw: undefined
      }
    }

    let result = displayResult(error, 'Execution error')
    let expected = `Execution error\nTest error\nDetails string`

    expect(result).toEqual(expected)
  })

  test('error is object, details property missing, raw present', () => {
    let error = {
      error: { message: 'Test error', details: undefined, raw: 'Raw response' }
    }

    let result = displayResult(error, 'Execution error')
    let expected = `Execution error\nTest error\nRaw response`

    expect(result).toEqual(expected)
  })

  test('error is object, error property missing', () => {
    let error = { status: 500, details: 'Test' }

    let result = displayResult(error, 'Execution error')
    let expected = `Execution error\n{"status":500,"details":"Test"}`

    expect(result).toEqual(expected)
  })

  test('error is string', () => {
    let error = 'Something went wrong'

    let result = displayResult(error, 'Execution error')
    let expected = `Execution error\nSomething went wrong`

    expect(result).toEqual(expected)
  })
})

describe('display result success', () => {
  test('success message', () => {
    let result = displayResult(null, null, 'Success')
    let expected = `Success`

    expect(result).toEqual(expected)
  })
})
