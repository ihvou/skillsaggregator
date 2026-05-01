# Hypothesis Validation

Date: 2026-05-01

The MVP specification requires H1-H4 to pass before enabling the live ingestion pipeline. This repository implements the pipeline, but the manual validations are pending until API credentials and network access are available.

| Hypothesis | Status | Notes |
|---|---|---|
| H1: YouTube Data API returns enough candidates | Pending | Requires `YOUTUBE_API_KEY`; run the documented `search.list` checks for forehand smash, drop shot, and split step. |
| H2: Transcripts are available for most candidates | Pending | Requires candidate video IDs from H1; run `youtube-transcript` checks and record success rate. |
| H3: Claude Haiku scores relevance reliably | Pending | Requires `ANTHROPIC_API_KEY` and a 10-video fixture set. |
| H4: Cross-AI triangulation adds useful signal | Pending | Requires `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, and `PERPLEXITY_API_KEY`. |
| H5: Density target after full pipeline | Pending | Run after H1-H4 pass and link-searcher has executed across the seed taxonomy. |
| H6: Google indexing | Pending | Post-launch Search Console check. |

## Validation Log Template

| Date | Hypothesis | Procedure | Result | Decision |
|---|---|---|---|---|
|  |  |  |  |  |
