# Hypothesis Validation

Date: 2026-05-01

The MVP specification requires H1-H4 to pass before enabling the live ingestion pipeline. This repository implements the pipeline, but the manual validations are pending until API credentials and network access are available.

| Hypothesis | Status | Notes |
|---|---|---|
| H1: YouTube Data API returns enough candidates | Pending | Run `npm run h1` with `YOUTUBE_API_KEY`; the check uses low-quota uploads playlists and writes `.validation/h1_candidates.json`. |
| H2: Transcripts are available for most candidates | Pending | Run `npm run h2` after H1; it samples H1 candidates and writes `.validation/h2_transcripts.json`. |
| H3: Claude Haiku scores relevance reliably | Pending | Run `npm run h3` after H2 with `ANTHROPIC_API_KEY`; compare `.validation/h3_scores.json` against hand grades. |
| H4: Cross-AI triangulation adds useful signal | Pending | Run `npm run h4` after H3 with `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, and `PERPLEXITY_API_KEY`. |
| H5: Density target after full pipeline | Pending | Run after H1-H4 pass and link-searcher has executed across the seed taxonomy. |
| H6: Google indexing | Pending | Post-launch Search Console check. |

## Validation Log Template

| Date | Hypothesis | Procedure | Result | Decision |
|---|---|---|---|---|
|  |  |  |  |  |
