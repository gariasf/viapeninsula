#!/bin/sh
# sheet.sh <name> <place> <device> <scheme> <note>: the five zooms' shots and a 1:1 crop of z10's centre as one labelled JPG in sheets/.
# Tiles: laptop 960×600 in 3×2, phone 390×844 in 6×1.
cd "$(dirname "$0")"
F=/System/Library/Fonts/Helvetica.ttc
n=$1 p=$2 d=$3 s=$4 note=$5
mkdir -p sheets crops
if [ "$d" = laptop ]; then g=960x600; t=3x2; vp=1280x800; else g=390x844; t=6x1; vp=390x844; fi
src=shots/$n/$p-$d-$s
magick $src-z10.png -gravity center -crop ${g}+0+0 +repage crops/$n-$p-$d-$s-z10.png
files=""; for z in 7 9 10 12 14; do files="$files -label z$z $src-z$z.png"; done
montage -font $F -pointsize 28 $files -label "z10 centre, device px" crops/$n-$p-$d-$s-z10.png -tile $t -geometry $g+6+6 -background white \
  -title "$n · $p · $s · $vp · $note" -quality 80 "sheets/$n-$p-$s-$vp.jpg"
