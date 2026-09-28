import { TIP_MISSING } from "@/lib/capabilities";
import { jsonError } from "@/lib/request";

export const dynamic = "force-dynamic";

// The encrypted tip path is capability-gated and currently blocked. This route
// exists so the UI has a single truthful answer and so nothing is stored.
export async function POST() {
  return jsonError(
    "Encrypted tips are not accepted yet. Nothing you typed was stored or sent.",
    503,
    { missing: TIP_MISSING },
  );
}
