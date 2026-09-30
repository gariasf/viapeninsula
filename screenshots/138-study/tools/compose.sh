#!/bin/sh
# compose.sh <spot> [zooms...]: grid-<spot>.jpg, a row per zoom, main | branch, labelled.
spot=$1; shift; zooms=${*:-10.5 12 13 14}
rows=""
for z in $zooms; do
  [ -f "before-$spot-z$z.png" ] || continue
  magick "before-$spot-z$z.png" -resize 50% -gravity northwest -fill '#c00' -font /System/Library/Fonts/Supplemental/Arial.ttf -pointsize 22 -annotate +8+500 "main  z$z" \( "after-$spot-z$z.png" -resize 50% -gravity northwest -fill '#060' -font /System/Library/Fonts/Supplemental/Arial.ttf -pointsize 22 -annotate +8+500 "#138  z$z" \) -bordercolor white -border 3 +append "row-$spot-z$z.jpg"
  rows="$rows row-$spot-z$z.jpg"
done
magick $rows -append -quality 82 "grid-$spot.jpg" && rm $rows
