import { fixtureSelfTest } from './audit-fixtures.mjs';

const lines = await fixtureSelfTest();
for (const l of lines) console.log(l);
const failures = lines.filter((l) => l.startsWith('FAIL'));
console.log('\n' + (lines.length - failures.length) + '/' + lines.length + ' fixture checks passed');
if (failures.length) process.exitCode = 1;
