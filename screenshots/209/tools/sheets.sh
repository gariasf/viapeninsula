#!/bin/zsh
# sheets.sh: #209's contact sheets from shots/: today and the variants side by side, per spot and basemap,
# labelled with each `?trains=`, and the full-size crops the comment points at.
cd "${0:A:h}" || exit 1
FONT="/System/Library/Fonts/Supplemental/Arial Bold.ttf"
mkdir -p sheets tmp
# sheet <name> <columns> <scale%> <file=label>...: the files at <scale>, labelled, <columns> to a row.
sheet() {
  local name=$1 columns=$2 scale=$3; shift 3
  local -a args=()
  local pair file label
  for pair in "$@"; do
    file=${pair%%=*} label=${pair#*=}
    if [[ ! -f shots/$file.png ]]; then echo "  missing shots/$file.png"; continue; fi
    magick shots/$file.png -resize $scale% tmp/$file-$scale.png
    args+=(-label "$label" tmp/$file-$scale.png)
  done
  magick montage -font "$FONT" -pointsize 18 -background white "${args[@]}" -tile ${columns}x -geometry +6+6 -quality 82 sheets/$name.jpg
  echo sheets/$name.jpg
}
# Each basemap's columns: the shots' label, and the `?trains=` it was shot with.
LIGHT=(today=today dash=dash grey=dash,grey small=small halo=halo letter=letter target=target under=under pick=pick)
DARK=(today=today dash=dash grey=dash,grey small=small halo=halo target=target under=under glow=glow trail=trail glowtrail=glow,trail pick=pick)
for spot in z13 z10 follow board; do
  for scheme in light dark; do
    local -a columns=() cells=()
    if [[ $scheme == light ]]; then columns=($LIGHT); else columns=($DARK); fi
    for pair in $columns; do cells+=("${pair%%=*}-$scheme-$spot=${pair#*=}"); done
    sheet $spot-$scheme 5 50 $cells
  done
done
# Where arrows met other Trains' pills, and the followed Train, at full size; and the cards' hover, focus and legend.
for scheme in light dark; do
  sheet pile-$scheme 3 100 today-$scheme-pile=today under-$scheme-pile=under pick-$scheme-pile=pick
  sheet follow-100-$scheme 3 100 today-$scheme-follow-100=today target-$scheme-follow-100=target pick-$scheme-follow-100=pick
  local -a cards=()
  for state in hover focus legend legend-focus; do
    for v in today dash grey pick; do cards+=("$v-$scheme-$state=$v, $state"); done
  done
  sheet cards-$scheme 4 50 $cards
done
ls -la sheets
