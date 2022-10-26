import { AddCommand } from '../../commands/add/addCommand'
import { BuildCommand } from '../../commands/build/buildCommand'
import { CompileBuildCommand } from '../../commands/build/compileBuildCommand'
import { CompileCommand } from '../../commands/compile/compileCommand'
import { ContextCommand } from '../../commands/context/contextCommand'
import { CreateCommand } from '../../commands/create/createCommand'
import { DbCommand } from '../../commands/db/dbCommand'
import { CompileBuildDeployCommand } from '../../commands/deploy/compileBuildDeployCommand'
import { DeployCommand } from '../../commands/deploy/deployCommand'
import { DocsCommand } from '../../commands/docs/docsCommand'
import { TestCommand } from '../../commands/testing/testCommand'
import { VersionCommand } from '../../commands/version/versionCommand'
import { WebCommand } from '../../commands/web/webCommand'
import { FolderCommand } from '../../commands/folder/folderCommand'
import { ServicePackCommand } from '../../commands/servicepack/servicePackCommand'
import { InitCommand } from '../../commands/init/initCommand'
import { RunCommand } from '../../commands/run/runCommand'
import { RequestCommand } from '../../commands/request/requestCommand'
import { HelpCommand } from '../../commands/help/helpCommand'
import { JobCommand } from '../../commands/job/jobCommand'
import { LintCommand } from '../../commands/lint/lintCommand'
import { FlowCommand } from '../../commands/flow/flowCommand'
import { FSCommand } from '../../commands/fs/fsCommand'

export const commandFactory = new Map<string, Function>([
  ['add', (args: string[]) => new AddCommand(args)],
  ['build', (args: string[]) => new BuildCommand(args)],
  ['compile', (args: string[]) => new CompileCommand(args)],
  ['compilebuild', (args: string[]) => new CompileBuildCommand(args)],
  [
    'compilebuilddeploy',
    (args: string[]) => new CompileBuildDeployCommand(args)
  ],
  ['create', (args: string[]) => new CreateCommand(args)],
  ['context', (args: string[]) => new ContextCommand(args)],
  ['db', (args: string[]) => new DbCommand(args)],
  ['deploy', (args: string[]) => new DeployCommand(args)],
  ['doc', (args: string[]) => new DocsCommand(args)],
  ['folder', (args: string[]) => new FolderCommand(args)],
  ['fs', (args: string[]) => new FSCommand(args)],
  ['help', (args: string[]) => new HelpCommand(args)],
  ['init', (args: string[]) => new InitCommand(args)],
  ['job', (args: string[]) => new JobCommand(args)],
  ['lint', (args: string[]) => new LintCommand(args)],
  ['flow', (args: string[]) => new FlowCommand(args)],
  ['request', (args: string[]) => new RequestCommand(args)],
  ['run', (args: string[]) => new RunCommand(args)],
  ['servicepack', (args: string[]) => new ServicePackCommand(args)],
  ['version', (args: string[]) => new VersionCommand(args)],
  ['test', (args: string[]) => new TestCommand(args)],
  ['web', (args: string[]) => new WebCommand(args)]
])

export const getAllSupportedCommands = () => commandFactory.keys()
