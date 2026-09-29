// @ts-check
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ESLint } from 'eslint';
import { ROOT } from './helpers.mjs';

test('ESLint forbids innerHTML, outerHTML and insertAdjacentHTML (R30, #109)', async () => {
  const eslint = new ESLint({ cwd: ROOT });
  const code = [
    'const el = document.createElement("p");',
    'const name = String(location.hash);',
    'el.innerHTML = name;',
    'el.outerHTML = name;',
    'el.insertAdjacentHTML("beforeend", name);',
    '',
  ].join('\n');
  const [result] = await eslint.lintText(code, { filePath: `${ROOT}/dev/js/scratch.js` });
  assert.ok(result);
  const flagged = result.messages.filter((m) => m.ruleId === 'no-restricted-syntax').map((m) => m.line);
  assert.deepEqual(flagged, [3, 4, 5]);
});
