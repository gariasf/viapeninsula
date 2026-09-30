#!/bin/sh
# detail.sh <tag> <spot>: detail-<tag>-<spot>.jpg, the centre 800x560 device px of each zoom's shot, 2x2, labelled.
tag=$1; spot=$2; cells=""
for f in $tag-$spot-z*.png; do
  z=${f##*-z}; z=${z%.png}
  magick "$f" -gravity center -crop 800x560+0+0 +repage -gravity northwest -font /System/Library/Fonts/Supplemental/Arial.ttf -pointsize 26 -fill '#b00' -annotate +10+520 "$tag z$z" -bordercolor white -border 3 "cell-$spot-$z.jpg"
  cells="$cells cell-$spot-$z.jpg"
done
set -- $cells
magick \( $1 $2 +append \) \( $3 $4 +append \) -append -quality 82 "detail-$tag-$spot.jpg" && rm $cells
