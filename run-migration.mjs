import { spawn } from 'child_process';

const child = spawn('npx', ['drizzle-kit', 'generate', '--name', 'rev71'], {
  cwd: '/home/ubuntu/erp-rh-fc',
  stdio: ['pipe', 'pipe', 'pipe'],
});

let output = '';

child.stdout.on('data', (data) => {
  const text = data.toString();
  output += text;
  process.stdout.write(text);
  
  // When we see a column conflict prompt, press Enter to select "create column" (default)
  if (text.includes('create column') || text.includes('rename column')) {
    setTimeout(() => {
      child.stdin.write('\n');
    }, 100);
  }
});

child.stderr.on('data', (data) => {
  process.stderr.write(data.toString());
});

child.on('close', (code) => {
  console.log(`\n--- Process exited with code ${code} ---`);
  process.exit(code);
});

// Safety timeout
setTimeout(() => {
  console.log('\n--- Timeout, killing process ---');
  child.kill();
  process.exit(1);
}, 120000);
