#!/bin/zsh
# crops.sh: #210's full-size sheets, one per decision: the same crop of each shot side by side, labelled.
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
for scheme in light dark; do
  # The top tier: Passeig de Gràcia, Plaça de Catalunya and França at z13, and Barcelona's and its region's at z9.
  crop top-tier-$scheme 700x480+80+560 5 today-$scheme-z13=today square-$scheme-z13=square red-$scheme-z13=square,red board-$scheme-z13=board pick-$scheme-z13=pick
  crop top-tier-z9-$scheme 600x760+60+560 5 today-$scheme-cat9=today square-$scheme-cat9=square red-$scheme-cat9=square,red board-$scheme-cat9=board pick-$scheme-cat9=pick
  # Interchanges: Verdaguer and Monumental at z14.
  crop interchanges-$scheme 780x440+0+600 4 today-$scheme-ref14=today sign-$scheme-ref14=sign filled-$scheme-ref14=badge,filled badge-$scheme-ref14=badge capsule-$scheme-ref14=capsule bar-$scheme-ref14=bar snap-$scheme-ref14=snap pick-$scheme-ref14=pick
  # The bands: Passeig de Gràcia and Plaça de Catalunya at z14.
  crop bands-$scheme 580x640+200+760 4 today-$scheme-pdg14=today bar-$scheme-pdg14=bar snap-$scheme-pdg14=snap pick-$scheme-pdg14=pick
  # The rails: Passeig de Gràcia at z16 and Plaça de Catalunya at z15.5.
  crop rails-$scheme 480x580+300+660 4 today-$scheme-pdg16=today capsule-$scheme-pdg16=capsule snap-$scheme-pdg16=snap pick-$scheme-pdg16=pick
  crop rails-catalunya-$scheme 540x640+120+560 4 today-$scheme-cat155=today capsule-$scheme-cat155=capsule snap-$scheme-cat155=snap pick-$scheme-cat155=pick
  # The heap at z10: central Barcelona, as #209's heap sheets.
  crop heap-$scheme 330x420+440+780 4 today-$scheme-z10=today few-$scheme-z10=few small-$scheme-z10=small pick-$scheme-z10=pick
done
ls -la sheets
