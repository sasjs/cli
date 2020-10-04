import {
  isFlagPresent,
  getCommandParameter,
  getCommandParameterLastMultiWord
} from '../src/utils/command-utils'

const mockCommandLine = [
  'test',
  '-f',
  '-t2',
  'testParam',
  '--test3',
  'testLongParam',
  '-l',
  'multi',
  'word'
]

describe('isFlagPresent', () => {
  test('passed existing flag', () => {
    let flagPresent = isFlagPresent('-f', mockCommandLine)
    
    expect(flagPresent).toEqual(true)
  })

  test('passed non existing flag', () => {
    let flagPresent = isFlagPresent('-a', mockCommandLine)
    
    expect(flagPresent).toEqual(false)
  })

  test('passed empty string', () => {
    let flagPresent = isFlagPresent('', mockCommandLine)
    
    expect(flagPresent).toEqual(false)
  })

  test('passed null', () => {
    let flagPresent = isFlagPresent(null, mockCommandLine)
    
    expect(flagPresent).toEqual(false)
  })

  test('passed undefined', () => {
    let flagPresent = isFlagPresent(undefined, mockCommandLine)
    
    expect(flagPresent).toEqual(false)
  })
})

describe('getCommandParameter', () => {
  test('passed short flag and long flag', () => {
    let parameter = getCommandParameter('-t', '--test3', mockCommandLine)
    
    expect(parameter).toEqual('testLongParam')
  })

  test('passed short flag, without long flag', () => {
    let parameter = getCommandParameter('-t2', null, mockCommandLine)
    
    expect(parameter).toEqual('testParam')
  })

  test('passed long flag, without short flag', () => {
    let parameter = getCommandParameter(null, '--test3', mockCommandLine)
    
    expect(parameter).toEqual('testLongParam')
  })

  test('passed non-existing flags', () => {
    let parameter = getCommandParameter('-n', '--non', mockCommandLine)
    
    expect(parameter).toEqual(undefined)
  })
})

describe('getCommandParameterLastMultiWord', () => {
  test('passed short flag and long flag', () => {
    let parameter = getCommandParameterLastMultiWord('-l', '--last', mockCommandLine)
    
    expect(parameter).toEqual('multi word')
  })

  test('passed short flag without long flag', () => {
    let parameter = getCommandParameterLastMultiWord('-l', null, mockCommandLine)
    
    expect(parameter).toEqual('multi word')
  })

  test('passed long flag without short flag', () => {
    let mockCommandLineCustom = [
      'test',
      '-f',
      '-t2',
      'testParam',
      '--test3',
      'testLongParam',
      '--last',
      'multi',
      'word'
    ]

    let parameter = getCommandParameterLastMultiWord(null, '--last', mockCommandLineCustom)
    
    expect(parameter).toEqual('multi word')
  })

  test('passed non-existing flags', () => {
    let parameter = getCommandParameterLastMultiWord('-n', '--non', mockCommandLine)
    
    expect(parameter).toEqual('')
  })
})