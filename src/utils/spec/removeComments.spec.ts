import { removeComments } from '../utils'

describe('removeComments', () => {
  test('should remove block comment', () => {
    const text = `/* test\n123\n456\n789 */`
    expect(removeComments(text)).toEqual('')
  })

  test('should not remove single line block comment', () => {
    const text = `/* test */`

    expect(removeComments(text)).toEqual(text)
  })

  test('should remove all comments from the provided SAS file', () => {
    const expected = `%macro mv_createfolder(path=
  ,access_token_var=ACCESS_TOKEN
  ,grant_type=authorization_code
);`
    expect(removeComments(sampleSasProgram)).toEqual(expected)
  })

  test('should keep inline comments intact when they start a line', () => {
    const text = '/* Some Comment */ CODE HERE;'

    expect(removeComments(text)).toEqual(text)
  })

  test('should keep inline comments intact when they are within a line', () => {
    const text = 'CODE HERE /* Some Comment  */'

    expect(removeComments(text)).toEqual(text)
  })

  test('should handle CRLF line endings', () => {
    const text = 'CODE HERE\r\n\r\nMORE CODE'
    const expectedText = 'CODE HERE\nMORE CODE'

    expect(removeComments(text)).toEqual(expectedText)
  })

  test('should handle a mix of CRLF and LF line endings', () => {
    const text = 'CODE HERE\r\n\r\nMORE CODE\nEVEN MORE CODE'
    const expectedText = 'CODE HERE\nMORE CODE\nEVEN MORE CODE'

    expect(removeComments(text)).toEqual(expectedText)
  })

  test('should return an empty string when the input is falsy', () => {
    expect(removeComments(null as any as string)).toEqual('')
    expect(removeComments(undefined as any as string)).toEqual('')
    expect(removeComments('')).toEqual('')
  })

  test('should preserve formatting when removing comments', () => {
    const text = `if (this === 'code') {
  console.log('Pigs can fly.')
  }`

    expect(removeComments(text)).toEqual(text)
  })
})

export const sampleSasProgram = `/**
  @file mv_createfolder.sas
  @brief Creates a viya folder if that foloder does not already exist
  @details Expects oauth token in a global macro variable (default
    ACCESS_TOKEN).

    options mprint;
    %mv_createfolder(path=/Public)


  @param path= The full path of the folder to be created
  @param access_token_var= The global macro variable to contain the access token
  @param grant_type= valid values are "password" or "authorization_code" (unquoted).
    The default is authorization_code.


  @version VIYA V.03.04
  @author Allan Bowe
  @source https://github.com/sasjs/core

  <h4> SAS Macros </h4>
  @li mf_abort.sas
  @li mf_getuniquefileref.sas
  @li mf_getuniquelibref.sas
  @li mf_isblank.sas

**/

/* This is a comment
that spans
multiple lines */

%macro mv_createfolder(path=
  ,access_token_var=ACCESS_TOKEN
  ,grant_type=authorization_code
);`
