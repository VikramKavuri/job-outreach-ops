# Contributing

## Development workflow

1. Create a focused branch.
2. Export workflow changes into a temporary file outside `workflows/`.
3. Sanitize the export before review:

   ```powershell
   node scripts/sanitize-workflow.mjs path/to/export.json workflows/contextreach.json
   ```

4. Run `npm run validate`.
5. Test one synthetic sheet row in a non-production n8n instance.
6. Open a pull request describing behavior, cost impact, data impact, and rollback steps.

## Definition of done

- No embedded credentials, credential IDs, instance IDs, or personal test data.
- Every Gmail operation remains draft-only.
- Prompt changes preserve strict JSON output and evidence-only claims.
- Sheet schema changes update `docs/data-contract.md`.
- Operational changes update `docs/runbook.md`.
- The workflow imports successfully and a synthetic end-to-end run is reviewed.

Keep changes narrow. Generated n8n JSON is noisy, so explain intentional node-level changes in the pull request.
