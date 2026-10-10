#!/bin/zsh
# Review of #209: after the re-shoot, the other browser runs, one after another, one browser at a time.
cd "${0:A:h}" || exit 1
while pgrep -f "node reshoot.mjs" > /dev/null; do sleep 5; done
echo "reshoot ended $(date +%T)"
for s in extra cover idle; do
  WAIT=1500 ../../tools/when-few.sh node $s.mjs > $s.log 2>&1
  echo "$s ended $(date +%T), exit $?"
done
