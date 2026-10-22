// Close code the platform sends when it ends an established stream because the
// credential behind it is no longer usable — the password was replaced, the
// account was disabled, or the identity binding was removed.
//
// It is a 4xxx code, outside the range RFC 6455 reserves, and it is
// deliberately distinct from a normal closure (1000): "the server went away"
// is worth retrying, "your access was withdrawn" is not. A client that cannot
// tell them apart retries a stream the platform has just refused.
export const CREDENTIAL_REVOKED_CLOSE_CODE = 4001;

// What the user is told when that happens. Reconnecting cannot help, so the
// session is over and the only way forward is a new sign-in.
export const CREDENTIAL_REVOKED_MESSAGE = "Your access was withdrawn, so this connection was closed. Please sign in again.";
