#!/bin/zsh
# #213 ship: box 5's perf, desktop tilted then phone flat, each one `npm run perf` (3 runs a scenario, main and the branch
# alternated in each round's batch), at 22 Oct's 08:30 capture on the branch's dry run of 22 Oct. Each command's rows of the
# harness's runs.jsonl (shared with other sessions) are copied to perf-<name>.jsonl, and its table to perf-<name>-table.md.
#   perf.sh desktop phone
SP=/private/tmp/claude-502/-Users-guillem-arias-Documents-gariasf-viapeninsula/e8ede10f-745b-4089-abf9-db453be3822d/scratchpad
S=$SP/213/ship
cd $SP/wt-213b || exit 1
LOG=.cache/page/perf/runs.jsonl
COMMON=(--tree $SP/wt-main --tree $SP/wt-213b --at $SP/213/capture/0630.ndjson.gz --out $SP/wt-213b/out)
run() {
  local name=$1; shift
  local before=$(wc -l < $LOG)
  echo "$(date '+%H:%M:%S') $name: npm run perf -- $* (load $(sysctl -n vm.loadavg))" | tee -a $S/perf-$name.log
  npm run perf -- "$@" >> $S/perf-$name.log 2>&1
  echo "exit $? at $(date '+%H:%M:%S') (load $(sysctl -n vm.loadavg))" | tee -a $S/perf-$name.log
  tail -n +$((before + 1)) $LOG | grep -F "\"tree\":\"$SP/wt-" > $S/perf-$name.jsonl
  node $S/tools/perf-table.mts $S/perf-$name.jsonl $([[ $name == phone* ]] && echo phone || echo desktop) > $S/perf-$name-table.md 2>&1
}
for step in "$@"; do
  case $step in
    desktop) run desktop S2 S3 S4 S5bcn S8 --pitch 45 $COMMON ;;
    phone) run phone S2 S3 S5bcn S8 --phone $COMMON ;;
    # The re-gate after the decks' gate (8d8979ce): the desktop's five, and the phone's S2 and S3, as its code changed only there.
    desktop2) run desktop2 S2 S3 S4 S5bcn S8 --pitch 45 $COMMON ;;
    phone2) run phone2 S2 S3 --phone $COMMON ;;
  esac
done
