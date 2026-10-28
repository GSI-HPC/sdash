// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

// Package model owns sdash's own picture of a cluster's jobs, nodes,
// partitions and reservations, which no data_parser version shapes
// (doc/adr/0009-one-tolerant-wire-model.md). The answers of slurmrestd are
// mapped to it as they are decoded, and everything above the client, the
// cache and the browser API alike, sees only this.
//
// A number or a time that slurmrestd may leave unset is a pointer here, nil
// when it was; a limit that is unlimited is nil as well, and says so in a
// field of its own where the two differ to a reader.
package model

import (
	"fmt"
	"strings"
	"time"

	"github.com/GSI-HPC/sdash/internal/slurm/wire"
)

// Job is a job as slurmctld knows it.
type Job struct {
	// ID is the job's own id. A task of an array has one of its own.
	ID int64
	// DisplayID is the id as Slurm's tools write it: 8_2 for a task of an
	// array, 8_[1-3] for the tasks an array still has pending, 8 for any
	// other job.
	DisplayID string
	// ArrayJobID is the id of the array the job belongs to; nil for a job of
	// no array.
	ArrayJobID *int64
	// ArrayTaskID is the index of the job in its array; nil for a job of no
	// array and for the record of the tasks still pending.
	ArrayTaskID *int64
	// ArrayTasks are the tasks of an array still pending, "1-3"; empty for
	// any other job.
	ArrayTasks string

	Name      string
	User      string
	Group     string
	Account   string
	Partition string
	QOS       string
	// State is the base state, RUNNING, PENDING and the like.
	State string
	// Flags are the flags of the state, COMPLETING and the like.
	Flags []string
	// Reason is why the job waits or ended as it did; empty for none.
	Reason   string
	Priority *int64

	Submitted *time.Time
	Eligible  *time.Time
	Started   *time.Time
	Ended     *time.Time
	// TimeLimit is in minutes; nil when it is not set or unlimited.
	TimeLimit *int64

	// Nodes is the host list of the job's nodes, "worker-[0-1]".
	Nodes     string
	NodeCount *int64
	CPUs      *int64
	// ExitCode is how the job ended; nil for one that has not.
	ExitCode *ExitCode

	Reservation string
	Dependency  string
	WorkDir     string
	StdOut      string
	StdErr      string
}

// ExitCode is how a job ended.
type ExitCode struct {
	// Status is SUCCESS, ERROR, SIGNALED or CORE_DUMPED.
	Status     string
	ReturnCode *int64
	// Signal names the signal that ended the job; empty for none.
	Signal string
}

// Node is a node as slurmctld knows it.
type Node struct {
	Name string
	// State is the base state, IDLE, ALLOCATED, MIXED and the like.
	State string
	// Flags are the flags of the state, DRAIN among them.
	Flags []string
	// Reason is why the node is drained or down; empty for none.
	Reason     string
	Partitions []string
	Features   []string

	CPUs      int64
	AllocCPUs int64
	// Load is the load average.
	Load float64
	// Memory, AllocMemory and FreeMemory are in megabytes; FreeMemory is
	// nil when the node did not report it.
	Memory      int64
	AllocMemory int64
	FreeMemory  *int64
	// GRES is what the node offers, "gpu:a100:4", and GRESUsed what is in
	// use.
	GRES     string
	GRESUsed string

	Architecture string
	Booted       *time.Time
	Reservation  string
}

// Partition is a partition as slurmctld knows it.
type Partition struct {
	Name string
	// State is UP, DOWN, DRAIN or INACTIVE.
	State string
	// Nodes is the host list of the partition's nodes.
	Nodes     string
	NodeCount int64
	CPUs      int64
	// MaxTime and DefaultTime are in minutes; nil when not set or
	// unlimited.
	MaxTime     *int64
	DefaultTime *int64
	// MaxNodes is the most nodes a job may have; nil when unlimited.
	MaxNodes     *int64
	PriorityTier int64
	QOS          string
}

// Reservation is a reservation as slurmctld knows it.
type Reservation struct {
	Name string
	// Nodes is the host list of the reserved nodes.
	Nodes     string
	NodeCount int64
	Cores     int64
	// Start and End are nil when not set; End is nil as well for a
	// reservation without an end.
	Start, End *time.Time
	// Flags are MAINT, DAILY, IGNORE_JOBS and the like.
	Flags []string
	// Users, Accounts and Groups may use the reservation, unless a name
	// starts with "-", which denies it.
	Users, Accounts, Groups []string
	Partition               string
	// TRES is what the reservation holds, as "cpu=2".
	TRES     string
	Features string
	Licenses string
}

// JobOf maps a job of the wire to the model.
func JobOf(w *wire.Job) Job {
	j := Job{
		ID:          w.JobID,
		DisplayID:   fmt.Sprint(w.JobID),
		Name:        w.Name,
		User:        w.UserName,
		Group:       w.GroupName,
		Account:     w.Account,
		Partition:   w.Partition,
		QOS:         w.QOS,
		Reason:      reason(w.StateReason),
		Priority:    value(w.Priority),
		Submitted:   moment(w.SubmitTime),
		Eligible:    moment(w.EligibleTime),
		Started:     moment(w.StartTime),
		Ended:       moment(w.EndTime),
		TimeLimit:   value(w.TimeLimit),
		Nodes:       w.Nodes,
		NodeCount:   value(w.NodeCount),
		CPUs:        value(w.CPUs),
		Reservation: w.Reservation,
		Dependency:  w.Dependency,
		WorkDir:     w.WorkDir,
		StdOut:      w.StdOut,
		StdErr:      w.StdErr,
	}
	j.State, j.Flags = split(w.State)

	// slurmrestd sends 0 as the array of a job that belongs to none.
	if array := value(w.ArrayJobID); array != nil && *array != 0 {
		j.ArrayJobID = array
		j.ArrayTaskID = value(w.ArrayTaskID)
		j.ArrayTasks = w.ArrayTasks
		switch {
		case j.ArrayTaskID != nil:
			j.DisplayID = fmt.Sprintf("%d_%d", *array, *j.ArrayTaskID)
		case w.ArrayTasks != "":
			j.DisplayID = fmt.Sprintf("%d_[%s]", *array, w.ArrayTasks)
		}
	}

	// A job that has not ended has the exit code status PENDING, or none.
	if len(w.ExitCode.Status) > 0 && w.ExitCode.Status[0] != "PENDING" && finished(j.State) {
		j.ExitCode = &ExitCode{
			Status:     w.ExitCode.Status[0],
			ReturnCode: value(w.ExitCode.ReturnCode),
			Signal:     w.ExitCode.Signal.Name,
		}
	}
	return j
}

// NodeOf maps a node of the wire to the model.
func NodeOf(w *wire.Node) Node {
	n := Node{
		Name:         w.Name,
		Reason:       w.Reason,
		Partitions:   w.Partitions,
		Features:     w.Features,
		CPUs:         w.CPUs,
		AllocCPUs:    w.AllocCPUs,
		Load:         float64(w.CPULoad) / 100,
		Memory:       w.RealMemory,
		AllocMemory:  w.AllocMemory,
		FreeMemory:   value(w.FreeMemory),
		GRES:         w.GRES,
		GRESUsed:     w.GRESUsed,
		Architecture: w.Architecture,
		Booted:       moment(w.BootTime),
		Reservation:  w.Reservation,
	}
	n.State, n.Flags = split(w.State)
	return n
}

// PartitionOf maps a partition of the wire to the model.
func PartitionOf(w *wire.Partition) Partition {
	p := Partition{
		Name:         w.Name,
		Nodes:        w.Nodes.Configured,
		NodeCount:    w.Nodes.Total,
		CPUs:         w.CPUs.Total,
		MaxTime:      value(w.Maximums.Time),
		DefaultTime:  value(w.Defaults.Time),
		MaxNodes:     value(w.Maximums.Nodes),
		PriorityTier: w.Priority.Tier,
		QOS:          w.QOS.Assigned,
	}
	p.State, _ = split(w.Partition.State)
	return p
}

// ReservationOf maps a reservation of the wire to the model.
func ReservationOf(w *wire.Reservation) Reservation {
	return Reservation{
		Name:      w.Name,
		Nodes:     w.NodeList,
		NodeCount: w.NodeCount,
		Cores:     w.CoreCount,
		Start:     moment(w.StartTime),
		End:       moment(w.EndTime),
		Flags:     w.Flags,
		Users:     names(w.Users),
		Accounts:  names(w.Accounts),
		Groups:    names(w.Groups),
		Partition: w.Partition,
		TRES:      w.TRES,
		Features:  w.Features,
		Licenses:  w.Licenses,
	}
}

// names parts a list of names separated by commas; nil for the empty
// string.
func names(list string) []string {
	var out []string
	for name := range strings.SplitSeq(list, ",") {
		if name = strings.TrimSpace(name); name != "" {
			out = append(out, name)
		}
	}
	return out
}

// split parts a state as slurmrestd sends it, the base state first and its
// flags after it.
func split(state []string) (string, []string) {
	if len(state) == 0 {
		return "UNKNOWN", nil
	}
	return state[0], state[1:]
}

// finished tells whether a job in the base state s has ended.
func finished(s string) bool {
	switch s {
	case "PENDING", "RUNNING", "SUSPENDED", "CONFIGURING", "REQUEUED", "RESIZING":
		return false
	}
	return true
}

// reason drops the "None" slurmctld writes for no reason.
func reason(r string) string {
	if strings.EqualFold(r, "None") {
		return ""
	}
	return r
}

// value returns the number of n, or nil when it is unset or unlimited.
func value[T int64 | float64](n wire.Number[T]) *T {
	v, ok := n.Value()
	if !ok {
		return nil
	}
	return &v
}

// moment returns the point in time t, or nil when it is unset.
func moment(t wire.Time) *time.Time {
	v, ok := t.Value()
	if !ok {
		return nil
	}
	v = v.UTC()
	return &v
}
