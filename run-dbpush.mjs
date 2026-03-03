import { spawn } from 'node:child_process';
import * as readline from 'node:readline';

function runInteractive(cmd, args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, {
      cwd: '/home/ubuntu/erp-rh-fc',
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' }
    });

    let output = '';
    let buffer = '';

    function checkAndRespond(text) {
      buffer += text;
      // When we see the arrow indicator, send Enter to accept default
      if (buffer.includes('❯') || buffer.includes('create column') || buffer.includes('create table')) {
        proc.stdin.write('\r\n');
        buffer = '';
      }
      // Also check for "Is ... column" questions
      if (buffer.includes('Is ') && buffer.includes(' column in ')) {
        proc.stdin.write('\r\n');
        buffer = '';
      }
    }

    proc.stdout.on('data', (data) => {
      const text = data.toString();
      output += text;
      process.stdout.write(text);
      checkAndRespond(text);
    });

    proc.stderr.on('data', (data) => {
      const text = data.toString();
      output += text;
      process.stderr.write(text);
      checkAndRespond(text);
    });

    proc.on('close', (code) => {
      console.log(`\nProcess exited with code ${code}`);
      resolve({ code, output });
    });

    proc.on('error', reject);

    // Safety: periodically send Enter in case prompts are missed
    const interval = setInterval(() => {
      try { proc.stdin.write('\r\n'); } catch(e) {}
    }, 2000);

    proc.on('close', () => clearInterval(interval));
  });
}

async function main() {
  console.log('=== Running drizzle-kit generate ===');
  const gen = await runInteractive('npx', ['drizzle-kit', 'generate']);
  
  if (gen.code !== 0) {
    console.error('Generate failed, trying migrate anyway...');
  }
  
  console.log('\n=== Running drizzle-kit migrate ===');
  const mig = await runInteractive('npx', ['drizzle-kit', 'migrate']);
  
  console.log('\n=== Done! ===');
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
