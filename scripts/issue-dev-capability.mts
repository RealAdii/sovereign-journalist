// Development only. Issues a capability token without a Reclaim proof so the
// AI backend can be exercised end to end with curl. Refuses to run in
// production and without the dev bypass. Shares the session store with the dev
// server through SESSION_STORE_PATH.
import { issueCapability } from "../src/lib/session.ts";

if (process.env.NODE_ENV === "production" || process.env.ALLOW_DEV_WITHOUT_PRIVATE_BOND !== "true") {
  console.error("Refusing: development bypass is not enabled.");
  process.exit(2);
}
const issued = issueCapability({ provider: "dev-fixture", parameters: { role: "staff" }, verifiedAt: new Date().toISOString() });
console.log(JSON.stringify({ token: issued.token, bondStatus: issued.bondStatus, expiresAt: issued.expiresAt }));
