#!/bin/zsh
# Review of #209: point the drafts' image links at screenshots-209's commit, by its full hash, and check that each
# linked file is on that commit. `links.sh <old-ref>`.
set -e
here=${0:A:h}/..
cd $here/../wt-209
new=$(git rev-parse screenshots-209)
old=$1
for f in comment.md pr.md wrapup.md notes.md; do
  perl -pi -e "s{gariasf/viapeninsula/$old/screenshots/209/}{gariasf/viapeninsula/$new/screenshots/209/}g; s{screenshots-209\` \\($old\\)}{screenshots-209\` (${new:0:7})}g; s{\\(1402969\\)}{(${new:0:7})}g" $here/$f
done
echo "screenshots-209 is $new"
bad=0
for p in $(grep -ohE "gariasf/viapeninsula/[0-9a-f]{7,40}/screenshots/209/[a-z0-9-]+\.jpg" $here/{comment,pr,wrapup,notes,followups,build-ticket}.md | sort -u); do
  ref=$(echo $p | cut -d/ -f3); file=${p#gariasf/viapeninsula/$ref/}
  if [[ $ref != $new ]]; then echo "stale ref: $p"; bad=1; fi
  git cat-file -e ${new}:${file} 2>/dev/null || { echo "missing on screenshots-209: $file"; bad=1; }
done
for s in $(grep -ohE "(scheduled|heap|pile|follow|glow|cards|z10|z13|board)(-[a-z0-9]+)+|\bforced\b" $here/picks.md | sort -u); do
  git cat-file -e ${new}:screenshots/209/${s}.jpg 2>/dev/null || echo "picks.md names a sheet not on screenshots-209: $s"
done
echo "links checked, bad=$bad"
