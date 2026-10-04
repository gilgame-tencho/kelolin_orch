
ls -l | tail -n 10

# timestamp
export HOGE_TIME=`date '+%Y%m%d_%H%M_'`

# logs
export HOGE=logs.jsonl
echo $HOGE

cat $HOGE > $HOGE_TIME$HOGE
echo "" > $HOGE

# traces
export HOGE=traces.jsonl
echo $HOGE

cat $HOGE > $HOGE_TIME$HOGE
echo "" > $HOGE

ls -l | tail -n 10

