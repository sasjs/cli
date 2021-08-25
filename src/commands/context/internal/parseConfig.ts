export function parseConfig(config: string) {
  try {
    const parsedConfig = JSON.parse(config)

    return parsedConfig
  } catch (err) {
    throw new Error('Context config file is not a valid JSON file.')
  }
}
