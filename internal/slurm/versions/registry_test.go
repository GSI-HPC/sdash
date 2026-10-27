// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

package versions

import (
	"encoding/json"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"slices"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestNegotiateTakesTheNewestParserBothSidesKnow(t *testing.T) {
	t.Parallel()
	newest := known[len(known)-1]

	cases := map[string][]string{
		"the server offers exactly the newest":    {string(newest)},
		"the server offers more than sdash knows": {"v0.0.1", string(newest), "v9.9.9"},
		"the order of the offer does not matter":  {string(newest), "v0.0.1"},
	}
	for name, offered := range cases {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			p, err := Negotiate(offered)
			require.NoError(t, err)
			assert.Equal(t, newest, p)
		})
	}
}

func TestNegotiateRefusesAServerWithNoKnownParser(t *testing.T) {
	t.Parallel()
	for name, offered := range map[string][]string{
		"none at all":   nil,
		"only unknowns": {"v0.0.1", "v9.9.9"},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			_, err := Negotiate(offered)
			require.ErrorIs(t, err, ErrNoKnownParser)
			assert.Contains(t, err.Error(), string(known[0]), "the refusal says what sdash speaks")
		})
	}
}

func TestKnownIsACopy(t *testing.T) {
	t.Parallel()
	k := Known()
	k[0] = "changed"
	assert.NotEqual(t, Parser("changed"), known[0])
}

// Each known parser has the directory the conformance test and the fixture
// tests read, with the document of that parser and of no other.
func TestEveryKnownParserHasItsVendoredDocument(t *testing.T) {
	t.Parallel()
	for _, p := range known {
		t.Run(string(p), func(t *testing.T) {
			t.Parallel()
			body, err := os.ReadFile(filepath.Join(p.Dir(), "openapi.json"))
			require.NoError(t, err)
			var doc struct {
				Info struct {
					Slurm struct {
						DataParsers []struct {
							Plugin string `json:"plugin"`
						} `json:"data_parsers"`
					} `json:"x-slurm"`
				} `json:"info"`
			}
			require.NoError(t, json.Unmarshal(body, &doc))
			require.Len(t, doc.Info.Slurm.DataParsers, 1)
			assert.Equal(t, string(p), doc.Info.Slurm.DataParsers[0].Plugin)

			fixtures, err := filepath.Glob(filepath.Join(p.Dir(), "testdata", "*.json"))
			require.NoError(t, err)
			assert.NotEmpty(t, fixtures, "no captured answers")
		})
	}
}

// mention is a data_parser version or a Slurm release line as code would
// spell it.
var mention = regexp.MustCompile(`v0\.0\.[0-9]+|\b2[0-9]\.(05|11)\b`)

// TestNoVersionIsNamedOutsideTheVersionPackages holds the rule of
// doc/adr/0005-versions-releases-and-capabilities.md: a feature is gated by a
// capability, and a version named anywhere else is a comparison waiting to
// happen.
func TestNoVersionIsNamedOutsideTheVersionPackages(t *testing.T) {
	t.Parallel()
	root := filepath.Join("..", "..", "..")
	allowed := []string{
		filepath.Join(root, "internal", "slurm", "versions"),
		filepath.Join(root, "internal", "slurm", "releases"),
	}

	var found []string
	err := filepath.WalkDir(root, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.IsDir() {
			if d.Name() == "node_modules" || slices.Contains(allowed, path) {
				return filepath.SkipDir
			}
			return nil
		}
		if !strings.HasSuffix(path, ".go") {
			return nil
		}
		body, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		for i, line := range strings.Split(string(body), "\n") {
			if mention.MatchString(line) {
				found = append(found, fmt.Sprintf("%s:%d: %s", path, i+1, strings.TrimSpace(line)))
			}
		}
		return nil
	})
	require.NoError(t, err)
	assert.Empty(t, found, "a version is named outside internal/slurm/versions and internal/slurm/releases")
}
