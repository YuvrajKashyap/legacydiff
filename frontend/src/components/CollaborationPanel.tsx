/** Show confirmed room membership and connection availability. */
import type { LegacyDiffState } from "../view-model";
import "../styles/collaboration.css";

export function CollaborationPanel({
  roomId,
  state,
}: {
  roomId: string;
  state: LegacyDiffState;
}) {
  const room = state.rooms.find((item) => item.id === roomId);
  return (
    <section className="collaboration-panel" aria-label="Collaboration">
      <header>
        <h3>Work together</h3>
        <span className="collaboration-connection">
          {state.ready ? "Connected to workspace" : "Connection unavailable"}
        </span>
      </header>
      <p>
        Review the same comparison, discuss evidence, then let a reviewer
        approve the exact proposal.
      </p>
      <p className="collaboration-local">
        This workspace runs locally. Remote teammates cannot join through a
        localhost link; shared hosting is not enabled.
      </p>
      {!state.ready && (
        <p role="status">
          Membership below is the last received state. Presence is unknown until
          the connection returns.
        </p>
      )}
      <ul className="collaboration-members" aria-label="Room members">
        {room?.members.map((member) => {
          // Presence belongs to the room, not to a particular comparison or open tab.
          const present =
            state.ready &&
            state.presence.some(
              (item) =>
                item.roomId === roomId && item.identity === member.identity,
            );
          return (
            <li key={member.identity}>
              <div>
                <strong>{member.label}</strong>
                {member.identity === state.identity && <span> (you)</span>}
                <small>{member.role}</small>
              </div>
              <span>
                {!state.ready
                  ? "Presence unknown"
                  : present
                    ? "Present in room"
                    : "Not currently present"}
              </span>
            </li>
          );
        })}
      </ul>
      {!room && <p>Room membership has not loaded.</p>}
      <p className="collaboration-help">
        A new identity requests admission. The room owner grants access and a
        role using the room access controls.
      </p>
    </section>
  );
}
