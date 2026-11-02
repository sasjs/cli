export enum ReturnCode {
  Success,
  InvalidCommand,
  InternalError,
  LintError,
  // `init` refusing a folder that is already a SASjs project. Distinct from
  // InvalidCommand, which also covers unparseable arguments, so a script can
  // tell a refusal from a bad invocation.
  AlreadyInitialised,
  // `logcheck` found issues at or above the configured failure policy. Kept
  // apart from LintError so a pipeline can tell a code-quality failure from a
  // run SAS complained about.
  LogCheckError,
  // A flow finished without every job succeeding. Distinct from InternalError,
  // which also covers a bad source file or an unreachable server, so a pipeline
  // can tell "the flow failed" from "the CLI could not run the flow".
  FlowError
}
