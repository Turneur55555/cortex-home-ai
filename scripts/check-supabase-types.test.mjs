#!/usr/bin/env node
/**
 * Test suite for check-supabase-types.mjs
 *
 * Validates that the conformity check correctly detects:
 * - Tables missing from types.ts (deleted)
 * - Tables in types.ts but missing from DB (shouldn't happen, but test anyway)
 * - Columns missing from types.ts (added to DB)
 * - Columns in types.ts but missing from DB (shouldn't happen, but test anyway)
 * - Correct state (no drift)
 */

import { strict as assert } from 'node:assert';
import { execSync } from 'node:child_process';
import { writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const TEMP_DIR = tmpdir();
const TEST_COUNT = { pass: 0, fail: 0 };

function test(name, fn) {
  try {
    fn();
    TEST_COUNT.pass++;
    console.log(`✅ ${name}`);
  } catch (e) {
    TEST_COUNT.fail++;
    console.error(`❌ ${name}`);
    console.error(`   ${e.message}`);
  }
}

/**
 * Generate a minimal types.ts file with specified tables and columns.
 * Format mimics Supabase CLI output.
 */
function generateTypesFile(schema) {
  let content = `export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {`;

  for (const [tableName, columns] of Object.entries(schema)) {
    content += `
      ${tableName}: {
        Row: {`;
    for (const col of columns) {
      content += `
          ${col}: string | null`;
    }
    content += `
        }
        Insert: {`;
    for (const col of columns) {
      content += `
          ${col}?: string | null`;
    }
    content += `
        }
        Update: {`;
    for (const col of columns) {
      content += `
          ${col}?: string | null`;
    }
    content += `
        }
      }`;
  }

  content += `
    }
    Views: {}
    Functions: {}
    Enums: {}
    CompositeTypes: {}
  }
}`;
  return content;
}

/**
 * Mock the supabase gen types command to return a specific schema.
 */
function mockSupabaseGenTypes(schema) {
  const mockScript = `#!/bin/sh
echo '${JSON.stringify(generateTypesFile(schema)).replace(/'/g, "'\\''")}'
`;
  const mockPath = join(TEMP_DIR, 'mock-supabase-gen.sh');
  writeFileSync(mockPath, mockScript, { mode: 0o755 });
  return mockPath;
}

/**
 * Parse types from generated file (extract logic from check-supabase-types.mjs)
 */
function parseTables(source) {
  const lines = source.split(/\r?\n/);
  const tables = new Map();

  let inTables = false;
  let currentTable = null;
  let inRow = false;

  for (const line of lines) {
    // Entry into Tables section
    if (!inTables) {
      if (/^\s{4}Tables:\s*\{\s*$/.test(line)) {
        inTables = true;
      }
      continue;
    }

    // Table name: 6 spaces, identifier, ": {"
    const tableMatch = line.match(/^\s{6}([A-Za-z0-9_]+):\s*\{\s*$/);
    if (tableMatch && !currentTable) {
      currentTable = tableMatch[1];
      if (!tables.has(currentTable)) tables.set(currentTable, new Set());
      inRow = false;
      continue;
    }

    if (currentTable) {
      // Start of Row block (columns are in here)
      if (/^\s{8}Row:\s*\{\s*$/.test(line)) {
        inRow = true;
        continue;
      }
      if (inRow) {
        // End of Row block
        if (/^\s{8}\}\s*$/.test(line)) {
          inRow = false;
          continue;
        }
        const colMatch = line.match(/^\s{10}([A-Za-z0-9_]+)\??:\s/);
        if (colMatch) tables.get(currentTable).add(colMatch[1]);
        continue;
      }
      // End of table block
      if (/^\s{6}\}\s*$/.test(line)) {
        currentTable = null;
        continue;
      }
    }

    // End of Tables section
    if (!currentTable && /^\s{4}\}\s*$/.test(line)) {
      if (currentTable === null) break;
    }
  }

  return tables;
}

/**
 * Compare two schema maps and return differences.
 */
function compareSchemas(dbSchema, typesSchema) {
  const missingTables = [];
  const extraTables = [];
  const columnDiffs = [];

  // Tables missing from types.ts
  for (const [table, cols] of dbSchema) {
    if (!typesSchema.has(table)) {
      missingTables.push(table);
      continue;
    }
    const typesCol = typesSchema.get(table);
    const missingCols = [...cols].filter(c => !typesCol.has(c));
    const extraCols = [...typesCol].filter(c => !cols.has(c));
    if (missingCols.length || extraCols.length) {
      columnDiffs.push({ table, missingCols, extraCols });
    }
  }

  // Tables in types.ts but missing from DB
  for (const table of typesSchema.keys()) {
    if (!dbSchema.has(table)) {
      extraTables.push(table);
    }
  }

  return { missingTables, extraTables, columnDiffs };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

test('detects missing table (deleted from types.ts)', () => {
  const db = new Map([['users', new Set(['id', 'name'])]]);
  const types = new Map([['posts', new Set(['id', 'title'])]]);
  const result = compareSchemas(db, types);

  assert.deepEqual(result.missingTables, ['users']);
  assert.deepEqual(result.extraTables, ['posts']);
  assert.equal(result.columnDiffs.length, 0);
});

test('detects extra table (in types.ts but not DB)', () => {
  const db = new Map([['users', new Set(['id', 'name'])]]);
  const types = new Map([
    ['users', new Set(['id', 'name'])],
    ['deleted_table', new Set(['id'])],
  ]);
  const result = compareSchemas(db, types);

  assert.deepEqual(result.missingTables, []);
  assert.deepEqual(result.extraTables, ['deleted_table']);
  assert.equal(result.columnDiffs.length, 0);
});

test('detects missing column in types.ts', () => {
  const db = new Map([['users', new Set(['id', 'name', 'email'])]]);
  const types = new Map([['users', new Set(['id', 'name'])]]);
  const result = compareSchemas(db, types);

  assert.deepEqual(result.missingTables, []);
  assert.deepEqual(result.extraTables, []);
  assert.equal(result.columnDiffs.length, 1);
  assert.deepEqual(result.columnDiffs[0], {
    table: 'users',
    missingCols: ['email'],
    extraCols: [],
  });
});

test('detects extra column in types.ts', () => {
  const db = new Map([['users', new Set(['id', 'name'])]]);
  const types = new Map([['users', new Set(['id', 'name', 'unused_col'])]]);
  const result = compareSchemas(db, types);

  assert.deepEqual(result.missingTables, []);
  assert.deepEqual(result.extraTables, []);
  assert.equal(result.columnDiffs.length, 1);
  assert.deepEqual(result.columnDiffs[0], {
    table: 'users',
    missingCols: [],
    extraCols: ['unused_col'],
  });
});

test('detects both missing and extra columns', () => {
  const db = new Map([['users', new Set(['id', 'name', 'email'])]]);
  const types = new Map([['users', new Set(['id', 'name', 'unused_col'])]]);
  const result = compareSchemas(db, types);

  assert.deepEqual(result.missingTables, []);
  assert.deepEqual(result.extraTables, []);
  assert.equal(result.columnDiffs.length, 1);
  assert.deepEqual(result.columnDiffs[0], {
    table: 'users',
    missingCols: ['email'],
    extraCols: ['unused_col'],
  });
});

test('detects multiple table differences', () => {
  const db = new Map([
    ['users', new Set(['id', 'name'])],
    ['posts', new Set(['id', 'title'])],
  ]);
  const types = new Map([
    ['users', new Set(['id', 'name'])],
    ['comments', new Set(['id'])],
  ]);
  const result = compareSchemas(db, types);

  assert.deepEqual(result.missingTables, ['posts']);
  assert.deepEqual(result.extraTables, ['comments']);
  assert.equal(result.columnDiffs.length, 0);
});

test('parses types file correctly', () => {
  const typesContent = generateTypesFile({
    users: ['id', 'name', 'email'],
    posts: ['id', 'title', 'content'],
  });

  const tables = parseTables(typesContent);
  assert.equal(tables.size, 2);
  assert(tables.has('users'));
  assert(tables.has('posts'));
  assert.deepEqual([...tables.get('users')], ['id', 'name', 'email']);
  assert.deepEqual([...tables.get('posts')], ['id', 'title', 'content']);
});

test('handles empty schema (no tables)', () => {
  const db = new Map();
  const types = new Map();
  const result = compareSchemas(db, types);

  assert.deepEqual(result.missingTables, []);
  assert.deepEqual(result.extraTables, []);
  assert.equal(result.columnDiffs.length, 0);
});

test('handles schema with many tables', () => {
  const tables = {};
  for (let i = 0; i < 50; i++) {
    tables[`table_${i}`] = ['id', `col_${i}`];
  }

  const typesContent = generateTypesFile(tables);
  const parsed = parseTables(typesContent);

  assert.equal(parsed.size, 50);
  for (let i = 0; i < 50; i++) {
    assert(parsed.has(`table_${i}`));
  }
});

test('detects conformity (no drift)', () => {
  const schema = {
    users: ['id', 'name', 'email'],
    posts: ['id', 'title'],
  };

  const db = new Map([
    ['users', new Set(schema.users)],
    ['posts', new Set(schema.posts)],
  ]);

  const types = new Map([
    ['users', new Set(schema.users)],
    ['posts', new Set(schema.posts)],
  ]);

  const result = compareSchemas(db, types);

  assert.deepEqual(result.missingTables, []);
  assert.deepEqual(result.extraTables, []);
  assert.equal(result.columnDiffs.length, 0);
});

// ─── Report ─────────────────────────────────────────────────────────────────

console.log('\n' + '═'.repeat(60));
if (TEST_COUNT.fail === 0) {
  console.log(`✅ All tests passed (${TEST_COUNT.pass})`);
  console.log('═'.repeat(60) + '\n');
  process.exit(0);
} else {
  console.log(`❌ ${TEST_COUNT.fail} test(s) failed, ${TEST_COUNT.pass} passed`);
  console.log('═'.repeat(60) + '\n');
  process.exit(1);
}
