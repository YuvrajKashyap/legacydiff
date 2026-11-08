/**
 * Connect the database tables and operations to Spacetime.
 * Add new database operations here so clients can call them.
 */
export { default } from "./schema";
export {
  createRoom,
  requestJoin,
  admitMember,
  visibleRooms,
  visibleRequests,
  visiblePresence,
  heartbeat,
  disconnected,
} from "./rooms";
export {
  startRun,
  publishProposal,
  approveProposal,
  addComment,
  pinEvidence,
  setReviewState,
  cancelRun,
} from "./reviews";
export {
  initialize,
  setWorker,
  updateCatalog,
  recordArtifact,
  workerJobs,
  workerRooms,
  claimJob,
  commitJob,
  recordActivity,
  recordComparison,
  recoverExpiredJobs,
} from "./worker";

export * from "./scenarios";
