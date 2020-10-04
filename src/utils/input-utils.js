import prompt from 'prompt'

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
