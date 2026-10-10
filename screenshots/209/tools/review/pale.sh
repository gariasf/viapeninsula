#!/bin/zsh
# Review of #209: the cards-pale and follow-wide sheets. cards-pale: El Prat's board, its Scheduled R2N row (R2N is 1.5:1 on white), at full
# size, light, dark and under forced colours, today and in the variants that change the cards; labelled with each
# `?trains=`, as sheets.sh labels its own.
cd "${0:A:h}/.." || exit 1
FONT="/System/Library/Fonts/Supplemental/Arial Bold.ttf"
mkdir -p sheets tmp
local -a args=()
for pair in today-light-prat-row=today dash-light-prat-row=dash grey-light-prat-row=dash,grey pick-light-prat-row=pick \
  today-dark-prat-row="today, dark" dash-dark-prat-row="dash, dark" grey-dark-prat-row="dash,grey, dark" pick-dark-prat-row="pick, dark" \
  today-forced-light-prat-row="today, forced" dash-forced-light-prat-row="dash, forced" grey-forced-light-prat-row="dash,grey, forced" pick-forced-light-prat-row="pick, forced"; do
  file=${pair%%=*} label=${pair#*=}
  if [[ ! -f review/shots/$file.png ]]; then echo "  missing review/shots/$file.png"; continue; fi
  magick review/shots/$file.png -crop 560x100+40+170 +repage tmp/pale-$file.png
  args+=(-label "$label" tmp/pale-$file.png)
done
magick montage -font "$FONT" -pointsize 22 -background white "${args[@]}" -tile 4x -geometry +6+6 -quality 85 sheets/cards-pale.jpg
echo sheets/cards-pale.jpg
# And the followed Train on a wide pill: El Prat's Scheduled R2N followed, its target and dashes, at full size.
local -a wide=()
for pair in today-light-sched-follow-100=today dash-light-sched-follow-100=dash pick-light-sched-follow-100=pick \
  today-dark-sched-follow-100="today, dark" dash-dark-sched-follow-100="dash, dark" pick-dark-sched-follow-100="pick, dark"; do
  file=${pair%%=*} label=${pair#*=}
  if [[ ! -f review/shots/$file.png ]]; then echo "  missing review/shots/$file.png"; continue; fi
  wide+=(-label "$label" review/shots/$file.png)
done
magick montage -font "$FONT" -pointsize 22 -background white "${wide[@]}" -tile 6x -geometry +6+6 -quality 85 sheets/follow-wide.jpg
echo sheets/follow-wide.jpg
