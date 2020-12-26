import { printHelpText } from '../help'
import { Command } from '../../../utils/command'

describe('sasjs help', () => {
  describe('printHelpText', () => {
    it('should output information about all supported commands', async () => {
      const supportedCommands = new Command().getAllSupportedCommands()

      let { outputCommands } = await printHelpText()

      outputCommands = sanitizeChalkInsertions(outputCommands)

      for (const command of supportedCommands) {
        expect(outputCommands.includes(`* ${command}`)).toEqual(true)
      }
    })

    it('should output information about all supported aliases', async () => {
      const supportedAliases = new Command().getAllSupportedAliases()

      let { outputAliases } = await printHelpText()

      outputAliases = sanitizeChalkInsertions(outputAliases)

      for (const command of supportedAliases) {
        expect(outputAliases.includes(`* ${command}`)).toEqual(true)
      }
    })
  })
})

// delete extra characters inserted by chalk
const sanitizeChalkInsertions = (str: string) =>
  str.replace(
    /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g,
    ''
  )
