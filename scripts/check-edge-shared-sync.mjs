#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { relative, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");

const mappings = [
  {
    source: "packages/shared/src/schemas.ts",
    target: "supabase/functions/_shared/schemas.ts",
    transform(source) {
      return source
        .replace('import { z } from "zod";', 'import { z } from "npm:zod@3.24.1";')
        .replace(/\nexport type SubmitSuggestionInput[\s\S]*$/u, "\n");
    },
  },
  {
    source: "packages/shared/src/dedupe.ts",
    target: "supabase/functions/_shared/dedupe.ts",
    transform(source) {
      return source
        .replace('from "./schemas";', 'from "./schemas.ts";')
        .replace('from "./types";', 'from "./types.ts";');
    },
  },
  {
    source: "packages/shared/src/prompts.ts",
    target: "supabase/functions/_shared/prompts.ts",
    transform(source) {
      return source;
    },
  },
];

function normalized(content) {
  return content.replace(/\r\n/g, "\n").replace(/\s+$/u, "\n");
}

const write = process.argv.includes("--write");
const failures = [];

for (const mapping of mappings) {
  const sourcePath = resolve(root, mapping.source);
  const targetPath = resolve(root, mapping.target);
  const expected = normalized(mapping.transform(readFileSync(sourcePath, "utf8")));
  const actual = normalized(readFileSync(targetPath, "utf8"));

  if (write && expected !== actual) {
    writeFileSync(targetPath, expected);
    continue;
  }

  if (expected !== actual) {
    failures.push(relative(root, targetPath));
  }
}

if (failures.length) {
  console.error(`Edge shared files are out of sync: ${failures.join(", ")}`);
  console.error("Run `npm run sync:edge-shared` and commit the generated files.");
  process.exit(1);
}

console.log(write ? "Edge shared files synced." : "Edge shared files are in sync.");
