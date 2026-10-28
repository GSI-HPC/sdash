// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

package profile

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// env is an environment of the variables given.
func env(vars map[string]string) func(string) string {
	return func(name string) string { return vars[name] }
}

var home = env(map[string]string{"HOME": "/home/alice"})

func TestAProfileNamesEachClusterWithItsEndpointAndToken(t *testing.T) {
	t.Parallel()
	p, err := parse(`
[[cluster]]
name     = "virgo"
endpoint = "https://slurmrestd.example.org:6820"
ca_file  = "site-ca.pem"
token    = { command = ["ssh", "virgo", "scontrol", "token"] }

[[cluster]]
name     = "test.cluster-2"
endpoint = "http://127.0.0.1:6820"
token    = { file = "~/virgo.jwt" }

[[cluster]]
name     = "lyra"
endpoint = "http://lyra:6820"
token.env = "SLURM_JWT"
`, "/etc/sdash", home)
	require.NoError(t, err)
	assert.Equal(t, []Cluster{
		{
			Name:     "virgo",
			Endpoint: "https://slurmrestd.example.org:6820",
			CAFile:   "/etc/sdash/site-ca.pem",
			Token:    Token{Command: []string{"ssh", "virgo", "scontrol", "token"}},
		},
		{Name: "test.cluster-2", Endpoint: "http://127.0.0.1:6820", Token: Token{File: "/home/alice/virgo.jwt"}},
		{Name: "lyra", Endpoint: "http://lyra:6820", Token: Token{Env: "SLURM_JWT"}},
	}, p.Clusters)
}

func TestAProfileWithoutClustersIsEmpty(t *testing.T) {
	t.Parallel()
	p, err := parse("# nothing yet\n", "/etc/sdash", home)
	require.NoError(t, err)
	assert.Empty(t, p.Clusters)
}

func TestAProfileIsRefusedWithWhatIsWrongInIt(t *testing.T) {
	t.Parallel()
	const ok = `endpoint = "http://a:6820"` + "\n" + `token = { env = "T" }` + "\n"
	for name, tc := range map[string]struct{ text, says string }{
		"not TOML":      {`[[cluster]` + "\n", "expected"},
		"unknown key":   {"[[cluster]]\nname = \"a\"\n" + ok + "endpiont = \"x\"\n", "unknown keys: cluster.endpiont"},
		"unknown table": {"[clusters]\nname = \"a\"\n", "unknown keys"},
		"no name":       {"[[cluster]]\n" + ok, "cluster 1: no name"},
		"bad name":      {"[[cluster]]\nname = \"a/b\"\n" + ok, `cluster "a/b": a name is`},
		"name taken":    {"[[cluster]]\nname = \"a\"\n" + ok + "[[cluster]]\nname = \"a\"\n" + ok, "taken"},
		"no endpoint":   {"[[cluster]]\nname = \"a\"\ntoken = { env = \"T\" }\n", "no endpoint"},
		"no token": {
			"[[cluster]]\nname = \"a\"\nendpoint = \"http://a\"\n", "exactly one of command, file and env",
		},
		"two tokens": {
			"[[cluster]]\nname = \"a\"\nendpoint = \"http://a\"\ntoken = { env = \"T\", file = \"f\" }\n",
			"exactly one",
		},
		"empty command": {
			"[[cluster]]\nname = \"a\"\nendpoint = \"http://a\"\ntoken = { command = [\"\"] }\n", "names no program",
		},
		"another home": {
			"[[cluster]]\nname = \"a\"\nendpoint = \"http://a\"\ntoken = { file = \"~bob/t\" }\n", "only ~/ is expanded",
		},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			_, err := parse(tc.text, "/etc/sdash", home)
			require.Error(t, err)
			assert.Contains(t, err.Error(), tc.says)
		})
	}
}

func TestTheDefaultFileThatIsMissingIsAProfileWithoutClusters(t *testing.T) {
	t.Parallel()
	path := filepath.Join(t.TempDir(), "clusters.toml")
	p, err := Load(path, true, home)
	require.NoError(t, err)
	assert.Empty(t, p.Clusters)

	_, err = Load(path, false, home)
	assert.ErrorContains(t, err, "read the profile file", "a file the user named has to be there")
}

func TestLoadReadsPathsAgainstTheDirectoryOfTheFile(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	path := filepath.Join(dir, "clusters.toml")
	require.NoError(t, os.WriteFile(path, []byte(`
[[cluster]]
name = "a"
endpoint = "http://a:6820"
token = { file = "a.jwt" }
`), 0o600))
	p, err := Load(path, false, home)
	require.NoError(t, err)
	assert.Equal(t, path, p.Path)
	assert.Equal(t, filepath.Join(dir, "a.jwt"), p.Clusters[0].Token.File)
}

func TestTheDefaultPathFollowsTheXDGBaseDirectories(t *testing.T) {
	t.Parallel()
	path, err := DefaultPath(env(map[string]string{"XDG_CONFIG_HOME": "/cfg", "HOME": "/home/alice"}))
	require.NoError(t, err)
	assert.Equal(t, "/cfg/sdash/clusters.toml", path)

	path, err = DefaultPath(env(map[string]string{"XDG_CONFIG_HOME": "relative", "HOME": "/home/alice"}))
	require.NoError(t, err)
	assert.Equal(t, "/home/alice/.config/sdash/clusters.toml", path, "a relative XDG_CONFIG_HOME counts as unset")

	_, err = DefaultPath(env(nil))
	assert.Error(t, err)
}

func TestATokenInAVariableIsReadFromTheEnvironment(t *testing.T) {
	t.Parallel()
	src := Token{Env: "T"}.Source(env(map[string]string{"T": "a.b.c"}))
	tok, err := src.Token(t.Context())
	require.NoError(t, err)
	assert.Equal(t, "a.b.c", tok.Secret())

	_, err = Token{Env: "UNSET"}.Source(env(nil)).Token(t.Context())
	assert.Error(t, err, "an unset variable is no token")
}
