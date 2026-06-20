#!/usr/bin/env node

import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const [sourceArg, destinationArg, removeSourceFlag] = process.argv.slice(2);

if (!sourceArg || !destinationArg) {
  console.error('Usage: node scripts/sanitize-workflow.mjs <source.json> <destination.json> [--remove-source]');
  process.exit(1);
}

const source = resolve(sourceArg);
const destination = resolve(destinationArg);
const workflow = JSON.parse(await readFile(source, 'utf8'));

const envExpression = (name) => `={{ $env.${name} }}`;
const groundingPolicy = [
  '',
  '**GROUNDING AND SAFETY POLICY:**',
  '- Use only facts explicitly present in the supplied row, resume, or profile data.',
  '- Never invent achievements, tenure, projects, relationships, company initiatives, or familiarity.',
  '- When supporting evidence is missing, use neutral language or leave that item empty.',
  '- Produce drafts for human review; never imply that an email was sent.',
].join('\n');

workflow.name = 'Job Outreach Ops: Review-First Outreach Automation';
workflow.active = false;
workflow.pinData = {};

for (const key of ['id', 'versionId', 'meta']) delete workflow[key];

for (const node of workflow.nodes ?? []) {
  // Credential IDs are installation-specific. Importers must bind credentials locally.
  delete node.credentials;

  if (node.type === 'n8n-nodes-base.googleSheets') {
    node.parameters.documentId = {
      __rl: true,
      value: envExpression('OUTREACH_SPREADSHEET_ID'),
      mode: 'id',
    };
    node.parameters.sheetName = {
      __rl: true,
      value: envExpression('OUTREACH_SHEET_NAME'),
      mode: 'name',
    };
  }

  if (node.name === 'Filter Unprocessed Rows') {
    node.parameters.jsCode = `const items = $input.all();

// Preserve the original sheet position before filtering. Using the filtered
// array index can update the wrong row when processed and unprocessed rows mix.
const rows = items.map((item, index) => {
  const json = item.json || {};
  json.sheetRowNumber = json.row_number ?? json.rowNumber ?? index + 2;
  item.json = json;
  return item;
});

const unprocessed = rows.filter((item) => {
  const json = item.json || {};
  const value = (
    json['Recruiter1_name'] ??
    json['Recruiter1 name'] ??
    json['Recruiter1 Name'] ??
    ''
  ).toString().trim();
  return value === '';
});

console.log(\`Unprocessed rows: \${unprocessed.length}\`);
return unprocessed;`;
  }

  if (node.name === 'HTTP Request') {
    const parameters = node.parameters.queryParameters?.parameters ?? [];
    for (const parameter of parameters) {
      if (parameter.name === 'key') parameter.value = envExpression('GOOGLE_CSE_API_KEY');
      if (parameter.name === 'cx') parameter.value = envExpression('GOOGLE_CSE_ID');
    }
  }

  if (node.name === 'Apify Scraper') {
    node.parameters.url = String(node.parameters.url).split('?')[0];
    const parameters = node.parameters.queryParameters?.parameters ?? [];
    const token = parameters.find((parameter) => parameter.name === 'token');
    if (token) token.value = envExpression('APIFY_API_TOKEN');
  }

  // A node name is not a safety control: explicitly force every Gmail operation to draft mode.
  if (node.type === 'n8n-nodes-base.gmail') {
    node.parameters.resource = 'draft';
    node.parameters.sendTo = '={{ $json.recipientEmail }}';
  }

  if (node.type === '@n8n/n8n-nodes-langchain.googleGemini') {
    const isSearch = ['Search LinkedIn Profiles', 'Rank Contact Candidates'].includes(node.name);
    const isRecruiter = node.name.startsWith('Gemini - Recruiters') || node.name === 'Draft Recruiter Outreach';
    node.parameters.options = {
      ...(node.parameters.options ?? {}),
      temperature: isSearch ? 0.1 : 0.2,
      maxOutputTokens: isSearch ? 2500 : isRecruiter ? 3000 : 1600,
    };

    for (const message of node.parameters.messages?.values ?? []) {
      if (typeof message.content === 'string' && !message.content.includes('GROUNDING AND SAFETY POLICY')) {
        message.content += groundingPolicy;
      }
    }
  }
}

await mkdir(dirname(destination), { recursive: true });
await writeFile(destination, `${JSON.stringify(workflow, null, 2)}\n`, 'utf8');

if (removeSourceFlag === '--remove-source' && source !== destination) {
  await rm(source);
}

console.log(`Sanitized workflow written to ${destination}`);
