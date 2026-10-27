# SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
# SPDX-License-Identifier: Apache-2.0
#
# Takes the run out of an answer that capture.sh recorded, so that two
# captures of the same scenario differ where Slurm sends something else and
# not where the clock or the runner did
# (doc/adr/0031-slurmrestd-end-to-end-on-26-05.md). vendor.sh applies it to
# every answer it copies; applied twice, it changes nothing.
#
# - A point in time moves by the same amount as every other of the capture,
#   so that the run starts at $epoch: durations and order stay as they were.
#   $start is the moment the run started, the submission of the first job of
#   seed.sh.
# - An IPv4 address, which Docker hands out, moves into 192.0.2.0/24, the
#   block for documentation, and keeps its last octet.
# - What measures the machine the cluster ran on, rather than the scenario,
#   is 0: the latency of a ping, a node's load and free memory, the CPU time
#   of a job, and every figure of a diag answer.
# Usage: jq --argjson start SECONDS --argjson epoch SECONDS -f normalise.jq

# A key whose number, when it is one, is a point in time in seconds since the
# epoch. The guard on the value keeps 0, slurmrestd's "not set", and every
# duration out.
def when: test("(_time|_at|_ts)$|^(submission|start|end|eligible|time_start|req_time|req_time_start|last_backfill|last_busy|last_run|last_sched_evaluation|last_update)$");
def instant: type == "number" and . >= 1000000000;

# The key that names a number: its own, or that of the {set, infinite,
# number} object it is the number of.
def name($p): [$p[] | strings] | if last == "number" then .[-2] else last end;

def measured: test("^(latency|cpu_load|free_mem)$");
def cputime($p): [$p[] | strings] as $s
  | any(range(0; ($s | length) - 1); $s[.] == "time" and ($s[. + 1] | IN("user", "system", "total")));

reduce (paths(numbers) as $p | [$p, name($p)]) as [$p, $k] (.;
  if ($k | when) and (getpath($p) | instant) then
    setpath($p; getpath($p) - $start + $epoch)
  elif ($k | measured) or ($p[0] == "statistics" and ($k | endswith("_id") | not)) or cputime($p) then
    setpath($p; 0)
  else . end)
| walk(if type == "string" then
    gsub("\\b[0-9]{1,3}\\.[0-9]{1,3}\\.[0-9]{1,3}\\.(?<d>[0-9]{1,3})\\b"; "192.0.2.\(.d)")
  else . end)
