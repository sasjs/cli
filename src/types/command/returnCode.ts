export enum ReturnCode {
  Success,
  InvalidCommand,
  InternalError,
  LintError,
  // `init` refusing a folder that is already a SASjs project. Distinct from
  // InvalidCommand, which also covers unparseable arguments, so a script can
  // tell a refusal from a bad invocation.
  AlreadyInitialised
}
