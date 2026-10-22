#!/bin/zsh
# #213 look-measure: every shot of the sheet, one call (one slot batch, under its 10 min) at a time.
cd "$(dirname $0)/../../../wt-213" || exit 1
T=../213/measure/tools/shoot.mts
node $T bcn A,G,L,GL,GLh laptop
node $T bcn A,G,L,GL,GLh phone --no-build
node $T mad A,G,L,GL laptop,phone --no-build
node $T viaduct A,G,L,GL laptop,phone --no-build
node $T mouth A,G laptop --no-build
node $T mouth L,GL laptop --no-build
node $T mouth A,G phone --no-build
node $T mouth L,GL phone --no-build
date
