#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const workflowPath = resolve(process.argv[2] ?? 'workflows/contextreach.json');
const raw = await readFile(workflowPath, 'utf8');
const errors = [];
let workflow;

try {
  workflow = JSON.parse(raw);
} catch (error) {
  console.error(`Invalid JSON: ${error.message}`);
  process.exit(1);
}

const fail = (condition, message) => {
  if (condition) errors.push(message);
};

fail(!workflow.name, 'workflow.name is required');
fail(!Array.isArray(workflow.nodes) || workflow.nodes.length === 0, 'workflow.nodes must be non-empty');
fail(!workflow.connections || typeof workflow.connections !== 'object', 'workflow.connections is required');
fail(workflow.active !== false, 'exported workflow must remain inactive');
fail(['id', 'versionId', 'meta'].some((key) => key in workflow), 'instance metadata must not be committed');

const names = new Set();
for (const node of workflow.nodes ?? []) {
  fail(names.has(node.name), `duplicate node name: ${node.name}`);
  names.add(node.name);
  fail('credentials' in node, `credential binding committed on node: ${node.name}`);
  if (node.type === 'n8n-nodes-base.gmail') {
    fail(node.parameters?.resource !== 'draft', `Gmail node is not draft-only: ${node.name}`);
  }
  if (node.type === 'n8n-nodes-base.googleSheets' && node.parameters?.operation === 'update') {
    const matchingColumns = node.parameters?.columns?.matchingColumns ?? [];
    fail(
      matchingColumns.length !== 1 || matchingColumns[0] !== 'row_number',
      `Sheets update must match row_number: ${node.name}`,
    );
  }

  const parameterText = JSON.stringify(node.parameters ?? {});
  const references = parameterText.matchAll(/\$\(['"]([^'"]+)['"]\)|\$node\[["']([^"']+)["']\]/g);
  for (const reference of references) {
    const referencedName = reference[1] ?? reference[2];
    fail(!names.has(referencedName) && !workflow.nodes.some((candidate) => candidate.name === referencedName),
      `node reference does not exist in ${node.name}: ${referencedName}`);
  }
}

const trigger = (workflow.nodes ?? []).find((node) => node.type === 'n8n-nodes-base.manualTrigger');
fail(!trigger, 'manual trigger is required');

if (trigger) {
  const reachable = new Set();
  const queue = [trigger.name];
  while (queue.length > 0) {
    const current = queue.shift();
    if (reachable.has(current)) continue;
    reachable.add(current);
    for (const lanes of Object.values(workflow.connections?.[current] ?? {})) {
      for (const lane of lanes ?? []) {
        for (const edge of lane ?? []) queue.push(edge.node);
      }
    }
  }
  for (const name of names) fail(!reachable.has(name), `node is unreachable from trigger: ${name}`);
}

const intake = (workflow.nodes ?? []).find((node) => node.name === 'Validate Job Intake');
fail(!intake, 'Validate Job Intake node is required');
for (const field of ['companyName', 'jobTitle', 'location', 'jobDescription', 'resume']) {
  fail(!intake?.parameters?.jsCode?.includes(field), `intake validation is missing required field: ${field}`);
}

const geminiNodes = (workflow.nodes ?? []).filter((node) =>
  node.type === '@n8n/n8n-nodes-langchain.googleGemini'
);
const gmailNodes = (workflow.nodes ?? []).filter((node) => node.type === 'n8n-nodes-base.gmail');
fail(geminiNodes.length !== 4, `expected 4 reachable Gemini nodes, found ${geminiNodes.length}`);
fail(gmailNodes.length !== 3, `expected 3 audience Gmail nodes, found ${gmailNodes.length}`);

for (const [source, channels] of Object.entries(workflow.connections ?? {})) {
  fail(!names.has(source), `connection source does not exist: ${source}`);
  for (const lanes of Object.values(channels ?? {})) {
    for (const lane of lanes ?? []) {
      for (const edge of lane ?? []) {
        fail(!names.has(edge.node), `connection target does not exist: ${edge.node}`);
      }
    }
  }
}

const secretPatterns = [
  /AIza[0-9A-Za-z_-]{20,}/,
  /apify_api_[0-9A-Za-z]{20,}/i,
  /sk-[0-9A-Za-z_-]{20,}/,
  /gh[pousr]_[0-9A-Za-z]{20,}/,
  /xox[baprs]-[0-9A-Za-z-]{10,}/,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /[?&](?:token|api_?key)=(?!\{\{)[^&"\s]{12,}/i,
];

for (const pattern of secretPatterns) {
  fail(pattern.test(raw), `possible embedded secret matched ${pattern}`);
}

for (const envName of [
  'GOOGLE_CSE_API_KEY',
  'GOOGLE_CSE_ID',
  'APIFY_API_TOKEN',
  'OUTREACH_SPREADSHEET_ID',
  'OUTREACH_SHEET_NAME',
]) {
  fail(!raw.includes(`$env.${envName}`), `missing environment reference: ${envName}`);
}

if (errors.length > 0) {
  console.error(`Workflow validation failed with ${errors.length} error(s):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`Validated ${workflow.nodes.length} nodes, ${names.size} unique names, and no embedded secrets.`);
