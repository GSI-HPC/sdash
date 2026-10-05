// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

package config

import (
	"io/fs"
	"os"
	"reflect"
	"regexp"
	"slices"
	"strings"
	"testing"
	"testing/fstest"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/GSI-HPC/sdash/internal/apis/v1alpha1"
)

// The manual of the profiles, doc/profiles.md, is what a user writes a
// profile from and looks a message up in. These tests hold it to the code:
// its example is read, its table of fields is compared with the types, and
// its messages are compared with what the reader says.

// manual returns doc/profiles.md.
func manual(t *testing.T) string {
	t.Helper()
	text, err := os.ReadFile("../../doc/profiles.md")
	require.NoError(t, err)
	return string(text)
}

// section returns the part of the manual under the heading "## title", up
// to the next heading of that level.
func section(t *testing.T, title string) string {
	t.Helper()
	_, after, found := strings.Cut(manual(t), "\n## "+title+"\n")
	require.True(t, found, "the manual has a section %q", title)
	text, _, _ := strings.Cut(after, "\n## ")
	return text
}

// columns returns, for every row of every table in text, the content of
// its cells. The rows that draw the lines of a table are left out.
func columns(text string) [][]string {
	var rows [][]string
	for line := range strings.SplitSeq(text, "\n") {
		if !strings.HasPrefix(line, "| ") || strings.HasPrefix(line, "| ---") {
			continue
		}
		cells := strings.Split(strings.Trim(line, "|"), "|")
		for i := range cells {
			cells[i] = strings.TrimSpace(cells[i])
		}
		rows = append(rows, cells)
	}
	return rows
}

// fields lists the dotted path of every field of a document type, the
// mappings among them, as the manual and the messages write them.
func fields(typ reflect.Type, prefix string) []string {
	var paths []string
	for i := range typ.NumField() {
		field := typ.Field(i)
		path := join(prefix, field.Tag.Get("yaml"))
		paths = append(paths, path)
		switch kind := field.Type; kind.Kind() {
		case reflect.Struct:
			paths = append(paths, fields(kind, path)...)
		case reflect.Pointer:
			paths = append(paths, fields(kind.Elem(), path)...)
		}
	}
	return paths
}

// The example is the first thing a user copies. It has to be a set of
// valid profiles, and since the manual says it shows every field, it has
// to.
func TestTheExampleOfTheManualIsValidAndShowsEveryField(t *testing.T) {
	t.Parallel()

	blocks := regexp.MustCompile("(?s)```yaml\n(.*?)```").FindAllStringSubmatch(section(t, "An example"), -1)
	require.Len(t, blocks, 1, "the manual has one example")

	clusters, problems := parse("clusters.yaml", []byte(blocks[0][1]))

	require.Empty(t, problems)
	var names []string
	shown := map[string]bool{}
	for _, cluster := range clusters {
		names = append(names, cluster.Metadata.Name)
		spec := cluster.Spec
		for path, set := range map[string]bool{
			"metadata.name":        cluster.Metadata.Name != "",
			"spec.endpoint.url":    spec.Endpoint.URL != "",
			"spec.endpoint.socket": spec.Endpoint.Socket != "",
			"spec.endpoint.caFile": spec.Endpoint.CAFile != "",
			"spec.ssh":             spec.SSH != nil,
			"spec.ssh.host":        spec.SSH != nil && spec.SSH.Host != "",
			"spec.token.command":   spec.Token.Command != nil,
			"spec.token.env":       spec.Token.Env != "",
			"spec.token.file":      spec.Token.File != "",
			"spec.user":            spec.User != "",
			"apiVersion":           cluster.APIVersion != "",
			"kind":                 cluster.Kind != "",
			"metadata":             true,
			"spec":                 true,
			"spec.endpoint":        true,
			"spec.token":           true,
		} {
			shown[path] = shown[path] || set
		}
	}
	assert.Equal(t, []string{"vesta", "vesta-test", "kepler", "dev"}, names)
	for _, path := range fields(reflect.TypeFor[v1alpha1.Cluster](), "") {
		assert.True(t, shown[path], "the example shows %s", path)
	}
}

// A field the types gain and the manual does not is a field nobody knows
// of; a field the manual keeps and the types lost is one the reader calls
// unknown.
func TestTheManualListsTheFieldsTheTypesHave(t *testing.T) {
	t.Parallel()

	var listed []string
	for _, row := range columns(section(t, "The fields")) {
		if name, found := strings.CutPrefix(row[0], "`"); found {
			listed = append(listed, strings.TrimSuffix(name, "`"))
		}
	}

	assert.ElementsMatch(t, fields(reflect.TypeFor[v1alpha1.Cluster](), ""), listed)
}

// everyMessage returns the message of every problem the tests of this
// package provoke: those of the tables of wrong files, and those that take
// a directory to provoke.
func everyMessage(t *testing.T) []string {
	t.Helper()
	var messages []string
	for _, table := range [][]wrong{brokenRules(), missingParts(), unknownFields(), otherDocuments(), notYAML()} {
		for _, file := range table {
			_, problems := parse("f.yaml", []byte(file.src))
			require.NotEmpty(t, problems, file.name)
			for _, problem := range problems {
				messages = append(messages, problem.Message)
			}
		}
	}

	tooLong := strings.Repeat("#", maxFileSize+1)
	_, err := load(denied{name: "denied.yaml", FS: fstest.MapFS{
		"denied.yaml":      {Data: []byte(named("denied"))},
		"device.yaml":      {Mode: fs.ModeDevice | 0o600},
		"directory.yaml/x": {},
		"first.yaml":       {Data: []byte(named("vesta"))},
		"irregular.yaml":   {Mode: fs.ModeIrregular | 0o600},
		"long.yaml":        {Data: []byte(tooLong)},
		"name.yaml":        {Data: []byte(named("Vesta"))},
		"pipe.yaml":        {Mode: fs.ModeNamedPipe | 0o600},
		"second.yaml":      {Data: []byte(named("vesta"))},
		"socket.yaml":      {Mode: fs.ModeSocket | 0o600},
	}}, "sdash")
	var invalid *Error
	require.ErrorAs(t, err, &invalid)
	require.Len(t, invalid.Problems, 9, "one problem for each file but first.yaml")
	for _, problem := range invalid.Problems {
		messages = append(messages, problem.Message)
	}

	_, err = Load(os.Args[0])
	require.Error(t, err, "the test binary is no directory")
	return append(messages, err.Error())
}

// The manual gives every message in the words of the reader, with "…" for
// what was written. A message that is reworded, a rule that is added and a
// rule that is dropped each show here, as long as the rule has a case in
// one of the tables of wrong files.
func TestTheManualGivesEveryMessageInTheWordsOfTheReader(t *testing.T) {
	t.Parallel()

	type pattern struct {
		written string
		matches *regexp.Regexp
	}
	var documented []pattern
	for _, row := range columns(section(t, "The rules and what sdash says")) {
		require.Len(t, row, 2, "a row of the rules has two cells: %q", row)
		for _, span := range regexp.MustCompile("`([^`]+)`").FindAllStringSubmatch(row[1], -1) {
			parts := strings.Split(span[1], "…")
			for i := range parts {
				parts[i] = regexp.QuoteMeta(parts[i])
			}
			documented = append(documented, pattern{
				written: span[1],
				matches: regexp.MustCompile("^(?s:" + strings.Join(parts, ".+") + ")$"),
			})
		}
	}
	require.NotEmpty(t, documented)
	said := everyMessage(t)

	for _, pattern := range documented {
		assert.True(t, slices.ContainsFunc(said, pattern.matches.MatchString),
			"the manual gives a message the reader never says: %s", pattern.written)
	}
	for _, message := range said {
		assert.True(t, slices.ContainsFunc(documented, func(p pattern) bool { return p.matches.MatchString(message) }),
			"the reader says what the manual does not give: %s", message)
	}
}
