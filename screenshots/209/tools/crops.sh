#!/bin/zsh
# crops.sh: #209's full-size sheets, one per decision: the same crop of each shot side by side, labelled.
cd "${0:A:h}" || exit 1
FONT="/System/Library/Fonts/Supplemental/Arial Bold.ttf"
mkdir -p sheets tmp
# crop <name> <geometry> <columns> <file=label>...: each shot cropped to <geometry> (in the shots' 2× px), at 100%.
crop() {
  local name=$1 geometry=$2 columns=$3; shift 3
  local -a args=()
  local pair file label
  for pair in "$@"; do
    file=${pair%%=*} label=${pair#*=}
    if [[ ! -f shots/$file.png ]]; then echo "  missing shots/$file.png"; continue; fi
    magick shots/$file.png -crop $geometry +repage tmp/crop-$name-$file.png
    args+=(-label "$label" tmp/crop-$name-$file.png)
  done
  magick montage -font "$FONT" -pointsize 22 -background white "${args[@]}" -tile ${columns}x -geometry +6+6 -quality 85 sheets/$name.jpg
  echo sheets/$name.jpg
}
# Scheduled Trains: R15's and R2S's pills at z13, and Scheduled dots in the heap at z10.
crop scheduled-light 420x300+360+330 5 today-light-z13=today dash-light-z13=dash grey-light-z13=dash,grey letter-light-z13=letter pick-light-z13=pick
crop scheduled-z10-light 330x420+440+780 5 today-light-z10=today dash-light-z10=dash grey-light-z10=dash,grey letter-light-z10=letter pick-light-z10=pick
crop scheduled-dark 420x300+360+330 4 today-dark-z13=today dash-dark-z13=dash grey-dark-z13=dash,grey pick-dark-z13=pick
crop scheduled-z10-dark 330x420+440+780 4 today-dark-z10=today dash-dark-z10=dash grey-dark-z10=dash,grey pick-dark-z10=pick
# The heap at z10: central Barcelona.
crop heap-light 330x420+440+780 4 today-light-z10=today small-light-z10=small halo-light-z10=halo pick-light-z10=pick
crop heap-dark 330x420+440+780 4 today-dark-z10=today small-dark-z10=small halo-dark-z10=halo pick-dark-z10=pick
# The dark basemap's glow and trails, at z13 between Joanic and Girona, and at z10.
crop glow-trail 330x440+180+200 5 today-dark-z13=today glow-dark-z13=glow trail-dark-z13=trail glowtrail-dark-z13=glow,trail pick-dark-z13=pick
crop glow-trail-z10 330x420+440+780 5 today-dark-z10=today glow-dark-z10=glow trail-dark-z10=trail glowtrail-dark-z10=glow,trail pick-dark-z10=pick
# Forced colours (#116): the board's Scheduled pill.
crop forced 780x520+0+1150 3 today-forced-board=today dash-forced-board=dash grey-forced-board=dash,grey
ls -la sheets
