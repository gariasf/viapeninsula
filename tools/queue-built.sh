#!/bin/sh
cd /private/tmp/claude-502/-Users-guillem-arias-Documents-gariasf-viapeninsula/82754758-83b4-4a96-9f81-de9d0b3fa2f2/scratchpad/wt-780
SP=../780; export OUT=$SP/out-patched; D=.cache/page/dist
HASH='#map=10/40.30/-3.75' node $SP/hover.ts built-hover dark $D 2>&1 | grep -E "pill|name|cursor|focus|error|FAIL" || echo FAIL hover dark
for s in light dark; do
  node $SP/shoot.ts built laptop $s $D 2>&1 | tail -3 || echo FAIL laptop $s
  node $SP/shoot.ts built phone $s $D 2>&1 | tail -3 || echo FAIL phone $s
done
echo QUEUE DONE
