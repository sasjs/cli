import { AddCredentialCommand } from '../../commands/add/addCredentialCommand'
import { AddTargetCommand } from '../../commands/add/addTargetCommand'
import { BuildCommand } from '../../commands/build/buildCommand'
import { CompileBuildCommand } from '../../commands/build/compileBuildCommand'
import { CompileCommand } from '../../commands/compile/compileCommand'
import { CompileSingleFileCommand } from '../../commands/compile/compileSingleFileCommand'
import { CreateContextCommand } from '../../commands/context/createContextCommand'
import { DeleteContextCommand } from '../../commands/context/deleteContextCommand'
import { EditContextCommand } from '../../commands/context/editContextCommand'
import { ExportContextCommand } from '../../commands/context/exportContextCommand'
import { ListContextCommand } from '../../commands/context/listContextCommand'
import { CreateCommand } from '../../commands/create/createCommand'
import { DbCommand } from '../../commands/db/dbCommand'
import { CompileBuildDeployCommand } from '../../commands/deploy/compileBuildDeployCommand'
import { DeployCommand } from '../../commands/deploy/deployCommand'
import { TestCommand } from '../../commands/testing/testCommand'
import { VersionCommand } from '../../commands/version/versionCommand'
import { WebCommand } from '../../commands/web/webCommand'
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
  [
    'compilebuilddeploy',
    (args: string[]) => new CompileBuildDeployCommand(args)
  ],
  ['create', (args: string[]) => new CreateCommand(args)],
  ['context create', (args: string[]) => new CreateContextCommand(args)],
  ['context delete', (args: string[]) => new DeleteContextCommand(args)],
  ['context edit', (args: string[]) => new EditContextCommand(args)],
  ['context export', (args: string[]) => new ExportContextCommand(args)],
  ['context list', (args: string[]) => new ListContextCommand(args)],
  ['db', (args: string[]) => new DbCommand(args)],
  ['deploy', (args: string[]) => new DeployCommand(args)],
  // ['flow execute', (args: string[]) => new FlowExecuteCommand(args)]
  ['version', (args: string[]) => new VersionCommand(args)],
  ['test', (args: string[]) => new TestCommand(args)],
  ['web', (args: string[]) => new WebCommand(args)]
])
