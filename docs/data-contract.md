# Data contract

The workflow treats the first worksheet row as headers. Header matching for core inputs is case- and punctuation-tolerant, but canonical names keep operations predictable.

## Required inputs

| Header | Required | Purpose |
|---|---:|---|
| `SNo` | Recommended | Stable operator-facing row identifier |
| `Company Name` | Yes | Target organization |
| `Job Title` | Yes | Target role |
| `Location` | Recommended | Search and personalization context |
| `Job Link` | Recommended | Source-of-truth job reference |
| `Job Description` | Yes | Role requirements used for matching |
| `My_resume` | Yes | Resume summary used as the only source for candidate claims |
| `Status` | Yes | Must be blank for admission; becomes `In Progress`, then `Drafted` |

The workflow accepts common aliases such as `Company`, `Title`, `JD`, and `My Resume`, but downstream generated columns use fixed names. A row is ready only when company, title, location, job description, and resume are populated and `Status` is blank.

## Generated contact fields

Up to four contacts are handled for each audience:

- `Recruiter{1..4}_name`, `Recruiter{1..4}_email_id`, and `Recruiter{1..4}_linkedln_profile_link`
- `Manager{1..4}_name`, `Manager{1..4}_email_id`, and `Manager{1..4}_linkedln_link`
- `Employee{1..4}_name`, `Employee{1..4}_email_id`, and `Employee{1..4}_linkedln_link`

`linkedln` is intentionally documented with the workflow's current spelling. Renaming it requires coordinated updates across search parsing, enrichment, and sheet mapping nodes.

## Generated draft fields

Each contact can receive:

- `{Audience}{1..4}_draft_subject`
- `{Audience}{1..4}_draft_body`

Only records containing an email-like recipient value enter a Gmail loop. Gmail nodes create drafts and do not send messages.

## Validation recommendations

- Use synthetic test data before introducing personal information.
- Keep one row per company/role combination.
- Require non-empty company, role, job description, and resume summary cells.
- Protect generated columns from manual schema drift.
- Do not use a generated contact field as proof that the contact data is accurate or current.
