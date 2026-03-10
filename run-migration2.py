#!/usr/bin/env python3
import pexpect
import sys
import time

child = pexpect.spawn('npx drizzle-kit generate --name rev71', 
                       cwd='/home/ubuntu/erp-rh-fc', 
                       timeout=120,
                       encoding='utf-8')
child.logfile_read = sys.stdout

count = 0
max_attempts = 50

while count < max_attempts:
    try:
        idx = child.expect([
            r'create column',
            r'migrations generated',
            r'No schema changes',
            r'migration file',
            pexpect.EOF,
        ], timeout=10)
        
        if idx == 0:
            count += 1
            time.sleep(0.2)
            child.send('\r\n')
            time.sleep(0.3)
        elif idx in [1, 2, 3]:
            print(f"\n\n=== Done after {count} prompts ===")
            break
        elif idx == 4:
            print(f"\n\n=== EOF after {count} prompts ===")
            break
    except pexpect.TIMEOUT:
        # Try sending enter anyway in case prompt is waiting
        child.send('\r\n')
        count += 1
        if count >= max_attempts:
            print(f"\n\n=== Max attempts reached ===")
            break
    except Exception as e:
        print(f"\n\n=== Error: {e} ===")
        break

# Wait for process to finish
try:
    child.expect(pexpect.EOF, timeout=30)
except:
    pass

child.close()
print(f"\nExit code: {child.exitstatus}")
