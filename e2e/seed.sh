#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
# SPDX-License-Identifier: Apache-2.0
#
# Puts the e2e cluster into the scenario the fixtures show
# (doc/adr/0016-e2e-and-fixtures-on-sind.md): a QOS, a reservation, a drained
# node, and jobs in every state sdash tells apart. It runs once on a fresh
# cluster, in a fixed order, so that the job ids repeat: 1 completed, 2 failed,
# 3 cancelled, 4 and 5 running, 6 pending, 7 held, 8 an array of three.
set -euo pipefail

export SIND_REALM=${SIND_REALM:-e2e}

# as USER COMMAND [ARG...]: a command on the controller, as USER.
as() {
  local user=$1
  shift
  sind exec --user "$user" -- "$@"
}

# wait_for ID STATE: until job ID is in STATE, at most a minute.
wait_for() {
  local id=$1 state=$2
  for _ in $(seq 60); do
    if [ "$(as alice squeue -h -j "$id" -o %T 2>/dev/null | head -n 1)" = "$state" ]; then
      return 0
    fi
    sleep 1
  done
  echo "job $id did not reach $state" >&2
  exit 1
}

# A QOS beside the default one, which alice may use.
sind exec -- sacctmgr -i add qos high priority=100
sind exec -- sacctmgr -i modify user alice set qos+=high

# Finished jobs first, one at a time: each waits for its end.
as alice sbatch --wait --job-name=done --wrap='true'
as alice sbatch --wait --job-name=fails --wrap='exit 3' || true
cancelled=$(as alice sbatch --parsable --job-name=cancelled --hold --wrap='true')
as alice scancel "$cancelled"

# The drained node and the reservation leave two workers, four CPUs.
sind exec -- scontrol update nodename=worker-2 state=drain reason="e2e drained"
sind exec -- scontrol create reservation reservationname=maintenance \
  starttime=now+1day duration=60 users=root flags=maint nodes=worker-2

# Two jobs that fill the four CPUs, so that everything after them waits.
as alice sbatch --parsable --job-name=running-a --cpus-per-task=2 --wrap='sleep 3600'
as bob sbatch --parsable --job-name=running-b --cpus-per-task=2 --wrap='sleep 3600'
wait_for 4 RUNNING
wait_for 5 RUNNING
as alice sbatch --parsable --job-name=pending --qos=high --cpus-per-task=2 --wrap='sleep 60'
as bob sbatch --parsable --job-name=held --hold --wrap='sleep 60'
as alice sbatch --parsable --job-name=array --array=1-3 --cpus-per-task=2 --wrap='sleep 60'
wait_for 6 PENDING
as alice squeue
