#!/bin/sh
# ladder.sh <spot>: ladder-<spot>.jpg, rows main/#138, a column per zoom, centre 600x420 device px each.
spot=$1; rows=""
for tag in before after; do
  cells=""
  for z in 9 9.5 10 10.5 11 11.5; do
    f=$tag-$spot-z$z.png; [ -f $f ] || continue
    magick $f -gravity center -crop 600x420+0+0 +repage -gravity northwest -font /System/Library/Fonts/Supplemental/Arial.ttf -pointsize 24 -fill '#b00' -annotate +8+388 "$tag z$z" -bordercolor white -border 2 c-$tag-$z.jpg; cells="$cells c-$tag-$z.jpg"
  done
  magick $cells +append r-$tag.jpg; rows="$rows r-$tag.jpg"; rm $cells
done
magick $rows -append -quality 82 ladder-$spot.jpg; rm $rows
