export { DrumreelClient } from './client.js'
export { AuthError, DrumreelError } from './errors.js'
export {
  clearCredentials,
  configDir,
  credentialsPath,
  DEFAULT_API_BASE,
  loadCredentials,
  resolveApiBase,
  resolveApiKey,
  saveCredentials,
} from './credentials.js'
export { waitForJob, type PollOptions } from './poll.js'
export { pkgVersion } from './version.js'
export type {
  ClientOptions,
  CreateJobRequest,
  CreateJobResponse,
  CredentialsFile,
  Job,
  JobStatus,
  ListJobsResponse,
  RerunMode,
  VideoResponse,
} from './types.js'
export { TERMINAL_STATUSES } from './types.js'
