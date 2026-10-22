#!/bin/zsh
# #213 look-measure: after the shots, the bytes re-checked (look-build's cold loads, A and G at every spot), then the perf.
M=/private/tmp/claude-502/-Users-guillem-arias-Documents-gariasf-viapeninsula/e8ede10f-745b-4089-abf9-db453be3822d/scratchpad/213/measure
cd $M/../../wt-213 || exit 1
echo "$(date '+%H:%M:%S') bytes" && node $M/tools/bytes.mts bcn,mad,viaduct,mouth A,G --devices laptop,phone --no-build > $M/run-bytes.log 2>&1
echo "$(date '+%H:%M:%S') perf" && $M/tools/perf-all.sh desktop1 phone1 desktop2 phone2
echo "$(date '+%H:%M:%S') done"
