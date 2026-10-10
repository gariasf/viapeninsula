#!/bin/zsh
# sheets.sh: #210's contact sheets from shots/: today and the variants side by side, per spot and basemap, at half
# size, labelled with each `?stations=`. The full-size crops, one per decision, are crops.sh's.
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
# Each spot's columns: the shots' label and the `?stations=` it was shot with.
ALL=(today=today square=square red=square,red board=board sign=sign filled=badge,filled badge=badge capsule=capsule bar=bar snap=snap few=few small=small pick=pick)
INTERCHANGES=(today=today sign=sign filled=badge,filled badge=badge capsule=capsule bar=bar snap=snap pick=pick)
for scheme in light dark; do
  for spot in z13 z10 follow board; do
    local -a cells=()
    for pair in $ALL; do cells+=("${pair%%=*}-$scheme-$spot=${pair#*=}"); done
    sheet $spot-$scheme 5 50 $cells
  done
  for spot in ref14 pdg14 pdg16 cat155; do
    local -a cells=()
    for pair in $INTERCHANGES; do cells+=("${pair%%=*}-$scheme-$spot=${pair#*=}"); done
    sheet $spot-$scheme 4 50 $cells
  done
  # A tap on Passeig de Gràcia: its Rodalies board today, the interchange's under `badge` and `capsule`.
  sheet tap-$scheme 4 50 today-$scheme-tap=today badge-$scheme-tap=badge capsule-$scheme-tap=capsule pick-$scheme-tap=pick
  # Zoom 12, where the Metro's and TRAM's places come in under `few`.
  sheet z12-$scheme 4 50 today-$scheme-z12=today few-$scheme-z12=few small-$scheme-z12=small pick-$scheme-z12=pick
done
ls -la sheets
