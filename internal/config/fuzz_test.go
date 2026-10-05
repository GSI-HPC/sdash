// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

package config

import (
	"strconv"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Whatever a file holds, reading it ends in clusters and problems and never
// in a panic. A problem is at a place in the file or with the file as a
// whole, never at half a place. And what is accepted as a cluster is one:
// it keeps the rules of a profile as they are restated here, and written out
// again from what was read, it reads back as the same cluster.
//
// Adapted from GSI-HPC/clusterctl internal/config/fuzz_test.go.
func FuzzParse(f *testing.F) {
	for _, seed := range []string{
		profile(viaURL, byEnv),
		profile("endpoint: {socket: /run/slurmrestd.socket}", "ssh: {host: login.example.org}",
			"token: {command: [ssh, login.example.org, scontrol, token, lifespan=3600]}", "user: alice"),
		profile("endpoint:", "  url: 'https://slurm.example.org:6820/slurm'", "  caFile: /etc/pki/ca.pem", "token: {file: /home/alice/token}"),
		profile(viaURL, byEnv) + "---\n# nothing\n---\n" + profile(viaURL, `token: {command: [sh, -c, "a\nb", '', 0600, 1e3, !!str 8, !x y]}`),
		profile("endpoint: {urll: x, url: 'ftp://x', socket: y}", "ssh: login", "token: {command: ssh, env: 1, file: ~}", "user: [a]"),
		profile("endpoint: {url: 'https://a:b@h:x/?t=1#f'}", "token: {command: ['ssh login scontrol token', ./token, ' ', /a b]}"),
		"apiversion: sdash/v1alpha1\nKind: Cluster\nmetadata: {name: vesta}\n",
		"apiVersion: clusterctl/v1alpha1\nkind: Site\nspec: {fanout: {max: 16}}\n",
		"a:\n  - b: 0600\n    c: [1, 1e3, .5, !!str 8, !x y]\n---\n# c\n---\nd: |\n  text\n",
		"a: &x 1\nb: *x\n", "? [a]\n: 1\n", "\ufeffa: 0x1F\n", "a: [|\n x\n]\n", "...\n", "%YAML 1.2\n---\na: ~\n",
		"apiVersion: sdash/v1alpha1\nkind: Cluster\nmetadata: &m {name: vesta}\nspec: {<<: *m, endpoint: *m}\n",
		"- apiVersion: sdash/v1alpha1\n", "apiVersion: [sdash/v1alpha1]\nkind: {}\n", "{", "\x00", "",
	} {
		require.LessOrEqual(f, len(seed), fuzzedLength, "a seed the target would skip")
		f.Add(seed)
	}
	f.Fuzz(func(t *testing.T, src string) {
		if len(src) > fuzzedLength {
			t.Skip("longer than a profile is")
		}
		clusters, problems := parse("f.yaml", []byte(src))

		for _, problem := range problems {
			assert.Equal(t, "f.yaml", problem.File)
			assert.NotEmpty(t, problem.Message)
			assert.Equal(t, problem.Line > 0, problem.Column > 0, "the place of %q", problem)
			assert.GreaterOrEqual(t, problem.Line, 0)
			assert.GreaterOrEqual(t, problem.Column, 0)
		}
		for _, cluster := range clusters {
			assert.Positive(t, cluster.Position.Line, "an accepted cluster has the line of its name")
			assert.Positive(t, cluster.Position.Column)
			requireKeepsTheRules(t, cluster)

			again, wrong := parse("f.yaml", []byte(written(cluster)))
			require.Empty(t, wrong, "written out again, the cluster is not valid:\n%s", written(cluster))
			require.Len(t, again, 1)
			assert.Equal(t, cluster.Cluster, again[0].Cluster)
		}
	})
}

// fuzzedLength bounds the inputs the fuzz target judges. The fuzzer shortens
// every input that reaches new code, and for a long one it tries a number of
// shorter ones that grows with the square of its length. With inputs of a
// kilobyte, more than 30 s of a 40 s run went into shortening them and none
// into trying anything new. A profile is a few hundred bytes, and what a
// longer file can hold that a shorter one cannot is more of the same.
const fuzzedLength = 512

// requireKeepsTheRules restates what makes a profile a cluster, in other
// words than the rules themselves use.
func requireKeepsTheRules(t *testing.T, cluster Cluster) {
	t.Helper()
	spec := cluster.Spec

	require.Equal(t, "sdash/v1alpha1", cluster.APIVersion)
	require.Equal(t, "Cluster", cluster.Kind)
	require.Regexp(t, `^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$`, cluster.Metadata.Name)

	require.NotEqual(t, spec.Endpoint.URL == "", spec.Endpoint.Socket == "", "exactly one of url and socket")
	if spec.Endpoint.URL != "" {
		require.Regexp(t, `^(?i:https?)://[^/?#@]+(/[^?#]*)?$`, spec.Endpoint.URL)
	} else {
		require.True(t, strings.HasPrefix(spec.Endpoint.Socket, "/"))
	}
	if spec.Endpoint.CAFile != "" {
		require.Regexp(t, `^(?i:https)://`, spec.Endpoint.URL)
		require.True(t, strings.HasPrefix(spec.Endpoint.CAFile, "/"))
	}
	if spec.SSH != nil {
		require.Regexp(t, `^[A-Za-z0-9._:][A-Za-z0-9._:-]*$`, spec.SSH.Host)
	}

	sources := 0
	if spec.Token.Command != nil {
		sources++
		require.NotEmpty(t, spec.Token.Command)
		program := spec.Token.Command[0]
		require.Equal(t, []string{program}, strings.Fields(program), "the program is one word")
		require.True(t, strings.HasPrefix(program, "/") || !strings.Contains(program, "/"),
			"the program is a name or an absolute path")
	}
	if spec.Token.Env != "" {
		sources++
		require.Regexp(t, `^[A-Za-z_][A-Za-z0-9_]*$`, spec.Token.Env)
	}
	if spec.Token.File != "" {
		sources++
		require.True(t, strings.HasPrefix(spec.Token.File, "/"))
	}
	require.Equal(t, 1, sources, "exactly one source of the token")

	for _, value := range append([]string{cluster.Metadata.Name, spec.Endpoint.URL, spec.Endpoint.Socket,
		spec.Endpoint.CAFile, spec.Token.Env, spec.Token.File, spec.User}, spec.Token.Command...) {
		require.NotContains(t, value, "\x00")
	}
}

// written writes a cluster as a profile, every value in double quotes with
// the escapes Go and YAML share. sdash itself never writes a profile; the
// fuzz target does, to read it back.
func written(cluster Cluster) string {
	var b strings.Builder
	field := func(indent, key, value string) {
		if value != "" {
			b.WriteString(indent + key + ": " + strconv.Quote(value) + "\n")
		}
	}
	spec := cluster.Spec
	field("", "apiVersion", cluster.APIVersion)
	field("", "kind", cluster.Kind)
	b.WriteString("metadata:\n")
	field("  ", "name", cluster.Metadata.Name)
	b.WriteString("spec:\n  endpoint:\n")
	field("    ", "url", spec.Endpoint.URL)
	field("    ", "socket", spec.Endpoint.Socket)
	field("    ", "caFile", spec.Endpoint.CAFile)
	if spec.SSH != nil {
		b.WriteString("  ssh:\n")
		field("    ", "host", spec.SSH.Host)
	}
	b.WriteString("  token:\n")
	field("    ", "env", spec.Token.Env)
	field("    ", "file", spec.Token.File)
	if spec.Token.Command != nil {
		b.WriteString("    command:\n")
		for _, argument := range spec.Token.Command {
			b.WriteString("      - " + strconv.Quote(argument) + "\n")
		}
	}
	field("  ", "user", spec.User)
	return b.String()
}
