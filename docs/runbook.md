# Operations runbook

## Deployment checklist

1. Rotate the Google CSE and Apify credentials that appeared in the original artifact.
2. Set all variables from `.env.example` in the n8n runtime or secret manager.
3. Import `workflows/job-outreach-ops.json`; keep it inactive.
4. Bind local Google Sheets OAuth2, Gmail OAuth2, and Gemini credentials.
5. Confirm that all three audience Gmail nodes show the **Draft** resource.
6. Confirm the spreadsheet and worksheet selectors resolve correctly.
7. Run `npm run validate` from the repository.
8. Execute one synthetic row and inspect every external call and write.

## Release verification

Success means all of the following are true:

- Exactly the first row with all five required fields and blank `Status` is processed.
- The correct physical sheet row is updated.
- Profile claims in draft copy can be traced to input or enrichment data.
- Candidate achievements can be traced to `My_resume`.
- Invalid or absent contact emails do not enter the Gmail loop.
- Gmail contains drafts and no message was automatically sent.
- No secret or full payload appears in execution logs.

## Routine operation

1. Add or review target rows.
2. Execute manually.
3. Inspect the n8n execution for provider errors or malformed JSON.
4. Review sheet outputs for correct row placement.
5. Review every Gmail draft for recipient, factual claims, tone, and relevance.
6. Send manually only when policy and applicable law permit it.

## Incident response

### Suspected secret exposure

Stop executions, revoke the affected credential at the provider, replace the runtime secret, inspect logs and repository history, then document scope and timing. Sanitizing a file is not sufficient revocation.

### Wrong recipient or unsupported claim

Do not send the draft. Preserve the execution ID, identify whether the fault came from source data, enrichment, mapping, or generation, correct the narrowest stage, and retest with synthetic data.

### Wrong sheet row updated

Stop executions and restore affected cells from sheet version history. Verify the `Validate Job Intake` node preserves `row_number` before filtering. Do not bulk rerun until a single interleaved processed/unprocessed test passes.

### Provider outage or rate limit

Leave the workflow inactive, inspect the failed node and provider status, and retry a single row after recovery. Avoid repeated manual retries that can duplicate drafts or consume quota.

## Rollback

Keep the previous sanitized workflow export as a tagged release artifact. To roll back, deactivate the current workflow, import the last known-good export as a new inactive workflow, bind credentials, run one synthetic verification, and only then retire the faulty version.

## Suggested service indicators

Track successful rows per execution, approved drafts per generated draft, provider error rate, p95 execution duration, cost per approved draft, malformed JSON rate, and factual corrections per review. These metrics reveal whether automation is actually improving outcomes instead of merely increasing output.
