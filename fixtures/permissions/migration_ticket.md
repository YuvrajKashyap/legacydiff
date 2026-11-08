# Synthetic permission rewrite ticket

Add explicit deny precedence and reject unknown actions. Preserve the existing role lookup for other requests.
This ticket does not waive tenant isolation; matching legacy and rewrite outputs may still share a security defect.
