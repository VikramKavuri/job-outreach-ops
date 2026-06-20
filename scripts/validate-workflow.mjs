#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const workflowPath = resolve(process.argv[2] ?? 'workflows/outreach-automation.json');
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
}

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
