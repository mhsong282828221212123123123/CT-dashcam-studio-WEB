import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const channel = process.argv[2];
if (!['production', 'classic', 'dev'].includes(channel)) {
  throw new Error('Expected production, classic, or dev deployment channel');
}
const commit = execFileSync('git', ['-c', 'safe.directory=*', 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const info = { channel, branch: channel === 'dev' ? 'dev' : 'main', commit };
writeFileSync('dist/deployment.json', JSON.stringify(info, null, 2) + '\n');
console.log(JSON.stringify(info));
