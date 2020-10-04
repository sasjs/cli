import prompt from 'prompt'

/**
 * Gets values input from the command line
 * @param {Array} fields - the fields to get user input for. Each field should have at least a `name` property.
 * More information about fields available at https://github.com/flatiron/prompt#readme
 */
export async function getUserInput(fields) {
  prompt.message = ''
  prompt.start()
  return new Promise((resolve, reject) => {
    prompt.get(fields, (error, result) => {
      if (error) {
        reject(error)
      }
      resolve(result)
    })
  })
}

/**
 * Get input from the command line and validates it against the specified validator.
 * @param {object} field - the field to get user input for, should have at least a `name` property.
 * More information about fields available at https://github.com/flatiron/prompt#readme
 * @param {function} validator - an async validator function that resolves with a boolean value.
 * @param {string} message - the message to display when validation has failed.
 * @param {any} validatorParams - any additional parameters to be passed to the validator.
 */
export async function getAndValidateField(
  field,
  validator,
  message,
  validatorParams
) {
  const input = await getUserInput([field])
  const isValid = await validator(input[field.name], validatorParams)
  if (!isValid) {
    console.log(chalk.redBright.bold(message))
    return await getAndValidateField(field, validator, message)
  }
  return input[field.name]
}
