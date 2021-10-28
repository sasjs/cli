import { printHelpText } from '../help'
import { sanitizeSpecialChars } from '@sasjs/utils/formatter'
import { getAllSupportedCommands } from '../../../types/command/commandFactory'
import { getAllSupportedAliases } from '../../../types/command/commandAliases'

describe('sasjs help', () => {
  describe('printHelpText', () => {
    it('should output information about all supported commands', async () => {
      const supportedCommands = getAllSupportedCommands()

      let { outputCommands } = await printHelpText()

      outputCommands = sanitizeSpecialChars(outputCommands)

      for (const command of supportedCommands) {
        expect(outputCommands.includes(`* ${command}`)).toEqual(true)
      }
    })

    it('should output information about all supported aliases', async () => {
      const supportedAliases = getAllSupportedAliases()

      let { outputAliases } = await printHelpText()

      outputAliases = sanitizeSpecialChars(outputAliases)

      for (const command of supportedAliases) {
        expect(outputAliases.includes(`* ${command}`)).toEqual(true)
      }
    })
  })
})
