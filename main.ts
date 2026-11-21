import { setFlagsFromString } from 'node:v8';
setFlagsFromString('--no-incremental-marking');
const { run } = await import('./solve.js');
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

// Under the docker sandbox /input and /output are mounts; under the
// process driver the harness hands the same directories over as
// MAKEFUN_INPUT_DIR / MAKEFUN_OUTPUT_DIR instead.
const inputDir = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

const cases = JSON.parse(readFileSync(inputDir + '/cases.json', 'utf8'));
const answers = [];
for (const c of cases) answers.push(run(c.input));
mkdirSync(outputDir, { recursive: true });
writeFileSync(outputDir + '/answers.json', JSON.stringify(answers));
