#!/bin/bash
# Execute all batch files and report results
for i in $(seq 0 19); do
  FILE="/home/ubuntu/erp-rh-fc/batch_${i}.sql"
  if [ -f "$FILE" ]; then
    LINES=$(wc -l < "$FILE")
    echo "Batch $i: $LINES statements"
  fi
done
echo "Total batches: 20"
echo "Ready for execution via webdev_execute_sql"
