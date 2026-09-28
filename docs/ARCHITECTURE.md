# Architecture

```mermaid
flowchart LR
  subgraph Browser
    V[/submit/verify]
    B[/submit/bond]
    I[/submit/interview]
    E[Article editor]
    R[/article/id]
  end

  subgraph Server["Next.js server (no attestation)"]
    VS[/api/verify/start]
    VC[/api/verify]
    BD[/api/bond]
    IV[/api/interview]
    GN[/api/generate]
    ES[/api/publish/estimate]
    PB[/api/publish]
    AR[/api/articles]
    ST[(session store\nHMAC-hashed tokens\n2h expiry)]
  end

  RC[Reclaim attestors]
  GM[Google Gemini API]
  SN[(Starknet Sepolia\nArticleRegistry)]
  POOL[(STRK20 pool\nblocked paths)]

  V -->|start| VS --> ST
  VS -->|signed request, no secret| V
  V -->|proof flow| RC
  RC -->|proof| V -->|verificationId + proof| VC
  VC -->|verifyProof, bind, consume| ST
  VC -->|token + recovery code| V
  B --> BD -->|503 blocked| B
  I -->|token + messages| IV --> GM
  I -->|draft| GN --> GM
  E -->|estimate| ES -->|estimateInvokeFee| SN
  E -->|approvedDigest| PB -->|publish_article, wait ACCEPTED_ON_L2, read back| SN
  R --> AR -->|callContract latest| SN
  BD -.->|not connected| POOL
```

Deployed on Sepolia: `0x2be142c378dbf4f9480196d484b9e22363887ef523ee3cde332a4fa2fe4f6f0` (class `0xb78be67c801a4735dd175bf55c7cc9c64cc620f6e37f3d921bad124c1dfd44`).

## Data flow rules

- The publisher account signs every publication. The source never connects a wallet.
- The article id is `0x` + first 31 bytes of SHA-256 over the canonical JSON `{version, title, subtitle, body, sourceStatus, allegationStatus}` after NFC normalization and trimming. The contract receives it as both `article_id` and `approved_digest`.
- Text is stored as 31-byte big-endian felt chunks per section (title 0, subtitle 1, body 2) with byte lengths in `ArticleMeta`. Reads page 128 chunks at a time. `decodeText` pads each chunk to its expected width so leading zero bytes survive.
- Limits: title 180, subtitle 420 bytes in both Cairo and TypeScript. Body: contract hard cap 24576, product limit 16384 in TypeScript (set from the Sepolia fee benchmark). Both are checked before a transaction is built.
- The session store is the only server state. Records: verification (10 min), capability (2 h), rate-limit windows.

## Contract interface

```
publish_article(article_id, approved_digest, title_byte_length, title: Span<felt252>, subtitle_byte_length, subtitle, body_byte_length, body)
get_article_count() -> u64
get_article_id(index) -> felt252
get_article_meta(article_id) -> ArticleMeta
get_article_chunks(article_id, section, offset, limit<=128) -> Array<felt252>
set_publisher(publisher)   // owner only
get_publisher() -> ContractAddress
event ArticlePublished(article_id, approved_digest, published_at, byte lengths, version)
```
