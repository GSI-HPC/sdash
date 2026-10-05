// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

package config

import (
	"go/parser"
	"go/token"
	"path/filepath"
	"strconv"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Reading a profile must run nothing and reach nothing: no token command,
// no ssh, no request to a slurmrestd (doc/adr/0016-e2e-and-fixtures-on-sind.md).
// A test of behaviour can show that for the profiles it tries. This one
// shows it for all of them: the code that reads and judges a profile imports
// nothing it could start a process or open a connection with, and reaches
// the operating system in dir.go alone, which opens names inside the
// configuration directory and nothing else.
func TestThePackagesThatReadAProfileCanRunNothingAndReachNothing(t *testing.T) {
	t.Parallel()

	// Only the standard library can start a process or open a connection
	// for these packages: their one other import is the YAML library, whose
	// own imports the module graph would show.
	forbidden := []string{"os/exec", "net", "net/http", "net/rpc", "plugin", "unsafe"}
	// The packages through which a file other than a profile could be
	// opened, and the one file that may use them.
	system := []string{"os", "syscall", "io/ioutil"}
	const systemFile = "dir.go"

	for _, dir := range []string{".", "../apis/v1alpha1"} {
		files, err := filepath.Glob(filepath.Join(dir, "*.go"))
		require.NoError(t, err)
		require.NotEmpty(t, files, "no Go file in %s", dir)
		checked := 0
		for _, file := range files {
			if strings.HasSuffix(file, "_test.go") {
				continue
			}
			checked++
			parsed, err := parser.ParseFile(token.NewFileSet(), file, nil, parser.ImportsOnly)
			require.NoError(t, err)
			for _, spec := range parsed.Imports {
				imported, err := strconv.Unquote(spec.Path.Value)
				require.NoError(t, err)
				assert.NotContains(t, forbidden, imported, "%s imports %s", file, imported)
				if dir != "." || filepath.Base(file) != systemFile {
					assert.NotContains(t, system, imported, "%s imports %s, which only %s may", file, imported, systemFile)
				}
			}
		}
		assert.Positive(t, checked, "no file of %s was checked", dir)
	}
}
