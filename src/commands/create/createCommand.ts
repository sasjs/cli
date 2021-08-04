import { create } from './create'
import { CommandExample, ReturnCode } from '../../types/command'
import { CreateTemplate } from './createTemplate'
import { displayError } from '../../utils'
import { CommandBase } from '../../types'

const usage = 'Usage: sasjs create <project-name> [options]'
const example: CommandExample = {
  command: 'sasjs create my-app --template react',
  description:
    'Create a SASjs app in the specified folder. You can also specify a template to scaffold your app with.'
}

export class CreateCommand extends CommandBase {
  constructor(args: string[]) {
    const parseOptions: { [key: string]: Object } = {
      template: {
        alias: 't',
        choices: [
          CreateTemplate.Angular,
          CreateTemplate.React,
          CreateTemplate.Minimal,
          CreateTemplate.Jobs,
          CreateTemplate.SasOnly
        ]
      }
    }
    super(args, parseOptions, [], usage, example)
  }

  public get template(): CreateTemplate {
    return this.parsed.template as CreateTemplate
  }

  public get folderName() {
    return this.value || '.'
  }

  public async execute() {
    return await create(this.folderName, this.template)
      .then(() => {
        process.logger?.success(
          `Project ${
            this.folderName ? `${this.folderName} created` : `updated`
          } successfully.\nGet ready to Unleash your SAS!`
        )
        return ReturnCode.Success
      })
      .catch((err: any) => {
        displayError(err, 'Error while creating your project.')
        return ReturnCode.InternalError
      })
  }
}
