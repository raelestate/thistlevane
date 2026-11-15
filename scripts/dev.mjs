// Starts the game server and the Vite client together for local development.
// Kept dependency-free on purpose (no `concurrently`); works on Windows, macOS and Linux.
import { spawn } from 'node:child_process';

const processes = [
  { name: 'server', color: '\x1b[35m', args: ['run', 'dev', '--workspace', 'server'] },
  { name: 'client', color: '\x1b[36m', args: ['run', 'dev', '--workspace', 'client'] },
];

const reset = '\x1b[0m';
const children = [];
let shuttingDown = false;

for (const proc of processes) {
  const child = spawn('npm', proc.args, { shell: true, stdio: ['inherit', 'pipe', 'pipe'] });
  const prefix = `${proc.color}[${proc.name}]${reset} `;
  const forward = (stream, target) => {
    let buffered = '';
    stream.on('data', (chunk) => {
      buffered += chunk.toString();
      const lines = buffered.split(/\r?\n/);
      buffered = lines.pop() ?? '';
      for (const line of lines) target.write(prefix + line + '\n');
    });
  };
  forward(child.stdout, process.stdout);
  forward(child.stderr, process.stderr);
  child.on('exit', (code) => {
    if (!shuttingDown) {
      console.error(`${prefix}exited with code ${code}; stopping everything.`);
      shutdown(code ?? 1);
    }
  });
  children.push(child);
}

function shutdown(code = 0) {
  shuttingDown = true;
  for (const child of children) child.kill();
  process.exit(code);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
