#!/usr/bin/env python3
import pexpect
import sys

child = pexpect.spawn('npx drizzle-kit generate --name rev71', cwd='/home/ubuntu/erp-rh-fc', timeout=120)
child.logfile_read = sys.stdout.buffer

while True:
    try:
        idx = child.expect([
            r'create column',
            r'1 migration',
            r'migrations generated',
            r'No schema changes',
            pexpect.EOF,
            pexpect.TIMEOUT
        ], timeout=30)
        
        if idx == 0:
            # Press Enter to select "create column" (default option)
            child.sendline('')
        elif idx in [1, 2, 3]:
            # Migration generated or no changes
            print("\n\n=== Migration complete ===")
            break
        elif idx == 4:
            print("\n\n=== EOF ===")
            break
        elif idx == 5:
            print("\n\n=== TIMEOUT ===")
            break
    except Exception as e:
        print(f"\n\n=== Error: {e} ===")
        break

child.close()
print(f"\nExit code: {child.exitstatus}")
