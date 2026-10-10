#!/bin/zsh
# Review of #209: each of my re-shots against the build's shot of the same name: pixels differing by more than 3%,
# and the box they lie in. `compare.sh [glob]`.
cd "${0:A:h}/.." || exit 1
mkdir -p review/tmp/masks
for f in review/shots/${~1:-*}.png; do
  b=${f:t}
  [[ -f shots/$b ]] || continue
  m=review/tmp/masks/$b
  magick compare -fuzz 3% shots/$b $f -compose src -highlight-color red -lowlight-color none $m 2>/dev/null
  n=$(magick $m -alpha extract -format '%[fx:round(mean*w*h)]' info:)
  box=$(magick $m -alpha extract -trim -format '%wx%h+%X+%Y' info: 2>/dev/null)
  echo "$b $n ${box//++/+}"
done
