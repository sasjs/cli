import { AddCredentialCommand } from '../../commands/add/addCredentialCommand'
import { AddTargetCommand } from '../../commands/add/addTargetCommand'
import { BuildCommand } from '../../commands/build/buildCommand'
import { CompileBuildCommand } from '../../commands/build/compileBuildCommand'
import { CompileCommand } from '../../commands/compile/compileCommand'
import { CompileSingleFileCommand } from '../../commands/compile/compileSingleFileCommand'
import { CreateContextCommand } from '../../commands/context/createContextCommand'
import { EditContextCommand } from '../../commands/context/editContextCommand'
import { CreateCommand } from '../../commands/create/createCommand'
// import { FlowExecuteCommand } from '../../commands/flow/flowExecuteCommand'

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
  ['context create', (args: string[]) => new CreateContextCommand(args)],
  ['context edit', (args: string[]) => new EditContextCommand(args)]
  // ['flow execute', (args: string[]) => new FlowExecuteCommand(args)]
])
