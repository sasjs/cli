import { FormatOptions } from '@sasjs/lint'

/** The reprint pass, as `@sasjs/lint` expects it. */
export type Reprint = NonNullable<FormatOptions['reprint']>

/** How the engine is loaded, so a test can supply one instead. */
export type EngineLoader = () => Promise<Reprint>

let engine: Promise<Reprint> | undefined

/**
 * A dynamic import that survives compilation to CommonJS.
 *
 * `@sasjs/sas-language` publishes ES modules, and this CLI compiles with
 * `module: "commonjs"`, which rewrites `import()` into `require()`. That only
 * works because the Node versions this CLI supports can `require` an ES module -
 * a support that has changed between majors and is not something a formatter
 * should be resting on silently. Keeping the import genuinely dynamic leaves the
 * decision to the runtime, on every version, and is what makes the subpath import
 * a real one rather than a require in disguise.
 */
const dynamicImport = new Function('specifier', 'return import(specifier)') as (
  specifier: string
) => Promise<any>

/**
 * Loads the engine from the package, which is ES modules.
 */
/* istanbul ignore next -- the one loader jest cannot execute: it is a dynamic
   import of an ES module, which jest's module runtime refuses. Every real run of
   the command goes through it; the contract above it is covered with injected
   loaders, the engine's own suite covers what it returns, and the built output is
   exercised directly - see the PR discussion. */
const fromPackage: EngineLoader = () =>
  dynamicImport('@sasjs/sas-language/format').then(
    (module) => module.formatText
  )

/**
 * The SAS layout engine, loaded on first use and kept.
 *
 * Every command in this CLI starts in the time it takes to load its own module
 * graph, and `sasjs format` is one of twenty-odd commands - so the engine is
 * loaded when a format actually runs (~25 ms for the graph, then ~2 ms a file)
 * rather than by being imported at the top of the command.
 *
 * A rejection is dropped rather than kept: the failure may be transient, and a
 * cached rejection would leave every later format in this process rule-only.
 * `load` exists for tests, whose module runtime cannot require an ES module.
 */
export const getFormatEngine = (
  load: EngineLoader = fromPackage
): Promise<Reprint> =>
  (engine ??= load().catch((error) => {
    engine = undefined

    throw error
  }))
