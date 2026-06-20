# Workflow reference

This document describes the complete executable graph in `workflows/job-outreach-ops.json`. All 35 nodes are reachable from `Start Outreach Run`; CI fails if a disconnected node is introduced.

## 1. Intake and admission control

| # | Node | Responsibility | Why it exists |
|---:|---|---|---|
| 1 | `Start Outreach Run` | Manual n8n trigger | Keeps quota consumption and external outreach preparation under explicit operator control. |
| 2 | `Read Outreach Sheet` | Reads the configured worksheet | Establishes Google Sheets as the source of job context and processing state. |
| 3 | `Validate Job Intake` | Requires company, title, location, job description, resume, and blank status | Prevents incomplete or previously started rows from consuming provider calls. Preserves the physical sheet row before filtering. |
| 4 | `Select First Ready Job` | Keeps the first eligible row | Bounds one execution to one job and processes the sheet top-to-bottom. |
| 5 | `Normalize Job Context` | Resolves header aliases into stable fields | Decouples downstream nodes from harmless differences such as `My Resume` versus `My_resume`. |

## 2. Contact discovery and ranking

| # | Node | Responsibility | Why it exists |
|---:|---|---|---|
| 6 | `Build Contact Search Queries` | Builds recruiter, manager, and peer LinkedIn X-ray searches | Produces three role-aware and location-aware searches without hard-coded geography or job families. Carries the actual resume forward. |
| 7 | `Search Query Loop` | Iterates over the three query items | Serializes query execution and emits one completion event after all searches finish. |
| 8 | `Google CSE Search` | Calls Google Custom Search | Retrieves candidate URLs and snippets from a configured search engine. API key and engine ID come from runtime environment variables. |
| 9 | `Parse Search Results` | Validates and normalizes LinkedIn profile results | Removes malformed or irrelevant entries and retains the category/job context required downstream. |
| 10 | `Group Candidate Profiles` | Regroups loop output by audience | Reconstructs one object containing recruiter, manager, and employee candidate arrays plus job metadata. |
| 11 | `Build Ranking Prompt` | Builds a compact evidence-only selection request | Gives the model the real job description, resume, and discovered candidates while prohibiting new URLs and unsupported inference. |
| 12 | `Rank Contact Candidates` | Selects up to four contacts per audience | Uses Gemini Flash at low temperature for constrained classification/ranking rather than free-form copywriting. |
| 13 | `Parse Ranked Contacts` | Parses strict JSON and maps contacts to sheet columns | Rejects malformed model output, copies URLs, pads missing positions, and carries the source-row context. |

## 3. Enrichment and context assembly

| # | Node | Responsibility | Why it exists |
|---:|---|---|---|
| 14 | `Prepare Profile Enrichment` | Emits one item for each valid selected LinkedIn URL | Ensures only profile-shaped URLs reach the enrichment provider and carries source-row context with each item. |
| 15 | `Enrich Selected Profiles` | Invokes the configured Apify actor | Retrieves structured public profile context and available contact data. Runs once per valid selected profile, up to twelve times. |
| 16 | `Build Grounded Contact Context` | Normalizes profiles, matches URLs, truncates long fields, and attaches emails | Creates bounded evidence blocks for the drafting models while avoiding raw provider payloads in prompts. |
| 17 | `Merge Job and Contact Context` | Combines normalized job/resume fields with enriched contacts | Produces the single canonical object used by all three drafting stages. It runs only after enrichment completes. |

## 4. Recruiter drafting

| # | Node | Responsibility | Why it exists |
|---:|---|---|---|
| 18 | `Draft Recruiter Outreach` | Generates up to four recruiter messages | Uses the job, resume, and recruiter evidence; asks for routing to the appropriate hiring team without inventing familiarity. |
| 19 | `Parse Recruiter Drafts` | Parses JSON and maps subject/body fields | Keeps model parsing separate from persistence and sets `Status` to `In Progress`. |
| 20 | `Persist Recruiter Drafts` | Updates the sheet row matched by `row_number` | Creates an observable checkpoint before any Gmail operation. |
| 21 | `Queue Recruiter Drafts` | Emits only contacts with an email-like address | Prevents blank recipients from reaching Gmail. Maximum queue size is four. |
| 22 | `Recruiter Draft Loop` | Iterates through recruiter draft items | Routes each item to Gmail; its completion output starts manager drafting. |
| 23 | `Create Recruiter Gmail Draft` | Creates a Gmail draft | Explicitly uses the Gmail `draft` resource. Returns to the loop until the queue is empty. |

## 5. Manager drafting

| # | Node | Responsibility | Why it exists |
|---:|---|---|---|
| 24 | `Draft Manager Outreach` | Generates up to four manager messages | Connects one documented resume fact to an explicit role requirement and avoids assuming hiring ownership. |
| 25 | `Parse Manager Drafts` | Parses JSON and maps manager draft fields | Preserves the same output contract as recruiter drafting and leaves status `In Progress`. |
| 26 | `Persist Manager Drafts` | Updates manager fields on the matching row | Provides a second durable checkpoint. |
| 27 | `Queue Manager Drafts` | Emits manager drafts with valid recipients | Bounds Gmail work to available contacts. |
| 28 | `Manager Draft Loop` | Iterates through manager draft items | Starts peer drafting only after manager draft creation finishes. |
| 29 | `Create Manager Gmail Draft` | Creates a Gmail draft | Keeps delivery human-controlled and returns to the loop. |

## 6. Peer drafting and completion

| # | Node | Responsibility | Why it exists |
|---:|---|---|---|
| 30 | `Draft Peer Outreach` | Generates up to four peer messages | Leads with a request for role/team insight and prohibits invented common ground. |
| 31 | `Parse Peer Drafts` | Parses JSON and maps peer draft fields | Sets final workflow status to `Drafted` after successful model output. |
| 32 | `Persist Peer Drafts` | Writes peer fields and final status to the matching row | Marks the row complete from the automation's perspective. |
| 33 | `Queue Peer Drafts` | Emits peer drafts with valid recipients | Prevents empty-recipient Gmail calls. |
| 34 | `Peer Draft Loop` | Iterates through peer draft items | Provides the final bounded delivery loop. |
| 35 | `Create Peer Gmail Draft` | Creates a Gmail draft | Ends with content in the operator's review queue; it never sends automatically. |

## Loop semantics

n8n's Loop Over Items node exposes a loop output and a done output. Each audience loop routes individual items to its Gmail draft node and routes completion to the next audience. The Gmail node returns to the loop. This is why manager drafting cannot start until all recruiter drafts are created, and peer drafting cannot start until all manager drafts are created.

## Invariants enforced in CI

- Every node is reachable from the manual trigger.
- All connection sources and targets exist.
- Exactly four Gemini nodes and three audience Gmail nodes exist.
- Every Gmail node uses the `draft` resource.
- Intake validation contains all five required business fields.
- The workflow remains inactive and contains no credential bindings or instance metadata.
- Runtime configuration references exist and embedded secret patterns do not.
