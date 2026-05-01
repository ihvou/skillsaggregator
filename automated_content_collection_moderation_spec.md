# Automated Content Collection and Moderation — MVP Concept

## 1. Purpose

This document summarizes the current product direction for the content collection and moderation system of the Learning Resource Aggregator.

The focus is **not** the whole product. This document only covers:

- collecting links per skill;
- collecting and updating skills under categories;
- checking existing links and skill assignments;
- agent/user-generated upvotes;
- unified moderation of all suggestions.

The guiding constraint is:

> Content collection should be automated as much as possible. Human moderation should be limited to a very simple approve/decline queue.

The system should avoid needing a content team. Agents can search, check, and suggest content, while a moderator only reviews compact suggestion cards.

---

## 2. Current Product Direction

The stronger MVP concept is:

> An automated learning-resource discovery system where independent agents and real users submit normalized suggestions into one shared moderation queue. Moderators approve or decline suggestions, and approved suggestions update the public skill/resource graph.

This is intentionally different from a manually curated directory.

The system has three layers:

| Layer | Responsibility | Examples |
|---|---|---|
| Suggestion producers | Find or check things and submit suggestions | Link Searcher agent, Link Checker agent, Skill Searcher agent, human user |
| Intake + moderation layer | Normalize, deduplicate, assign author, create queue items, approve/decline | Suggestion API, staging table, moderation queue |
| Main product layer | Public pages, user actions, stable content objects | Categories, skills, links, link-skill relations, upvotes |

Key design rule:

> Search/suggestion generation should be separated from moderation. Moderation should be the same no matter whether a suggestion came from a user, agent, script, or import process.

---

## 3. Main Decisions So Far

| Topic | Decision | Rationale |
|---|---|---|
| Agent independence | Agents should be structurally independent from the main app. | Keeps search/check logic separate from product logic. Easier to replace, tune, and test agents. |
| Suggestion submission | Agents should submit through an API or, if needed, write only into a strict staging/intake table. | Avoids agents directly mutating production content tables. |
| Common moderation | All suggestions use the same moderation flow. | Moderator should not care whether the source is a user or agent. |
| Moderator effort | Moderator only approves or declines. | Keeps human work low and predictable. |
| Internal users | Agent-generated suggestions can be authored by pre-created internal users. | Allows agent activity to appear in the same public contribution model as human activity. |
| Internal user flag | Internal users should be normal `users` records with special flags. | Keeps UI and authorship simple while preserving auditability. |
| Category interests | Internal users should have category interests stored in a real app table. | Allows agents/intake layer to pick the right author by category. |
| Skill updates for MVP | Only support creating and deleting skills under categories. | Keeps taxonomy moderation simple. |
| Link checking | Link checking should produce attach, detach, upvote, or combinations of these. | One link can be relevant to multiple skills and irrelevant to others. |
| Combined link-check result | A combined result should be split into separate moderation items. | Moderator may approve one action and decline another. |
| Link notes and level | Public note and skill level should usually live on the link-skill relation, not the link itself. | The same link can be useful for different skills in different ways. |
| Preview metadata | Store link preview metadata instead of fetching it on every page load. | Faster UI, better moderation cards, more stable previews, easier deduplication. |

---

## 4. Internal Users and Category Interests

### 4.1 Internal users

Internal users should live in the regular `users` table.

They should be marked with flags such as:

- `is_internal`
- `is_agent_actor`
- `status`

This allows internal users to behave like normal users in the contribution model while remaining distinguishable internally.

Example internal users:

| User | Category interests | Typical activity |
|---|---|---|
| Internal-user-1 | Surfing, Fitness | Suggests and checks links in those categories |
| Internal-user-2 | Surfing, Design, Programming | Suggests links and upvotes resources |
| Internal-user-3 | Fitness, Cooking, Language Learning | Suggests skills and checks links |

### 4.2 Where category interests should live

Category interests should be stored in an app-level join table, not only in agent configuration.

Recommended table:

### `user_category_interests`

| Field | Type | Notes |
|---|---|---|
| `id` | UUID / integer | Primary key |
| `user_id` | foreign key | Points to `users.id` |
| `category_id` | foreign key | Points to `categories.id` |
| `weight` | integer / decimal | Optional priority score for choosing this user |
| `is_active` | boolean | Allows disabling an interest without deleting it |
| `created_at` | datetime | Audit field |
| `updated_at` | datetime | Audit field |

### 4.3 Who should assign the author?

Best MVP approach:

> Agents submit the result and target category/skill/link. The intake layer assigns the internal author based on category interests.

This is better than letting each agent choose the final author because author assignment remains centralized and easier to change later.

Example author assignment logic:

1. Agent submits a suggestion for a skill in the `Surfing` category.
2. Intake layer finds internal users with active interest in `Surfing`.
3. Intake layer chooses one using weighted round-robin or another simple rule.
4. Suggestion is saved with `author_user_id` set to that internal user.

---

## 5. Suggestion Evidence

`SuggestionEvidence` does not need to be a separate entity for MVP.

For MVP, it can simply be an `evidence_json` field on the `suggestions` table.

It means:

> The supporting information that explains why the suggestion was created.

Examples:

| Suggestion type | Example evidence |
|---|---|
| Link add | Search query, source URL, extracted title, extracted description, transcript snippet, reason why it matches the skill |
| Attach skill | Existing link, proposed skill, evidence snippet showing the link covers that skill |
| Detach skill | Reason the link does not match the skill, contradictory evidence, low relevance explanation |
| Upvote skill | Why the link is relevant and high-quality for that skill |
| Skill create | Proposed skill name, parent category, why current category structure is missing it |
| Skill delete | Why the skill is invalid, duplicate, empty, or no longer useful |

Example `evidence_json` for a link suggestion:

```json
{
  "source": "youtube_search",
  "query": "surfing pop up beginner drill",
  "matched_skill": "Pop-up",
  "summary": "Video demonstrates a land-based pop-up drill for beginners.",
  "relevance_reason": "The video repeatedly explains body position and movement sequence for the surfing pop-up.",
  "quality_reason": "Clear demonstration, specific drill, non-promotional content.",
  "confidence": 0.86
}
```

---

## 6. Minimal Suggestion States

For MVP, the suggestion lifecycle can be very simple.

| State | Meaning |
|---|---|
| `pending` | Suggestion is waiting for moderator decision. |
| `approved` | Moderator approved it and the system applied the change. |
| `declined` | Moderator rejected it and no product change was made. |

No other states are required at MVP stage if approval immediately applies the change.

Later, if approval and execution become asynchronous, additional states may be useful:

| Later state | When it becomes useful |
|---|---|
| `applied` | Approval and application are separate steps. |
| `failed` | Approved suggestion could not be applied due to a technical error. |
| `superseded` | Suggestion was made irrelevant by another approved suggestion. |

For now, the recommended MVP states are only:

- `pending`
- `approved`
- `declined`

---

## 7. MVP Agents

The current agent set is:

| Agent | MVP priority | Input | Output |
|---|---:|---|---|
| Link Searcher | High | Skill | Link suggestions for that skill |
| Link Checker | High | Existing link, or existing link-skill relation | Attach skill, detach skill, upvote skill, or a combination |
| Skill Searcher | Optional | Category | Create skill or delete skill suggestion |

### 7.1 Link Searcher

Purpose:

> Find new useful links for existing skills.

Typical flow:

1. Picks a skill.
2. Searches trusted sources or the broader web, depending on configuration.
3. Extracts candidate links.
4. Filters for relevance and quality.
5. Submits link suggestions to the intake layer.

Output suggestion type:

- `LINK_ADD`

### 7.2 Link Checker

Purpose:

> Review existing links and their skill relationships.

Possible outcomes:

| Outcome | Meaning |
|---|---|
| Attach skill | Link also belongs to another skill. |
| Detach skill | Link is not relevant to a currently attached skill. |
| Upvote skill | Link is relevant and good for a skill. |
| Combination | Multiple of the above in one check result. |

Output suggestion types:

- `LINK_ATTACH_SKILL`
- `LINK_DETACH_SKILL`
- `LINK_UPVOTE_SKILL`

Important rule:

> A combined link-check result should be split into separate moderation items.

Example:

A surfing video was originally found for `Pop-up`, but the Link Checker sees that it also covers `Wave selection`.

The checker may output:

- upvote `Pop-up`
- attach `Wave selection`

The intake layer creates two separate moderation items:

1. `LINK_UPVOTE_SKILL` for `Pop-up`
2. `LINK_ATTACH_SKILL` for `Wave selection`

The moderator can approve both, approve only one, or decline both.

### 7.3 Skill Searcher

Purpose:

> Suggest simple changes to the category/skill structure.

For MVP, this should stay limited to:

- create skill under category;
- delete skill under category.

Output suggestion types:

- `SKILL_CREATE`
- `SKILL_DELETE`

This agent is optional for MVP because useful content can already be collected with existing categories and skills.

---

## 8. Unified Flow

All agents and users should follow the same general flow.

```text
Producer performs action
        ↓
Producer submits raw suggestion/event
        ↓
Intake layer validates and normalizes it
        ↓
Intake layer assigns internal author if needed
        ↓
Intake layer creates one or more moderation items
        ↓
Moderator approves or declines
        ↓
Approved suggestion updates product data
        ↓
Public pages reflect the change
```

### 8.1 Producer types

| Producer | Submission method | Notes |
|---|---|---|
| Human user | UI | Suggests links, skills, upvotes, attach/detach actions. |
| Link Searcher agent | API or staging table | Finds links for skills. |
| Link Checker agent | API or staging table | Checks existing links and relations. |
| Skill Searcher agent | API or staging table | Suggests creating/deleting skills. |
| Admin/import script | API or staging table | Useful for bulk imports later. |

---

## 9. Scenario 1 — Collecting Links Per Skill

### Goal

Find new resources for an existing skill.

### Example

Category: `Surfing`  
Skill: `Pop-up`

### Flow

| Step | Actor | Action |
|---:|---|---|
| 1 | Link Searcher | Picks the `Pop-up` skill. |
| 2 | Link Searcher | Searches for useful resources. |
| 3 | Link Searcher | Finds a video about beginner pop-up drills. |
| 4 | Link Searcher | Extracts URL, title, description, thumbnail, source, and summary. |
| 5 | Link Searcher | Submits raw result to intake. |
| 6 | Intake layer | Normalizes into `LINK_ADD`. |
| 7 | Intake layer | Assigns an internal author interested in `Surfing`. |
| 8 | Moderator | Reviews compact card. |
| 9 | Moderator | Approves or declines. |
| 10 | System | If approved, creates/updates `links` and creates `link_skill_relations`. |

### Moderation card should show

| Field | Example |
|---|---|
| Suggestion type | Add link |
| Skill | Surfing → Pop-up |
| Title | “Beginner Surf Pop-Up Drill” |
| URL/domain | YouTube / example URL |
| Preview | Thumbnail, title, description |
| Suggested public note | “Clear beginner drill for practicing pop-up sequence on land.” |
| Suggested skill level | Beginner |
| Evidence | Why agent thinks it matches the skill |
| Author | Internal-user assigned by category interest |
| Actions | Approve / Decline |

### Approval effect

If approved:

1. create or update `links` row;
2. create `link_skill_relations` row for `Pop-up`;
3. store suggested note/level on the relation if provided;
4. show the link on the public skill page.

---

## 10. Scenario 2 — Checking an Existing Link

### Goal

Improve accuracy of existing link-skill assignments and ranking signals.

### Example

Existing link:

- Video: “How to catch and ride green waves”
- Current skill: `Pop-up`
- Category: `Surfing`

The Link Checker reviews the video and finds:

- it is still relevant to `Pop-up`;
- it also covers `Wave selection`;
- quality is good enough to endorse.

### Raw checker result

```json
{
  "link_id": "link_123",
  "results": [
    {
      "action": "upvote_skill",
      "skill_id": "pop_up",
      "reason": "The video demonstrates pop-up timing and body position."
    },
    {
      "action": "attach_skill",
      "skill_id": "wave_selection",
      "reason": "The video explains how to identify and catch suitable green waves."
    }
  ]
}
```

### Intake output

The intake layer splits this into two moderation items:

| Queue item | Type | Target |
|---:|---|---|
| 1 | `LINK_UPVOTE_SKILL` | Link 123 + Pop-up |
| 2 | `LINK_ATTACH_SKILL` | Link 123 + Wave selection |

### Moderator can decide separately

| Decision | Result |
|---|---|
| Approve both | Link gets upvote for `Pop-up` and is also attached to `Wave selection`. |
| Approve upvote only | Link remains only under `Pop-up`, but gets stronger ranking signal. |
| Approve attach only | Link appears under `Wave selection`, but no upvote is added for `Pop-up`. |
| Decline both | No change. |

---

## 11. Scenario 3 — Detaching a Skill from a Link

### Goal

Remove irrelevant skill assignments.

### Example

A link is attached to `Pop-up`, but the checker determines it is actually about general board buying advice and does not teach pop-up technique.

### Flow

| Step | Actor | Action |
|---:|---|---|
| 1 | Link Checker | Picks existing link-skill relation. |
| 2 | Link Checker | Reviews the link content. |
| 3 | Link Checker | Determines skill is irrelevant. |
| 4 | Link Checker | Submits detach result. |
| 5 | Intake layer | Creates `LINK_DETACH_SKILL` suggestion. |
| 6 | Moderator | Approves or declines. |
| 7 | System | If approved, deactivates the relation. |

### Special rule

If the detached skill is the only active skill of the link, then approving the detach suggestion should also deactivate the link.

Recommended implementation:

- do not hard-delete the link;
- set `link_skill_relations.is_active = false`;
- if no active relations remain, set `links.is_active = false`.

This preserves audit history and makes undo/recovery easier.

---

## 12. Scenario 4 — Skill Structure Updates

### Goal

Keep category/skill structure simple and accurate.

For MVP, only two actions are supported:

- create skill under category;
- delete skill under category.

### Example: create skill

A Skill Searcher sees that many surfing resources discuss `Wave selection`, but there is no skill page for it.

| Step | Actor | Action |
|---:|---|---|
| 1 | Skill Searcher | Picks the `Surfing` category. |
| 2 | Skill Searcher | Finds repeated evidence for a missing skill. |
| 3 | Skill Searcher | Submits `SKILL_CREATE` suggestion. |
| 4 | Intake layer | Assigns internal author interested in `Surfing`. |
| 5 | Moderator | Approves or declines. |
| 6 | System | If approved, creates `Wave selection` under `Surfing`. |

### Example: delete skill

A Skill Searcher or user finds that a skill is invalid, duplicate, or not useful.

| Step | Actor | Action |
|---:|---|---|
| 1 | Skill Searcher/user | Selects skill. |
| 2 | Skill Searcher/user | Submits `SKILL_DELETE` suggestion. |
| 3 | Moderator | Approves or declines. |
| 4 | System | If approved, soft-deletes the skill. |

Recommended implementation:

- use soft delete for skills;
- set `skills.is_active = false`;
- optionally deactivate related link-skill relations.

---

## 13. Scenario 5 — Human User Suggestion Uses Same Flow

Human suggestions should not have a separate moderation system.

Example:

1. A human user submits a link for `Surfing → Pop-up`.
2. UI creates the same normalized suggestion type: `LINK_ADD`.
3. Suggestion enters the same moderation queue.
4. Moderator approves or declines.
5. If approved, the content graph is updated.

This keeps moderation consistent and allows later comparison of:

- human suggestion quality;
- agent suggestion quality;
- internal user quality;
- category-specific precision.

---

## 14. Suggestion Types

| Type | Producer examples | Meaning | Approval effect |
|---|---|---|---|
| `LINK_ADD` | Link Searcher, human user | Add a new URL to a skill. | Create/update `links`; create `link_skill_relations`. |
| `LINK_ATTACH_SKILL` | Link Checker, human user | Existing link should also belong to another skill. | Create active `link_skill_relations` row. |
| `LINK_DETACH_SKILL` | Link Checker, human user | Existing link should not belong to a skill. | Deactivate `link_skill_relations`; possibly deactivate link if no active skills remain. |
| `LINK_UPVOTE_SKILL` | Link Checker, human user | Link is relevant and good for a specific skill. | Increment/store an approved upvote for that link-skill relation. |
| `SKILL_CREATE` | Skill Searcher, human user | Add a new skill under a category. | Create `skills` row. |
| `SKILL_DELETE` | Skill Searcher, human user | Remove/deactivate a skill under a category. | Set `skills.is_active = false`. |

---

## 15. Data Structure Proposal

### 15.1 `users`

| Field | Type | Notes |
|---|---|---|
| `id` | UUID / integer | Primary key |
| `display_name` | string | Public display name |
| `username` | string | Optional unique handle |
| `is_internal` | boolean | Marks internally created users |
| `is_agent_actor` | boolean | Marks users used by agents |
| `status` | enum | `active`, `disabled`, etc. |
| `created_at` | datetime | Audit field |
| `updated_at` | datetime | Audit field |

Notes:

- Internal users are normal users with flags.
- Public display can use the same contribution UI as real users.
- Internally, the app can always filter or audit agent-authored activity.

### 15.2 `user_category_interests`

| Field | Type | Notes |
|---|---|---|
| `id` | UUID / integer | Primary key |
| `user_id` | foreign key | Internal or human user |
| `category_id` | foreign key | Category of interest |
| `weight` | number | Optional selection weight |
| `is_active` | boolean | Enables/disables the interest |
| `created_at` | datetime | Audit field |
| `updated_at` | datetime | Audit field |

Usage:

- Intake layer uses this table to assign internal authors.
- Later, human users can also have interests for personalization.

### 15.3 `categories`

| Field | Type | Notes |
|---|---|---|
| `id` | UUID / integer | Primary key |
| `name` | string | Category name, e.g. `Surfing` |
| `slug` | string | URL-safe identifier |
| `description` | text | Optional |
| `is_active` | boolean | Soft delete / visibility flag |
| `created_at` | datetime | Audit field |
| `updated_at` | datetime | Audit field |

### 15.4 `skills`

| Field | Type | Notes |
|---|---|---|
| `id` | UUID / integer | Primary key |
| `category_id` | foreign key | Parent category |
| `name` | string | Skill name, e.g. `Pop-up` |
| `slug` | string | URL-safe identifier |
| `description` | text | Optional |
| `is_active` | boolean | Soft delete / visibility flag |
| `created_at` | datetime | Audit field |
| `updated_at` | datetime | Audit field |

MVP does not need nested sub-skills unless the product later requires it.

### 15.5 `links`

This table stores generic URL-level metadata.

| Field | Type | Notes |
|---|---|---|
| `id` | UUID / integer | Primary key |
| `url` | text | Original submitted URL |
| `canonical_url` | text | Normalized/deduplicated URL |
| `domain` | string | Source domain, e.g. `youtube.com` |
| `title` | string | Stored preview title |
| `description` | text | Stored preview description |
| `thumbnail_url` | text | Stored preview thumbnail URL |
| `content_type` | enum/string | Video, article, podcast, course, etc. |
| `language` | string | Optional language code |
| `preview_status` | enum | `pending`, `fetched`, `failed` |
| `fetched_at` | datetime | Last preview fetch time |
| `is_active` | boolean | Soft delete / visibility flag |
| `created_at` | datetime | Audit field |
| `updated_at` | datetime | Audit field |

Important recommendation:

> Store preview metadata. Do not fetch title/description/thumbnail on every public page view.

### 15.6 `link_skill_relations`

This table represents the many-to-many relationship between links and skills.

It also stores learning-specific metadata.

| Field | Type | Notes |
|---|---|---|
| `id` | UUID / integer | Primary key |
| `link_id` | foreign key | Points to `links.id` |
| `skill_id` | foreign key | Points to `skills.id` |
| `public_note` | text | Optional note explaining why this link is useful for this skill |
| `skill_level` | enum | `beginner`, `intermediate`, `advanced`, or null |
| `upvote_count` | integer | Count of approved upvotes |
| `is_active` | boolean | Whether relation is currently live |
| `created_at` | datetime | Audit field |
| `updated_at` | datetime | Audit field |

Why `public_note` and `skill_level` belong here:

- the same link may be beginner-friendly for one skill but advanced for another;
- the same link may deserve different notes for different skills;
- moderation is usually about whether a link is useful for a specific skill, not globally useful.

### 15.7 `suggestions`

This is the core moderation table.

| Field | Type | Notes |
|---|---|---|
| `id` | UUID / integer | Primary key |
| `type` | enum | See suggestion types table |
| `status` | enum | `pending`, `approved`, `declined` |
| `author_user_id` | foreign key | Public author of the suggestion |
| `origin_type` | enum | `human`, `agent`, `admin`, `import` |
| `origin_name` | string | Optional agent/import name |
| `category_id` | foreign key, nullable | Relevant category |
| `skill_id` | foreign key, nullable | Relevant skill |
| `link_id` | foreign key, nullable | Relevant existing link |
| `payload_json` | JSON | Proposed change data |
| `evidence_json` | JSON | Why this suggestion was created |
| `dedupe_key` | string | Optional duplicate prevention key |
| `created_at` | datetime | Created time |
| `decided_at` | datetime, nullable | Decision time |
| `moderator_user_id` | foreign key, nullable | Moderator who decided |

### 15.8 Optional: `agent_runs`

This is optional but useful for debugging and quality measurement.

| Field | Type | Notes |
|---|---|---|
| `id` | UUID / integer | Primary key |
| `agent_type` | enum/string | `link_searcher`, `link_checker`, `skill_searcher` |
| `agent_version` | string | Version/config identifier |
| `target_type` | enum/string | `skill`, `link`, `category` |
| `target_id` | UUID / integer | ID of target object |
| `status` | enum | `started`, `completed`, `failed` |
| `suggestions_created` | integer | Count |
| `created_at` | datetime | Start time |
| `completed_at` | datetime | Completion time |

### 15.9 Optional: `incoming_suggestion_events`

Use this only if agents write to the database directly instead of using an API.

| Field | Type | Notes |
|---|---|---|
| `id` | UUID / integer | Primary key |
| `source` | string | Agent/script name |
| `raw_payload_json` | JSON | Raw agent output |
| `status` | enum | `new`, `processed`, `rejected`, `failed` |
| `created_at` | datetime | Created time |
| `processed_at` | datetime, nullable | Processing time |

Important rule:

> Agents may write into this staging table, but should not directly mutate `links`, `skills`, `link_skill_relations`, or approved `suggestions`.

---

## 16. Suggested `payload_json` Shapes

### 16.1 `LINK_ADD`

```json
{
  "url": "https://example.com/video",
  "canonical_url": "https://example.com/video",
  "title": "Beginner Surf Pop-Up Drill",
  "description": "A simple drill for practicing the pop-up movement.",
  "thumbnail_url": "https://example.com/thumb.jpg",
  "content_type": "video",
  "language": "en",
  "target_skill_id": "skill_pop_up",
  "public_note": "Clear beginner drill for practicing pop-up sequence on land.",
  "skill_level": "beginner"
}
```

### 16.2 `LINK_ATTACH_SKILL`

```json
{
  "link_id": "link_123",
  "target_skill_id": "skill_wave_selection",
  "public_note": "Useful explanation of how to identify rideable waves.",
  "skill_level": "beginner"
}
```

### 16.3 `LINK_DETACH_SKILL`

```json
{
  "link_id": "link_123",
  "target_skill_id": "skill_pop_up",
  "reason": "The video is about board selection, not pop-up technique."
}
```

### 16.4 `LINK_UPVOTE_SKILL`

```json
{
  "link_id": "link_123",
  "target_skill_id": "skill_pop_up",
  "reason": "Relevant, clear, and practical for this skill."
}
```

### 16.5 `SKILL_CREATE`

```json
{
  "category_id": "category_surfing",
  "name": "Wave selection",
  "description": "Choosing suitable waves based on shape, speed, position, and ability level."
}
```

### 16.6 `SKILL_DELETE`

```json
{
  "skill_id": "skill_old",
  "reason": "Duplicate of another skill and has no unique resources."
}
```

---

## 17. Moderation Queue UX

The queue should be unified but cards can be specialized by suggestion type.

### 17.1 Universal card fields

| Field | Purpose |
|---|---|
| Suggestion type | Shows what action is being proposed. |
| Author | Human or internal user shown as suggestion author. |
| Origin | Internal/audit field: human, agent, admin, import. |
| Category | Helps moderator understand context. |
| Skill | Shows target skill when applicable. |
| Link preview | Thumbnail, title, description, domain. |
| Proposed change | Clear one-line summary of the change. |
| Evidence/reason | Why the suggestion was made. |
| Actions | Approve / Decline. |

### 17.2 Card-specific display

| Suggestion type | Card should emphasize |
|---|---|
| `LINK_ADD` | URL preview, target skill, note, level, reason matched |
| `LINK_ATTACH_SKILL` | Existing link, new skill, reason link also belongs there |
| `LINK_DETACH_SKILL` | Existing link, current skill, reason relation is wrong |
| `LINK_UPVOTE_SKILL` | Existing link-skill relation, endorsement reason, current upvote count |
| `SKILL_CREATE` | New skill name, parent category, description |
| `SKILL_DELETE` | Existing skill, reason for deletion, number of affected links |

### 17.3 MVP actions

Only two buttons are required:

- Approve
- Decline

Optional later actions:

- Approve and edit
- Merge
- Reassign skill
- Request re-check

These should not be required for MVP.

---

## 18. Apply Rules After Approval

| Suggestion type | Apply rule |
|---|---|
| `LINK_ADD` | Create/update link by canonical URL, then create active link-skill relation. |
| `LINK_ATTACH_SKILL` | Create active relation if it does not exist; reactivate if it exists but inactive. |
| `LINK_DETACH_SKILL` | Set relation inactive. If link has no active relations left, set link inactive. |
| `LINK_UPVOTE_SKILL` | Add/increment approved upvote for that link-skill relation. |
| `SKILL_CREATE` | Create active skill under category. |
| `SKILL_DELETE` | Set skill inactive; optionally deactivate related relations. |

---

## 19. Dedupe and Queue Quality Rules

The moderation queue must not become noisy. The system should avoid showing 99 irrelevant items out of 100.

### 19.1 Dedupe keys

| Suggestion type | Suggested dedupe key |
|---|---|
| `LINK_ADD` | `canonical_url + target_skill_id` |
| `LINK_ATTACH_SKILL` | `link_id + target_skill_id + attach` |
| `LINK_DETACH_SKILL` | `link_id + target_skill_id + detach` |
| `LINK_UPVOTE_SKILL` | `link_id + target_skill_id + author_user_id + upvote` |
| `SKILL_CREATE` | `category_id + normalized_skill_name` |
| `SKILL_DELETE` | `skill_id + delete` |

### 19.2 Queue quality filters

Before creating a moderation item, the intake layer should check:

| Filter | Purpose |
|---|---|
| Canonical URL dedupe | Avoid repeated link suggestions. |
| Existing relation check | Avoid suggesting an already-active link-skill relation. |
| Source trust | Prefer known useful domains/channels/sources. |
| Relevance threshold | Reject or hide low-confidence matches. |
| Quality threshold | Avoid thin, spammy, or promotional content. |
| Category match | Ensure the agent result belongs to the target category. |
| Duplicate skill check | Avoid creating duplicate skills. |

For MVP, it is better to have lower recall and higher precision.

Meaning:

> It is acceptable to miss some good links. It is not acceptable to flood the moderator with mostly irrelevant suggestions.

---

## 20. Ranking and Upvotes

Upvotes should be specific to a link-skill relationship.

Good interpretation:

> This link is relevant and useful for this specific skill.

Less useful interpretation:

> This link is generally good.

Reason:

The same link can be strong for one skill and weak for another.

### Recommended MVP behavior

| Case | Behavior |
|---|---|
| Agent upvote | Create `LINK_UPVOTE_SKILL` suggestion. Moderator approves/declines. |
| Human user upvote | Can use same suggestion flow at first. Later, trusted users may upvote directly. |
| Approved upvote | Increments upvote count or creates an approved vote record. |
| Declined upvote | No ranking change. |

### Note on queue load

Moderating every upvote can become busywork if volume grows.

MVP can start this way, but later the product may need:

- trust thresholds;
- automatic approval for trusted users;
- aggregation of repeated endorsements;
- spam detection.

---

## 21. Public Display of Internal User Activity

The product can display internal-user activity in the same contribution format as human-user activity.

However, the database should preserve the distinction:

| Field | Purpose |
|---|---|
| `author_user_id` | Who is shown as the suggestion author. |
| `origin_type` | Whether it came from human, agent, admin, or import. |
| `origin_name` | Which agent/script created it, if applicable. |
| `is_internal` on user | Whether the displayed user is internally created. |
| `is_agent_actor` on user | Whether this user is used for agent-authored activity. |

Product/trust note:

- The UI can use the same layout for internal and human users.
- Internally, the system should never lose track of which actions are agent-originated.
- The safest public presentation is to avoid making false claims that internal users are ordinary humans.

---

## 22. MVP Build Order

Recommended order if focusing only on content collection and moderation:

| Phase | Build | Why |
|---:|---|---|
| 1 | Core tables: categories, skills, links, link-skill relations, suggestions | Needed for everything else. |
| 2 | Unified moderation queue with approve/decline | Central operating system. |
| 3 | Link Searcher intake flow | Starts content collection. |
| 4 | Link Checker intake flow | Improves relation quality and ranking signals. |
| 5 | Internal users + category interests | Allows agent suggestions to appear through consistent author identities. |
| 6 | Preview metadata fetch/storage | Makes moderation and public cards usable. |
| 7 | Skill create/delete suggestions | Optional but useful for taxonomy maintenance. |
| 8 | Upvote moderation | Adds ranking/quality signal. |

An alternative order is to build internal users earlier if public contributor identity is important from the first demo.

---

## 23. Minimal MVP Scope

### Include

| Feature | Include? | Notes |
|---|---:|---|
| Link suggestions per skill | Yes | Core content collection. |
| Link checker attach/detach/upvote | Yes | Core quality improvement. |
| Shared moderation queue | Yes | Required. |
| Internal users with flags | Yes | Required if agent activity is authored publicly. |
| Category interests table | Yes | Needed for author assignment. |
| Stored link preview metadata | Yes | Strongly recommended. |
| Skill create/delete suggestions | Maybe | Useful, but can be second priority. |
| Human suggestions | Maybe | Easy if same suggestion API is already built. |

### Exclude or delay

| Feature | MVP decision | Reason |
|---|---|---|
| Complex taxonomy operations | Delay | Merge, rename, move can wait. |
| Comments/discussions | Delay | High moderation burden. |
| Fully automatic publishing without moderation | Delay | Trust risk. |
| Agents directly editing production tables | Avoid | Harder to audit and control. |
| Advanced moderation actions | Delay | Approve/decline is enough for MVP. |

---

## 24. Open Questions

| Question | Current leaning |
|---|---|
| Should Skill Searcher be in MVP? | Optional. Link Searcher + Link Checker are enough to start. |
| Should internal users be publicly labeled as internal/agent-assisted? | Product decision. Safer for trust, but public activity can still use the same UI format. |
| Should human upvotes require moderation? | At first, yes if consistency is desired. Later, trusted users may bypass moderation. |
| Should link previews cache thumbnails locally or only store remote URLs? | Store metadata first; local image caching can be added later if needed. |
| Should approval immediately apply changes? | Yes for MVP. Add asynchronous states only if needed. |

---

## 25. Final Summary

The current MVP architecture is a **suggestion-driven content system**.

Agents and users do not directly change public content. They create suggestions.

The intake layer normalizes suggestions, assigns authorship, stores evidence, splits combined actions, and sends items to one common moderation queue.

The moderator only approves or declines.

Approved suggestions update the stable product graph:

- categories;
- skills;
- links;
- link-skill relations;
- upvotes.

The most important design choice is keeping the system modular:

> Agents are independent producers. The app owns moderation, application of decisions, and the stable content model.

This lets the product collect content automatically while keeping public quality under simple human control.
