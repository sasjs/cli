import { AddCredentialCommand } from '../../commands/add/addCredentialCommand'
import { AddTargetCommand } from '../../commands/add/addTargetCommand'
import { BuildCommand } from '../../commands/build/buildCommand'
import { CompileBuildCommand } from '../../commands/build/compileBuildCommand'
import { CompileCommand } from '../../commands/compile/compileCommand'
import { CreateContextCommand } from '../../commands/context/createContextCommand'
import { DeleteContextCommand } from '../../commands/context/deleteContextCommand'
import { EditContextCommand } from '../../commands/context/editContextCommand'
import { ExportContextCommand } from '../../commands/context/exportContextCommand'
import { ListContextCommand } from '../../commands/context/listContextCommand'
import { CreateCommand } from '../../commands/create/createCommand'
import { DbCommand } from '../../commands/db/dbCommand'
import { CompileBuildDeployCommand } from '../../commands/deploy/compileBuildDeployCommand'
import { DeployCommand } from '../../commands/deploy/deployCommand'
import { GenerateDocsCommand } from '../../commands/docs/generateDocsCommand'
import { GenerateDotCommand } from '../../commands/docs/generateDotCommand'
import { InitDocsCommand } from '../../commands/docs/initDocsCommand'
import { TestCommand } from '../../commands/testing/testCommand'
import { ListFolderCommand } from '../../commands/folder/listFolderCommand'
import { VersionCommand } from '../../commands/version/versionCommand'
import { WebCommand } from '../../commands/web/webCommand'
import { CreateFolderCommand } from '../../commands/folder/createFolderCommand'
import { DeleteFolderCommand } from '../../commands/folder/deleteFolderCommand'
import { ServicePackCommand } from '../../commands/servicepack/servicePackCommand'
// import { FlowExecuteCommand } from '../../commands/flow/flowExecuteCommand'

export const commandFactory = new Map<string, Function>([
  ['add', (args: string[]) => new AddTargetCommand(args)],
  ['add cred', (args: string[]) => new AddCredentialCommand(args)],
  ['build', (args: string[]) => new BuildCommand(args)],
  ['compile', (args: string[]) => new CompileCommand(args)],
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
  ['doc', (args: string[]) => new GenerateDocsCommand(args)],
  ['doc init', (args: string[]) => new InitDocsCommand(args)],
  ['doc lineage', (args: string[]) => new GenerateDotCommand(args)],
  ['folder create', (args: string[]) => new CreateFolderCommand(args)],
  ['folder delete', (args: string[]) => new DeleteFolderCommand(args)],
  ['folder list', (args: string[]) => new ListFolderCommand(args)],
  // ['flow execute', (args: string[]) => new FlowExecuteCommand(args)]
  ['servicepack', (args: string[]) => new ServicePackCommand(args)],
  ['version', (args: string[]) => new VersionCommand(args)],
  ['test', (args: string[]) => new TestCommand(args)],
  ['web', (args: string[]) => new WebCommand(args)]
])
