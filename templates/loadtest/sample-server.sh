#!/usr/bin/env bash
# HQ load-test template: sample the staging copy every INTERVAL seconds into a CSV while a run is going.
#   APP_UNIT=myapp JOB_UNIT=myapp-job HEALTH_URL=http://127.0.0.1:8080/health bash sample-server.sh samples.csv [5]
# APP_UNIT: the app's systemd unit (its memory and CPU). JOB_UNIT: the background job's oneshot unit, if any.
# HEALTH_URL: a cheap loopback endpoint; its round trip is a proxy for a backed-up event loop or worker pool.
# Redis and Postgres columns read 0 when they aren't installed.
set -u
OUT=${1:?usage: sample-server.sh <out.csv> [interval]}; INTERVAL=${2:-5}
APP_UNIT=${APP_UNIT:?APP_UNIT is required}; JOB_UNIT=${JOB_UNIT:-}; HEALTH_URL=${HEALTH_URL:-http://127.0.0.1:8080/health}
echo "ts,cpu_busy_pct,cpu_steal_pct,mem_used_mb,mem_avail_mb,swap_used_mb,api_rss_mb,api_cpu_pct,redis_used_mb,pg_conns,pg_active,pg_lock_waits,load1,health_ms,job_running" > "$OUT"
read -r _ u n s i w q sq st _ < /proc/stat; prev_total=$((u+n+s+i+w+q+sq+st)); prev_idle=$((i+w)); prev_steal=$st
app_pid() { systemctl show -p MainPID --value "$APP_UNIT"; }
pid=$(app_pid); prev_ticks=$(awk '{print $14+$15}' /proc/$pid/stat 2>/dev/null || echo 0); hz=$(getconf CLK_TCK)
while :; do
  sleep "$INTERVAL"
  read -r _ u n s i w q sq st _ < /proc/stat; total=$((u+n+s+i+w+q+sq+st)); idle=$((i+w))
  dt=$((total-prev_total)); [ "$dt" -gt 0 ] || dt=1
  busy=$(( (100*(dt-(idle-prev_idle)))/dt )); steal=$(( (100*(st-prev_steal))/dt ))
  prev_total=$total; prev_idle=$idle; prev_steal=$st
  mem=$(awk '/MemTotal/{t=$2}/MemAvailable/{a=$2}/SwapTotal/{st=$2}/SwapFree/{sf=$2}END{printf "%d,%d,%d",(t-a)/1024,a/1024,(st-sf)/1024}' /proc/meminfo)
  npid=$(app_pid); if [ "$npid" != "$pid" ]; then pid=$npid; prev_ticks=$(awk '{print $14+$15}' /proc/$pid/stat 2>/dev/null || echo 0); fi
  rss=$(awk '/VmRSS/{printf "%d",$2/1024}' /proc/$pid/status 2>/dev/null || echo 0)
  ticks=$(awk '{print $14+$15}' /proc/$pid/stat 2>/dev/null || echo 0)
  app_cpu=$(( (100*(ticks-prev_ticks))/(hz*INTERVAL) )); prev_ticks=$ticks
  redis=$(command -v redis-cli >/dev/null && redis-cli info memory 2>/dev/null | awk -F: '/^used_memory:/{printf "%d",$2/1048576}')
  pgs=$(command -v psql >/dev/null && runuser -u postgres -- psql -Atc "select count(*) filter (where backend_type='client backend'), count(*) filter (where state='active' and backend_type='client backend'), count(*) filter (where wait_event_type='Lock') from pg_stat_activity" 2>/dev/null | tr '|' ',')
  load1=$(cut -d' ' -f1 /proc/loadavg)
  health=$(curl -s -o /dev/null -m 10 -w '%{time_total}' "$HEALTH_URL" | awk '{printf "%d",$1*1000}')
  job=0; if [ -n "$JOB_UNIT" ]; then case "$(systemctl is-active "$JOB_UNIT")" in activating|active) job=1;; esac; fi
  echo "$(date +%s),$busy,$steal,$mem,$rss,$app_cpu,${redis:-0},${pgs:-0,0,0},$load1,${health:-10000},$job" >> "$OUT"
done
