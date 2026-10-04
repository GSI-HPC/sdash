// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

package cli

import (
	"encoding/json"
	"fmt"
	"strings"

	"github.com/spf13/cobra"

	"github.com/GSI-HPC/sdash/internal/version"
)

// newVersionCommand builds "sdash version", which prints what
// internal/version reports, as one line or with --json as an object.
//
// Adapted from GSI-HPC/clusterctl internal/cli/root.go.
func newVersionCommand(p Process) *cobra.Command {
	var asJSON bool
	cmd := &cobra.Command{
		Use:   "version",
		Short: "Print the build provenance of this binary",
		Long: strings.TrimSpace(`
Print the version, the revision it was built from and the toolchain that
built it. No version number is stored in the source tree: a release build
takes it from the signed git tag, and any other build reports "devel".`),
		Args: cobra.NoArgs,
		RunE: func(*cobra.Command, []string) error {
			info := version.Get()
			if !asJSON {
				if _, err := fmt.Fprintln(p.Stdout, info); err != nil {
					return fmt.Errorf("print the version: %w", err)
				}
				return nil
			}
			encoder := json.NewEncoder(p.Stdout)
			encoder.SetIndent("", "  ")
			if err := encoder.Encode(info); err != nil {
				return fmt.Errorf("print the version: %w", err)
			}
			return nil
		},
	}
	cmd.Flags().BoolVar(&asJSON, "json", false, "print the provenance as a JSON object")
	return cmd
}
