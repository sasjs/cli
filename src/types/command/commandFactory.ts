import { AddCredentialCommand } from '../../commands/add/addCredentialCommand'
import { AddTargetCommand } from '../../commands/add/addTargetCommand'
import { BuildCommand } from '../../commands/build/buildCommand'
import { CompileBuildCommand } from '../../commands/build/compileBuildCommand'
import { CompileCommand } from '../../commands/compile/compileCommand'
import { CompileSingleFileCommand } from '../../commands/compile/compileSingleFileCommand'
import { CreateCommand } from '../../commands/create/createCommand'
import { FlowExecuteCommand } from '../../commands/flow/flowExecuteCommand'

export const commandFactory = new Map<string, Function>([
  ['add', (args: string[]) => new AddTargetCommand(args)],
  ['add cred', (args: string[]) => new AddCredentialCommand(args)],
  ['build', (args: string[]) => new BuildCommand(args)],
  ['compile', (args: string[]) => new CompileCommand(args)],
  ['compile job', (args: string[]) => new CompileSingleFileCommand(args)],
  ['compile service', (args: string[]) => new CompileSingleFileCommand(args)],
  ['compile identify', (args: string[]) => new CompileSingleFileCommand(args)],
  ['compilebuild', (args: string[]) => new CompileBuildCommand(args)],
  ['create', (args: string[]) => new CreateCommand(args)],
  ['flow execute', (args: string[]) => new FlowExecuteCommand(args)]
])
