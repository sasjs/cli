import { printHelpText } from '../help'
import { Command } from '../../../utils/command'
import { sanitizeSpecialChars } from '@sasjs/utils/formatter'

describe('sasjs help', () => {
  describe('printHelpText', () => {
    it('should output information about all supported commands', async () => {
      const supportedCommands = new Command('').getAllSupportedCommands()

      let { outputCommands } = await printHelpText()

      outputCommands = sanitizeSpecialChars(outputCommands)

      for (const command of supportedCommands) {
        expect(outputCommands.includes(`* ${command}`)).toEqual(true)
      }
    })

    it('should output information about all supported aliases', async () => {
      const supportedAliases = new Command('').getAllSupportedAliases()

      let { outputAliases } = await printHelpText()

      outputAliases = sanitizeSpecialChars(outputAliases)

      for (const command of supportedAliases) {
        expect(outputAliases.includes(`* ${command}`)).toEqual(true)
      }
    })
  })
})
