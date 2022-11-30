import { extractHashArray } from '../internal/extractHashArray'

const log = `
>>weboutBEGIN<<
{
  "hashes": [{
    "FILE_HASH": "someCharacters",
    "FILE_PATH": "path/to/folder/file"
  }]
}
>>weboutEND<<
`

const logWithInvalidJsonInWebout = `
>>weboutBEGIN<<
{
  "invalid Json"
}
>>weboutEND<<
`

describe('extractHashArray', () => {
  it('should extract hashed array from webout', () => {
    const hashes = extractHashArray(log)
    expect(hashes).toBeArrayOfSize(1)
  })

  it('should throw error when log does not contain webout', () => {
    expect(() => extractHashArray(logWithInvalidJsonInWebout)).toThrow(
      'An error occurred while extracting hashes array from webout.'
    )
  })
})
