// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

package cli

import (
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/GSI-HPC/sdash/internal/exitcode"
)

// blocks returns the content of the code blocks of one language in the
// manual of the profiles, doc/profiles.md.
func blocks(t *testing.T, language string) []string {
	t.Helper()
	manual, err := os.ReadFile("../../doc/profiles.md")
	require.NoError(t, err)
	var found []string
	for _, block := range regexp.MustCompile("(?s)```"+language+"\n(.*?)```").FindAllStringSubmatch(string(manual), -1) {
		found = append(found, block[1])
	}
	return found
}

// The manual shows what "sdash config check" prints for its own example,
// and what it prints once three mistakes are made in it. Both are what the
// command prints here, for alice, whose home directory stands in the manual
// for the one of the test.
func TestTheManualShowsWhatConfigCheckPrints(t *testing.T) {
	t.Parallel()

	examples, consoles := blocks(t, "yaml"), blocks(t, "console")
	require.Len(t, examples, 1)
	require.Len(t, consoles, 2)
	example := examples[0]
	printed := func(console string) string {
		command, output, found := strings.Cut(console, "\n")
		require.True(t, found)
		require.Equal(t, "$ sdash config check", command)
		return output
	}
	// asAlice runs the check on a configuration directory that holds files
	// and returns its output as alice would see it.
	asAlice := func(t *testing.T, files map[string]string) (stdout, stderr string, code int) {
		t.Helper()
		home := t.TempDir()
		dir := filepath.Join(home, ".config", "sdash")
		require.NoError(t, os.MkdirAll(dir, 0o700))
		for name, content := range files {
			require.NoError(t, os.WriteFile(filepath.Join(dir, name), []byte(content), 0o600))
		}
		stdout, stderr, code = check(t, map[string]string{"HOME": home})
		return strings.ReplaceAll(stdout, home, "/home/alice"), strings.ReplaceAll(stderr, home, "/home/alice"), code
	}

	t.Run("for the example", func(t *testing.T) {
		t.Parallel()

		stdout, stderr, code := asAlice(t, map[string]string{"clusters.yaml": example})

		assert.Equal(t, exitcode.OK, code)
		assert.Empty(t, stderr)
		assert.Equal(t, printed(consoles[0]), stdout)
	})

	// The three mistakes the manual names before its second listing.
	t.Run("for the example with three mistakes in it", func(t *testing.T) {
		t.Parallel()

		mistaken := strings.Replace(example, "    url: https://", "    urll: https://", 1)
		mistaken = strings.Replace(mistaken, "command: [ssh, login.example.org, scontrol, token, lifespan=3600]",
			"command: ssh login.example.org scontrol token lifespan=3600", 1)
		require.Equal(t, 3, strings.Count(mistaken, "\n---\n"), "the example holds four documents")
		require.NotEqual(t, example, mistaken)
		last := mistaken[strings.LastIndex(mistaken, "\n---\n")+len("\n---\n"):]

		stdout, stderr, code := asAlice(t, map[string]string{"clusters.yaml": mistaken, "old.yaml": last})

		assert.Equal(t, exitcode.Usage, code)
		assert.Empty(t, stdout)
		assert.Equal(t, printed(consoles[1]), stderr)
	})
}
