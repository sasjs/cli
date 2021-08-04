export const validateTargetName = (targetName: string): string => {
  // if targetName contain falsy Value just return that value
  if (!targetName) return targetName

  targetName = targetName.trim()
  if (targetName.includes(' '))
    throw new Error(
      'Target names cannot include spaces. Please try again with a valid target name.'
    )

  if (!/^[a-zA-Z0-9][a-zA-Z0-9\-]+$/i.test(targetName))
    throw Error(
      'Target names can only contain alphanumeric characters. Please try again with a valid target name.'
    )

  return targetName
}
