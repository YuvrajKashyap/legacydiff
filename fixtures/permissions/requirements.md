# Independent synthetic security requirements

Explicit deny always denies. Missing grants, unauthenticated subjects, and unknown actions default to deny. Tenant mismatch always denies.
Whenever mandatory policy denies, protected_fields must be empty even if the implementation incorrectly reports allowed. Requirements apply independently to both implementations and cannot be approved away.
