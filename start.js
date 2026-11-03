const { spawn } = require('node:child_process');
const path = require('node:path');

const projectRoot = __dirname;
const electronBin = path.join(projectRoot, 'node_modules', '.bin', process.platform === 'win32' ? 'electron.cmd' : 'electron');

function terminateIfRunning() {
  const args = ['-l', '-o', 'pid,comm,command'];
  const ps = spawn('ps', args, { stdio: ['ignore', 'pipe', 'inherit'] });
  let output = '';
  ps.stdout.on('data', chunk => { output += chunk.toString(); });
  ps.on('close', code => {
    if (code !== 0) {
      launch();
      return;
    }

    const entries = output.split(/\n+/).map(line => line.trim()).filter(Boolean);
    const targets = [];
    for (const line of entries) {
      const cols = line.split(/\s+/);
      if (cols.length < 3) continue;
      const pid = Number(cols[0]);
      const command = cols.slice(2).join(' ');
      if (!Number.isInteger(pid)) continue;
      if (command.includes('electron') && command.includes(projectRoot)) {
        targets.push(pid);
      }
    }

    if (targets.length === 0) {
      launch();
      return;
    }

    const kill = spawn('kill', ['-TERM', ...targets], { stdio: 'inherit' });
    kill.on('close', code2 => {
      if (code2 !== 0) {
        const fallback = spawn('kill', ['-KILL', ...targets], { stdio: 'inherit' });
        fallback.on('close', () => launch());
        return;
      }
      setTimeout(launch, 500);
    });
  });
}

function launch() {
  const child = spawn(electronBin, [projectRoot], {
    cwd: projectRoot,
    stdio: 'inherit',
    env: { ...process.env, ELECTRON_ENABLE_LOGGING: '1' }
  });

  child.on('exit', code => {
    process.exit(code ?? 0);
  });
  child.on('error', error => {
    console.error('Could not launch Electron:', error);
    process.exit(1);
  });
}

terminateIfRunning();
