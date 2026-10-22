#!/bin/zsh
# #213 look-measure: the tilted perf runs, one command at a time, each round of a scenario one batch in the harness's slot
# with the variants alternated. Each command's rows of the harness's runs.jsonl are copied to perf-<name>.jsonl.
M=$(cd "$(dirname $0)/.." && pwd)
cd "$M/../../wt-213" || exit 1
LOG=.cache/page/perf/runs.jsonl
AT=(--at ../213/capture/0630.ndjson.gz --out ../213/measure/live)
run() {
  local name=$1; shift
  local before=$(wc -l < $LOG)
  echo "$(date '+%H:%M:%S') $name: npm run perf -- $*" | tee -a $M/perf-$name.log
  npm run perf -- "$@" >> $M/perf-$name.log 2>&1
  echo "exit $? at $(date '+%H:%M:%S')" | tee -a $M/perf-$name.log
  # Only this tree's rows: another session may append its own between the batches.
  tail -n +$((before + 1)) $LOG | grep -F "\"tree\":\"$PWD\"" > $M/perf-$name.jsonl
}
for step in "$@"; do
  case $step in
    desktop1) run desktop1 S2 S5bcn S8 --pitch 45 --v213 main,G,L,GL $AT ;;
    phone1) run phone1 S2 S5bcn S8 --pitch 45 --v213 main,G,L,GL --phone $AT ;;
    desktop2) run desktop2 S3 S4 --pitch 45 --v213 main,G,GL $AT ;;
    phone2) run phone2 S3 S4 --pitch 45 --v213 main,G,GL --phone $AT ;;
  esac
done
