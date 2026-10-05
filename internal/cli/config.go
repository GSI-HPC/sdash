// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

package cli

import (
	"fmt"
	"io"
	"path/filepath"
	"strings"
	"text/tabwriter"

	"github.com/spf13/cobra"

	"github.com/GSI-HPC/sdash/internal/config"
	"github.com/GSI-HPC/sdash/internal/exitcode"
)

// newConfigCommand builds "sdash config", the commands about the
// configuration, of which "check" is the one there is.
func newConfigCommand(p Process, o *options) *cobra.Command {
	cmd := &cobra.Command{
		Use:   "config",
		Short: "Check the configuration of sdash",
		Long: strings.TrimSpace(`
The configuration of sdash is its cluster profiles: YAML documents of the
kind Cluster in the files *.yaml of the configuration directory. sdash reads
them and never writes them.`),
		Args: cobra.NoArgs,
		// cobra prints the help of a command that cannot run and exits 0,
		// whatever follows its name. With a function of its own the command
		// gets its arguments checked, so "sdash config chekc" is the usage
		// error it is.
		RunE: func(cmd *cobra.Command, _ []string) error {
			return cmd.Help()
		},
	}
	cmd.AddCommand(newConfigCheckCommand(p, o))
	return cmd
}

// newConfigCheckCommand builds "sdash config check", which reads the cluster
// profiles as the server does at its start and prints what they hold, or
// what is wrong with them.
func newConfigCheckCommand(p Process, o *options) *cobra.Command {
	return &cobra.Command{
		Use:   "check",
		Short: "Read the cluster profiles and print what they hold or what is wrong",
		Long: strings.TrimSpace(`
Read every cluster profile in the configuration directory and print, for each
cluster, its name, how its slurmrestd is reached and where its token comes
from. When a profile is not valid, print every problem with the file, the
line and the column it is at, and exit 2.

Nothing is contacted and nothing is run: the check reads the profiles and no
other file. Of a token it prints where it comes from, the name of the
variable, the path of the file or the program of the command, and never the
token. A problem is printed with its place and the rule that is broken, and
without the value that broke it, which may be a secret in the wrong field.`),
		Args: cobra.NoArgs,
		RunE: func(*cobra.Command, []string) error {
			where, profiles, err := readProfiles(p, *o)
			if err != nil {
				return err
			}
			return printProfiles(p.Stdout, where, profiles)
		},
	}
}

// readProfiles finds the configuration directory of the process and reads
// the cluster profiles in it. A profile that is not valid is a
// configuration error: the caller starts nothing, and sdash exits 2.
func readProfiles(p Process, o options) (config.Location, *config.Profiles, error) {
	where := config.Locate(o.config, p.getenv)
	if where.Dir == "" {
		return where, &config.Profiles{Missing: true}, nil
	}
	profiles, err := config.Load(where.Dir)
	if err != nil {
		return where, nil, exitcode.Wrap(exitcode.Usage, err)
	}
	return where, profiles, nil
}

// printProfiles writes what "sdash config check" reports of valid profiles:
// where they were read from, and a line for each cluster.
func printProfiles(w io.Writer, where config.Location, profiles *config.Profiles) error {
	var out strings.Builder
	switch count := len(profiles.Clusters); {
	case where.Dir == "":
		fmt.Fprintf(&out, "no clusters: none of %s, %s, XDG_CONFIG_HOME and HOME names a configuration directory\n",
			config.FlagConfig, config.EnvConfig)
	case profiles.Missing:
		fmt.Fprintf(&out, "no clusters: %s (from %s) does not exist\n", config.Printable(where.Dir), where.From)
	case count == 0:
		fmt.Fprintf(&out, "no clusters in %s (from %s)\n", config.Printable(where.Dir), where.From)
	case count == 1:
		fmt.Fprintf(&out, "1 cluster in %s (from %s)\n", config.Printable(where.Dir), where.From)
	default:
		fmt.Fprintf(&out, "%d clusters in %s (from %s)\n", count, config.Printable(where.Dir), where.From)
	}
	if len(profiles.Clusters) > 0 {
		table := tabwriter.NewWriter(&out, 0, 0, 2, ' ', 0)
		// Neither write can fail: the table is written into memory.
		_, _ = fmt.Fprintln(table, "NAME\tENDPOINT\tROUTE\tTOKEN\tFILE")
		for _, cluster := range profiles.Clusters {
			_, _ = fmt.Fprintf(table, "%s\t%s\t%s\t%s\t%s:%d\n",
				cluster.Metadata.Name, endpoint(cluster), route(cluster), tokenSource(cluster),
				config.Printable(filepath.Base(cluster.Position.File)), cluster.Position.Line)
		}
		_ = table.Flush()
	}
	if _, err := io.WriteString(w, out.String()); err != nil {
		return fmt.Errorf("print the cluster profiles: %w", err)
	}
	return nil
}

// endpoint says where the slurmrestd of a cluster listens.
func endpoint(cluster config.Cluster) string {
	if socket := cluster.Spec.Endpoint.Socket; socket != "" {
		return "unix:" + config.Printable(socket)
	}
	return config.Printable(cluster.Spec.Endpoint.URL)
}

// route says how the endpoint of a cluster is reached.
func route(cluster config.Cluster) string {
	if cluster.Spec.SSH == nil {
		return "direct"
	}
	return "ssh " + cluster.Spec.SSH.Host
}

// tokenSource says where the token of a cluster comes from, and holds
// nothing that could be one. Of a command it names the program alone: an
// argument may be a secret, a pass phrase or the token itself. The first
// item is the program and nothing more, because the rules of a profile
// refuse one with white space in it: a command line written as one item
// would otherwise be printed whole here, its arguments included.
func tokenSource(cluster config.Cluster) string {
	switch token := cluster.Spec.Token; {
	case len(token.Command) > 0:
		return "command " + config.Printable(token.Command[0])
	case token.Env != "":
		return "env " + token.Env
	default:
		return "file " + config.Printable(token.File)
	}
}
