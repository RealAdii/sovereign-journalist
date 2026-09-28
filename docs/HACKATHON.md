# STRK20 Private Sprint alignment

Source of truth for the sprint: https://github.com/starkience/strk20-hackathon (README, IDEAS.md, projects.json, checked 2026-09-28). The sprint ran 2026-08-14 to 2026-09-07 on mainnet; this project is a Sepolia build that follows the same conventions so it can be registered as a follow-on or resubmitted when a mainnet decision is made (docs/MAINNET_CHECKLIST.md).

## What the panel reads

- `strk20.json` at the repository root: transactions, contracts, demo_url, demo_video. Ours lists the Sepolia registry, its declare and deploy transactions, and the three benchmark publications. `demo_url` is filled in once the Vercel deployment exists.
- Judging: STRK20 integration depth 30%, working product 30%, innovation 25%, documentation and open-source quality 15%.
- This project maps to RFP-02, "Anonymous whistleblower platform with proof-of-authorship".

## Registry entry (the user opens this pull request)

Add to `registry.json` in a fork of `starkience/strk20-hackathon`:

```json
{
  "repo_url": "https://github.com/RealAdii/sovereign-journalist",
  "telegram": ["adiihq"],
  "name": "Sovereign Journalist",
  "one_liner": "Prove a credential, get interviewed by an open model in a GPU TEE, approve every word, publish the full article into a Starknet contract. Bond and tips through STRK20.",
  "category": "Consumer",
  "inspired_by": "RFP-02"
}
```

## Conventions borrowed from sprint projects

| Project | What we reuse | Where |
| --- | --- | --- |
| PATRON (private tips) | Block bonds at or below the pool fee; read the fee live from `get_fee_amount`; never attribute activity to `tx.from`; say plainly that shielding is public | bond quote fee floor, threat model |
| XENIA (private payment links) | Official Sepolia prover and discovery URLs; "ask them to register" UX for unregistered recipients; MIT escrow with Deposit / Claim / Refund as the fallback bond design | `.env.example`, BondGate, docs/COMPATIBILITY.md |
| strk20-indexer | Disclosure that the hosted proving service receives proving inputs and that feed hosts see IP and timing | threat model |
| trustx | Honest statement when a "TEE" endpoint is not actually confidential hardware | attestation endpoint copy |

## Not claimed

No mainnet transactions, no sprint prize eligibility, no audit. The encrypted tip path stays blocked.
