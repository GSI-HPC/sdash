// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

package wire

// Ping is what a ping of slurmctld answers about one controller.
type Ping struct {
	Hostname   string `json:"hostname"`
	Responding bool   `json:"responding"`
	// Latency is how long the controller took to answer, in microseconds.
	Latency int64 `json:"latency"`
	Primary bool  `json:"primary"`
	// Status is Slurm's text of the result, "No error" when the controller
	// answered.
	Status string `json:"status"`
}

// Pings is the answer of a ping.
type Pings struct {
	Envelope
	Pings []Ping `json:"pings"`
}

// ExitCode is how a job or a step ended.
type ExitCode struct {
	// Status is SUCCESS, ERROR, SIGNALED or CORE_DUMPED, or PENDING for one
	// that has not ended.
	Status     []string `json:"status"`
	ReturnCode Int      `json:"return_code"`
	Signal     struct {
		ID   Int    `json:"id"`
		Name string `json:"name"`
	} `json:"signal"`
}

// Job is a job as slurmctld knows it, an entry of the job list.
type Job struct {
	JobID     int64  `json:"job_id"`
	Name      string `json:"name"`
	UserName  string `json:"user_name"`
	GroupName string `json:"group_name"`
	Account   string `json:"account"`
	Partition string `json:"partition"`
	QOS       string `json:"qos"`
	// State is the base state, RUNNING, PENDING and the like, followed by
	// its flags.
	State            []string `json:"job_state"`
	StateReason      string   `json:"state_reason"`
	StateDescription string   `json:"state_description"`
	Flags            []string `json:"flags"`
	Priority         Int      `json:"priority"`
	Nice             int64    `json:"nice"`
	Hold             bool     `json:"hold"`

	// ArrayJobID is the id of the array a task belongs to, and ArrayTaskID
	// its index; ArrayTasks lists the tasks an array still has pending,
	// "1-3".
	ArrayJobID  Int    `json:"array_job_id"`
	ArrayTaskID Int    `json:"array_task_id"`
	ArrayTasks  string `json:"array_task_string"`
	HetJobID    Int    `json:"het_job_id"`

	SubmitTime   Time `json:"submit_time"`
	EligibleTime Time `json:"eligible_time"`
	StartTime    Time `json:"start_time"`
	EndTime      Time `json:"end_time"`
	// TimeLimit is in minutes.
	TimeLimit Int `json:"time_limit"`

	// Nodes is the host list of the job's nodes, "worker-[0-1]".
	Nodes       string   `json:"nodes"`
	NodeCount   Int      `json:"node_count"`
	CPUs        Int      `json:"cpus"`
	Tasks       Int      `json:"tasks"`
	BatchHost   string   `json:"batch_host"`
	TRESRequest string   `json:"tres_req_str"`
	TRESAlloc   string   `json:"tres_alloc_str"`
	Reservation string   `json:"resv_name"`
	Dependency  string   `json:"dependency"`
	ExitCode    ExitCode `json:"exit_code"`
	Comment     string   `json:"comment"`
	WorkDir     string   `json:"current_working_directory"`
	StdOut      string   `json:"stdout_expanded"`
	StdErr      string   `json:"stderr_expanded"`
	SubmitLine  string   `json:"submit_line"`
	// Resources are what the job was given, of which the names of its
	// nodes are read.
	Resources JobResources `json:"job_resources"`
}

// JobResources are the resources slurmctld gave a job.
type JobResources struct {
	Nodes struct {
		// Allocation has an entry for each node of the job.
		Allocation []struct {
			Name string `json:"name"`
		} `json:"allocation"`
	} `json:"nodes"`
}

// Node is a node as slurmctld knows it, an entry of the node list.
type Node struct {
	Name     string `json:"name"`
	Hostname string `json:"hostname"`
	Address  string `json:"address"`
	// State is the base state, IDLE, ALLOCATED and the like, followed by
	// its flags, DRAIN among them.
	State           []string `json:"state"`
	Reason          string   `json:"reason"`
	ReasonSetByUser string   `json:"reason_set_by_user"`
	ReasonChangedAt Time     `json:"reason_changed_at"`
	Partitions      []string `json:"partitions"`
	Features        []string `json:"features"`
	ActiveFeatures  []string `json:"active_features"`

	CPUs          int64 `json:"cpus"`
	AllocCPUs     int64 `json:"alloc_cpus"`
	AllocIdleCPUs int64 `json:"alloc_idle_cpus"`
	// CPULoad is the load average times 100.
	CPULoad int64 `json:"cpu_load"`
	// RealMemory, AllocMemory and FreeMemory are in megabytes.
	RealMemory  int64  `json:"real_memory"`
	AllocMemory int64  `json:"alloc_memory"`
	FreeMemory  Int    `json:"free_mem"`
	GRES        string `json:"gres"`
	GRESUsed    string `json:"gres_used"`
	TRES        string `json:"tres"`
	TRESUsed    string `json:"tres_used"`

	BootTime        Time   `json:"boot_time"`
	LastBusy        Time   `json:"last_busy"`
	Architecture    string `json:"architecture"`
	OperatingSystem string `json:"operating_system"`
	Version         string `json:"version"`
	Reservation     string `json:"reservation"`
	Comment         string `json:"comment"`
	Weight          int64  `json:"weight"`
}

// Jobs is the answer of the job list, and of a job by its id.
type Jobs struct {
	Envelope
	Jobs []Job `json:"jobs"`
}

// Nodes is the answer of the node list, and of a node by its name.
type Nodes struct {
	Envelope
	Nodes []Node `json:"nodes"`
}

// Partitions is the answer of the partition list, and of a partition by its
// name.
type Partitions struct {
	Envelope
	Partitions []Partition `json:"partitions"`
}

// Partition is a partition as slurmctld knows it.
type Partition struct {
	Name  string `json:"name"`
	Nodes struct {
		// Configured is the host list of the partition's nodes.
		Configured string `json:"configured"`
		Total      int64  `json:"total"`
	} `json:"nodes"`
	CPUs struct {
		Total int64 `json:"total"`
	} `json:"cpus"`
	Partition struct {
		// State is UP, DOWN, DRAIN or INACTIVE.
		State []string `json:"state"`
	} `json:"partition"`
	Maximums struct {
		// Time is in minutes.
		Time  Int `json:"time"`
		Nodes Int `json:"nodes"`
	} `json:"maximums"`
	Defaults struct {
		// Time is in minutes.
		Time Int `json:"time"`
	} `json:"defaults"`
	Priority struct {
		JobFactor int64 `json:"job_factor"`
		Tier      int64 `json:"tier"`
	} `json:"priority"`
	QOS struct {
		Assigned string `json:"assigned"`
	} `json:"qos"`
	NodeSets string `json:"node_sets"`
}

// Reservations is the answer of the reservation list, and of a reservation
// by its name.
type Reservations struct {
	Envelope
	Reservations []Reservation `json:"reservations"`
}

// Reservation is a reservation as slurmctld knows it.
type Reservation struct {
	Name string `json:"name"`
	// NodeList is the host list of the reserved nodes.
	NodeList  string `json:"node_list"`
	NodeCount int64  `json:"node_count"`
	CoreCount int64  `json:"core_count"`
	StartTime Time   `json:"start_time"`
	EndTime   Time   `json:"end_time"`
	// Flags are MAINT, DAILY, IGNORE_JOBS and the like.
	Flags []string `json:"flags"`
	// Users and Accounts are lists of names separated by commas, each of
	// which may be denied by a leading "-".
	Users     string `json:"users"`
	Accounts  string `json:"accounts"`
	Groups    string `json:"groups"`
	Partition string `json:"partition"`
	// TRES is what the reservation holds, as "cpu=2".
	TRES     string `json:"tres"`
	Features string `json:"features"`
	Licenses string `json:"licenses"`
}

// Diag is the answer of the diagnostics of slurmctld, what sdiag prints.
type Diag struct {
	Envelope
	Statistics Statistics `json:"statistics"`
}

// Statistics is the counters and timings slurmctld keeps since it last
// reset them, at midnight UTC or on a request. Times of a cycle are in
// microseconds.
type Statistics struct {
	// RequestTime is when slurmctld answered and Since when its counters
	// were last reset.
	RequestTime Time `json:"req_time"`
	Since       Time `json:"req_time_start"`

	ServerThreads    int64 `json:"server_thread_count"`
	AgentQueueSize   int64 `json:"agent_queue_size"`
	DBDAgentQueue    int64 `json:"dbd_agent_queue_size"`
	GettimeofdayCost int64 `json:"gettimeofday_latency"`

	JobsSubmitted int64 `json:"jobs_submitted"`
	JobsStarted   int64 `json:"jobs_started"`
	JobsCompleted int64 `json:"jobs_completed"`
	JobsCanceled  int64 `json:"jobs_canceled"`
	JobsFailed    int64 `json:"jobs_failed"`
	// JobsPending and JobsRunning are the counts at JobStatesTime.
	JobsPending   int64 `json:"jobs_pending"`
	JobsRunning   int64 `json:"jobs_running"`
	JobStatesTime Time  `json:"job_states_ts"`

	CycleLast      int64 `json:"schedule_cycle_last"`
	CycleMax       int64 `json:"schedule_cycle_max"`
	CycleMean      int64 `json:"schedule_cycle_mean"`
	CycleTotal     int64 `json:"schedule_cycle_total"`
	CycleMeanDepth int64 `json:"schedule_cycle_mean_depth"`
	CyclesPerMin   int64 `json:"schedule_cycle_per_minute"`
	QueueLength    int64 `json:"schedule_queue_length"`

	BackfillActive      bool  `json:"bf_active"`
	BackfillCycleLast   int64 `json:"bf_cycle_last"`
	BackfillCycleMax    int64 `json:"bf_cycle_max"`
	BackfillCycleMean   int64 `json:"bf_cycle_mean"`
	BackfillCycleCount  int64 `json:"bf_cycle_counter"`
	BackfillLastDepth   int64 `json:"bf_last_depth"`
	BackfillLastTried   int64 `json:"bf_last_depth_try"`
	BackfillQueueLength int64 `json:"bf_queue_len"`
	// BackfilledJobs counts the jobs backfill started since slurmctld
	// started, BackfilledSinceReset those since the last reset.
	BackfilledJobs       int64 `json:"bf_backfilled_jobs"`
	BackfilledSinceReset int64 `json:"bf_last_backfilled_jobs"`
	BackfillLastCycle    Time  `json:"bf_when_last_cycle"`

	RPCsByType []RPCType `json:"rpcs_by_message_type"`
	RPCsByUser []RPCUser `json:"rpcs_by_user"`
}

// RPCType is the calls slurmctld had of one message type. The document
// says seconds of the times; slurmctld counts microseconds, which a
// comparison with sdiag on a sind cluster confirmed
// (doc/adr/0040-rpc-times-are-microseconds.md).
type RPCType struct {
	Message     string `json:"message_type"`
	Count       int64  `json:"count"`
	TotalTime   int64  `json:"total_time"`
	AverageTime Int    `json:"average_time"`
}

// RPCUser is the calls slurmctld had of one user.
type RPCUser struct {
	User        string `json:"user"`
	Count       int64  `json:"count"`
	TotalTime   int64  `json:"total_time"`
	AverageTime Int    `json:"average_time"`
}
