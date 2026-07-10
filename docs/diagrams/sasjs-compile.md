# `sasjs compile` (`sasjs c`) logic

Scope: `src/commands/compile/compile.ts`, `src/commands/compile/internal/*`. Entry
point is `compile(target, forceCompile)` at `compile.ts:40`.

## Top-level flow

```mermaid
flowchart TD
    Start(["compile(target, forceCompile) — compile.ts:40"]) --> Check["checkCompileStatus(target, ['tests']) — checkCompileStatus.ts:10\ncompares sasjsbuild/services & sasjsbuild/jobs against source folders via compareFolders()"]
    Check --> Skip{"result.compiled && !forceCompile?"}
    Skip -->|yes| Log["log 'Skipping compilation.' + reason, return"]
    Skip -->|no| Recreate["recreateBuildFolder() — delete + recreate sasjsbuild/"]
    Recreate --> Copy["copyFilesToBuildFolder(target) — compile.ts:109\ncopy() each service/job source folder verbatim into sasjsbuild/services|jobs"]
    Copy --> CJST["compileJobsServicesTests(target, compileTree) — compile.ts:141\n(see subgraph below)"]
    CJST --> MacroTests["for each macroFolder: copyTestMacroFiles()\nthen compileFile() on every *.test.sas found under sasjsbuild/tests/macros"]
    MacroTests --> SaveTree["compileTree.saveTree() → {target}_compileTree.json"]
    SaveTree --> Flow["compileTestFlow(target) — errors logged, not thrown\n(see subgraph below)"]
    Flow --> Web{"streamConfig.streamWeb enabled?"}
    Web -->|yes| WebGen["createWebAppServices(target) — compiles streaming web app services"]
    Web -->|no| Sync
    WebGen --> Sync["syncFolder(target): copySyncFolder() for config.syncFolder and target.syncFolder"]
    Sync --> End(["done"])
```

## `compileJobsServicesTests` — per-file dispatch

```mermaid
flowchart TD
    A["compileJobsServicesTests(target, compileTree) — compile.ts:141"] --> B["getAllFolders(target, Service) / getAllFolders(target, Job)\ngetMacroFolders(target) / getProgramFolders(target)\ngetTestSetUp(target) / getTestTearDown(target) — raw testConfig.testSetUp/testTearDown string"]
    B --> C{"testSetUp configured?"}
    C -->|yes| D["compileTestFile(target, testSetUp, '', saveToRoot=true, removeOriginalFile=false, compileTree)\n→ written flat as sasjsbuild/tests/{basename}"]
    C -->|no| E
    D --> E{"testTearDown configured?"}
    E -->|yes| F["compileTestFile(..., testTearDown, saveToRoot=true, ...) → sasjsbuild/tests/{basename}"]
    E -->|no| G
    F --> G["for each serviceFolder: compileServiceFolder(...)\nfor each jobFolder: compileJobFolder(...)"]
    G --> H["per file in folder (incl. one level of subfolders):\nisTestFile(fileName)?"]
    H -->|yes, *.test.sas| I["compileTestFile(target, filePath, '', saveToRoot=false, ..., compileTree)\n→ preserves path fragment after buildDestinationFolder name,\ninside sasjsbuild/tests/{services|jobs}/..."]
    H -->|no| J["compileFile(target, filePath, macroFolders, programFolders, ..., fileType, sourceFolder)\n→ loadDependencies() resolves %macro/[include] headers, writes resolved SAS in place"]
```

## `compileTestFile` — destination path resolution

```mermaid
flowchart TD
    A["compileTestFile(target, filePath, testVar, saveToRoot, removeOriginalFile, compileTree, destinationPath?) — compileTestFile.ts:68"] --> B["loadDependencies(target, absolutePath(filePath), macroFolders, programFolders, SASJsFileType.test, compileTree)\n→ resolves %macro/[include] headers into final SAS content"]
    B --> C["dependencies = (testVar ? testVar + newline : '') + newline + dependencies"]
    C --> D{"destinationPath explicitly given?"}
    D -->|yes| F["use it as-is"]
    D -->|no| E["getTestFileDestinationFragment(filePath, buildDestinationFolderName, saveToRoot) — compileTestFile.ts:44\n(see subgraph below)"]
    E --> F2["destinationPath = join(buildDestinationTestFolder, fragment)"]
    F --> G["createFile(destinationPath, dependencies)"]
    F2 --> G
    G --> H{"removeOriginalFile?"}
    H -->|yes| I["deleteFile(filePath) — source removed"]
    H -->|no| J["source left in place"]
```

```mermaid
flowchart TD
    A["getTestFileDestinationFragment(filePath, buildDestinationFolderName, saveToRoot)"] --> B["segments = filePath.split(/[\\\\/]/) — splits on both '/' and '\\'\nregardless of host OS or which separator the input string uses"]
    B --> C{"saveToRoot?"}
    C -->|true, e.g. testSetUp/testTearDown| D["return segments.pop() || ''\n→ just the file's basename, flattened to build-test-folder root"]
    C -->|false, e.g. service/job test files| E["reduce over segments: drop everything up to and\nincluding buildDestinationFolderName, keep the remainder,\njoin with path.sep\n→ preserves the relative path fragment under services/jobs"]
```

## `compileTestFlow` — building `testFlow.json` + coverage

```mermaid
flowchart TD
    A["compileTestFlow(target) — compileTestFile.ts:130"] --> B{"sasjsbuild/tests folder exists?"}
    B -->|no| Z["return undefined"]
    B -->|yes| C["testFiles = listFilesAndSubFoldersInFolder(buildDestinationTestFolder)\nprefixed with 'tests/'"]
    C --> D{"testSetUp / testTearDown configured\n(target.testConfig or root sasjsconfig.json)?"}
    D --> E["match by basename against testFiles;\nremove matched entry from testFiles list,\nset testFlow.testSetUp / testFlow.testTearDown = 'tests/{basename}'\n(no match found → left unset, file stays a regular/standalone test entry)"]
    E --> F["testFlow.tests = remaining testFiles (posix-joined)"]
    F --> G["printTestCoverage(testFlow, buildDestinationFolder, target)"]
    G --> H["collectCoverage() over sasjsbuild/services, sasjsbuild/jobs,\nand each macro folder (excluding *.test.sas)"]
    H --> I["for each coverable file, check whether a matching entry\nexists in testFlow.tests (by stripping .test[.N].sas suffix)\n→ covered vs notCovered; unmatched testFlow entries → 'standalone'"]
    I --> J["log coverage table + per-type percentage\nwrite testFlow.json = { tests, testSetUp?, testTearDown? } to buildDestinationFolder"]
```

## Key facts

- `checkCompileStatus` can make `compile()` a no-op: it diffs source vs already-compiled
  output folder-by-folder (`compareFolders`) and skips work entirely unless
  `forceCompile` is passed or something actually changed.
- `testSetUp`/`testTearDown` are compiled once, flattened to the root of
  `sasjsbuild/tests/` (`saveToRoot = true`); all other `*.test.sas` files found under
  service/job folders are compiled with their relative path preserved under
  `sasjsbuild/tests/{services|jobs}/...` (`saveToRoot = false`). Both paths go through
  `getTestFileDestinationFragment(filePath, buildDestinationFolderName, saveToRoot)`
  in `compileTestFile.ts`, which splits on both `/` and `\` so the result doesn't
  depend on which separator style the input path happens to use.
- Macro test files (`*.test.sas` under any macro folder) are handled separately via
  `copyTestMacroFiles()` (copy into `sasjsbuild/tests/macros`, skipping files that
  already exist at the destination) + a second `compileFile()` pass to resolve their
  dependencies - this happens after `compileJobsServicesTests`, not inside it.
- `compileTestFlow` only ever *reads* whatever already landed in
  `sasjsbuild/tests` - it doesn't compile anything itself, it just assembles
  `testFlow.json` and prints/writes coverage. If a configured `testSetUp`/
  `testTearDown` doesn't match any actual compiled file by basename, it's silently
  left unset and the corresponding file (if any) is treated as a regular test.
- Dependency resolution (`%macro`/program includes) for every non-test file goes
  through `loadDependencies()` → `loadDependenciesFile()` (from `@sasjs/utils`), which
  is also memoized per-file via the `compileTree` (`{target}_compileTree.json`) to
  avoid recomputing dependencies across compiles.
- `loadDependencies()` resolves `%macro` calls against `macroFolders`/`programFolders`
  (from the target/config) plus `process.sasjsConstants.macroCorePath`, for macros from
  `@sasjs/core`. `macroCorePath` is computed once per run in `setConstants()`
  (`src/utils/setConstants.ts`), in this order: the `macroCorePath` env var if set,
  else `@sasjs/core` resolved starting from `process.projectDir` (the user's own
  project - via `getNodeModulePath('@sasjs/core', process.projectDir)`), else
  `@sasjs/core` resolved relative to `@sasjs/cli`'s own install location, as a
  fallback for projects that haven't installed `@sasjs/core` themselves.
