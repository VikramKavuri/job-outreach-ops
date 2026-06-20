#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { access, readFile, readdir } from 'node:fs/promises';
import { dirname, extname, resolve } from 'node:path';

const root = resolve('.');
const errors = [];
const textExtensions = new Set(['.json', '.md', '.mjs', '.yml', '.yaml', '.svg', '.example', '']);
const ignoredDirectories = new Set(['.git', 'node_modules', 'coverage', 'dist']);

async function walk(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(path));
    else files.push(path);
  }
  return files;
}

const files = await walk(root);
const secretPatterns = [
  /AIza[0-9A-Za-z_-]{20,}/g,
  /apify_api_[0-9A-Za-z]{20,}/gi,
  /sk-[0-9A-Za-z_-]{20,}/g,
  /gh[pousr]_[0-9A-Za-z]{20,}/g,
  /xox[baprs]-[0-9A-Za-z-]{10,}/g,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
];

for (const file of files) {
  if (!textExtensions.has(extname(file))) continue;
  const content = await readFile(file, 'utf8');

  for (const pattern of secretPatterns) {
    pattern.lastIndex = 0;
    if (pattern.test(content)) errors.push(`possible secret in ${file.slice(root.length + 1)}`);
  }

  if (extname(file) === '.json') {
    try {
      JSON.parse(content);
    } catch (error) {
      errors.push(`invalid JSON in ${file.slice(root.length + 1)}: ${error.message}`);
    }
  }

  if (extname(file) === '.md') {
    const links = content.matchAll(/!?(?:\[[^\]]*\])\(([^)]+)\)/g);
    for (const match of links) {
      const target = match[1].trim().replace(/^<|>$/g, '').split('#')[0];
      if (!target || /^(?:https?:|mailto:)/i.test(target)) continue;
      try {
        await access(resolve(dirname(file), decodeURIComponent(target)));
      } catch {
        errors.push(`broken local link in ${file.slice(root.length + 1)}: ${target}`);
      }
    }
  }
}

const workflowCheck = spawnSync(
  process.execPath,
  ['scripts/validate-workflow.mjs', 'workflows/job-outreach-ops.json'],
  { cwd: root, encoding: 'utf8' },
);

if (workflowCheck.status !== 0) {
  errors.push(workflowCheck.stderr.trim() || 'workflow validation failed');
}

if (errors.length > 0) {
  console.error(`Repository validation failed with ${errors.length} error(s):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(workflowCheck.stdout.trim());
console.log(`Validated ${files.length} repository files, JSON syntax, local links, and secret patterns.`);
