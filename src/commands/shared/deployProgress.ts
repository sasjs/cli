import { DeployProgress } from '@sasjs/adapter'

/**
 * The line printed for each member of a service pack as the deploy writes it.
 *
 * A Viya deploy is one REST call per folder, file and job definition, run in
 * sequence - it is not one upload. Without a line per member the services phase
 * of a streamed pack (dozens of serial job-definition POSTs, each carrying the
 * whole compiled program inline) is minutes of silence that reads as a hang.
 */
export const deployProgressLine = (progress: DeployProgress) =>
  `Creating ${progress.type} ${progress.index}/${progress.total}: ${progress.name} in ${progress.parentFolder}`
