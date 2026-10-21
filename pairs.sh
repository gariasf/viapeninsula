#!/bin/zsh
# Before|after pairs (before left) per state, full and cropped, plus one contact sheet.
cd "${0:A:h}"
mkdir -p pairs crops sheets
for b in shots/*-before.png; do
  n=${${b:t}%-before.png}; a=shots/$n-after.png
  [[ -f $a ]] || continue
  magick $b $a -bordercolor '#ff00ff' -border 0x0 +append -resize 50% pairs/$n.png
done
# Crops in CSS px × DPR: phone 3, laptop 2. name|geometry(css) list in crops.txt: <state-prefix> <w>x<h>+<x>+<y>
while read -r n g k; do
  [[ -z $n || $n == \#* ]] && continue
  s=3; [[ $n == *1280x800* ]] && s=2
  p=(${(s:x:)${g//+/x}}); w=$p[1] h=$p[2] x=$p[3] y=$p[4]
  geo="$((w*s))x$((h*s))+$((x*s))+$((y*s))"
  magick \( shots/$n-before.png -crop $geo +repage \) \( shots/$n-after.png -crop $geo +repage \) -background '#ff00ff' -splice 0x0 +append -bordercolor '#888' -border 2 crops/$n${k:+-$k}.png
done < crops.txt
magick montage crops/*.png -tile 4x -geometry +8+8 -background '#ddd' -title '#468 + #719 before | after (main b8defba2 | 468-44px 21534fca)' sheets/contact-468.png
