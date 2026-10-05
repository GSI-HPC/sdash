// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

package cli

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/GSI-HPC/sdash/internal/api"
	"github.com/GSI-HPC/sdash/internal/exitcode"
)

// The three shapes of a profile the records name: a socket behind an sshd
// with a token command, a URL with a CA file and a token from the
// environment, and a plain URL with a token file.
const (
	vestaProfile = `# Vesta, reached through its login node.
apiVersion: sdash/v1alpha1
kind: Cluster
metadata:
  name: vesta
spec:
  endpoint:
    socket: /run/slurmrestd/slurmrestd.socket
  ssh:
    host: login.example.org
  token:
    command: [ssh, login.example.org, scontrol, token, lifespan=3600]
  user: alice
`
	lustreProfile = `apiVersion: sdash/v1alpha1
kind: Cluster
metadata:
  name: lustre
spec:
  endpoint:
    url: https://slurm.example.org:6820/slurm
    caFile: /etc/pki/example-org-ca.pem
  token:
    env: SDASH_LUSTRE_TOKEN
`
	devProfile = `apiVersion: sdash/v1alpha1
kind: Cluster
metadata:
  name: dev
spec:
  endpoint:
    url: http://127.0.0.1:6820
  token:
    file: /home/alice/.config/sdash/dev.token
`
)

// profiles writes files into a new configuration directory and returns it.
func profiles(t *testing.T, files map[string]string) string {
	t.Helper()
	dir := t.TempDir()
	for name, content := range files {
		require.NoError(t, os.WriteFile(filepath.Join(dir, name), []byte(content), 0o600))
	}
	return dir
}

// check runs "sdash config check" with args in the environment env and
// returns what it printed and its exit code.
func check(t *testing.T, env map[string]string, args ...string) (stdout, stderr string, code int) {
	t.Helper()
	out, errs := &output{}, &output{}
	code = run(t.Context(), Process{
		Args:   append([]string{"config", "check"}, args...),
		Stdout: out,
		Stderr: errs,
		Getenv: func(name string) string { return env[name] },
	}, serve)
	return out.String(), errs.String(), code
}

// What the check prints is what a user compares with what they meant to
// configure: for each cluster its name, where its slurmrestd is, how it is
// reached, where the token comes from, and the file and line it stands in.
func TestConfigCheckPrintsALineForEachClusterAndExitsZero(t *testing.T) {
	t.Parallel()

	dir := profiles(t, map[string]string{"vesta.yaml": vestaProfile, "others.yaml": lustreProfile + "---\n" + devProfile})

	stdout, stderr, code := check(t, nil, "--config", dir)

	assert.Equal(t, exitcode.OK, code)
	assert.Empty(t, stderr)
	lines := strings.Split(strings.TrimSuffix(stdout, "\n"), "\n")
	require.Len(t, lines, 5)
	assert.Equal(t, "3 clusters in "+dir+" (from --config)", lines[0])
	// The columns are aligned with spaces, whose number is not the point.
	assert.Equal(t, []string{"NAME", "ENDPOINT", "ROUTE", "TOKEN", "FILE"}, strings.Fields(lines[1]))
	assert.Equal(t, []string{"dev", "http://127.0.0.1:6820", "direct", "file", "/home/alice/.config/sdash/dev.token", "others.yaml:15"},
		strings.Fields(lines[2]))
	assert.Equal(t, []string{"lustre", "https://slurm.example.org:6820/slurm", "direct", "env", "SDASH_LUSTRE_TOKEN", "others.yaml:4"},
		strings.Fields(lines[3]))
	assert.Equal(t, []string{"vesta", "unix:/run/slurmrestd/slurmrestd.socket", "ssh", "login.example.org", "command", "ssh", "vesta.yaml:5"},
		strings.Fields(lines[4]))
}

// The output of a check ends up in terminals, in bug reports and in chat
// windows. It says where a token comes from and holds nothing that is one:
// not the value of the variable, not the content of the file, and of a
// command the program alone, since an argument may be a secret.
func TestConfigCheckNeverPrintsATokenOrWhatATokenSourceHolds(t *testing.T) {
	t.Parallel()

	const (
		inTheFile     = "eyJhbGciOiJIUzI1NiJ9.eyJzdW4iOiJhbGljZSJ9.ZmlsZQ"
		inTheVariable = "eyJhbGciOiJIUzI1NiJ9.eyJzdW4iOiJhbGljZSJ9.ZW52"
		asAnArgument  = "eyJhbGciOiJIUzI1NiJ9.eyJzdW4iOiJhbGljZSJ9.YXJn"
	)
	tokenFile := filepath.Join(t.TempDir(), "vesta.token")
	require.NoError(t, os.WriteFile(tokenFile, []byte(inTheFile), 0o600))
	dir := profiles(t, map[string]string{
		"file.yaml":    strings.Replace(devProfile, "/home/alice/.config/sdash/dev.token", tokenFile, 1),
		"env.yaml":     lustreProfile,
		"command.yaml": strings.Replace(vestaProfile, "[ssh, login.example.org, scontrol, token, lifespan=3600]", "[/usr/bin/printf, '%s', "+asAnArgument+"]", 1),
	})

	stdout, stderr, code := check(t, map[string]string{"SDASH_LUSTRE_TOKEN": inTheVariable}, "--config", dir)

	require.Equal(t, exitcode.OK, code)
	printed := stdout + stderr
	assert.Contains(t, printed, "file "+tokenFile)
	assert.Contains(t, printed, "env SDASH_LUSTRE_TOKEN")
	assert.Contains(t, printed, "command /usr/bin/printf ")
	assert.NotContains(t, printed, inTheFile)
	assert.NotContains(t, printed, inTheVariable)
	assert.NotContains(t, printed, asAnArgument)
	assert.NotContains(t, printed, "%s", "no argument of the command is printed")
}

// What breaks a rule may be a secret in the wrong field: the token where
// the name of its variable belongs, a password in an address, a command line
// with a secret in it written as one item. The check and a server that does
// not start write to standard error, which ends in a terminal, in the
// journal of a service and in a bug report. Both say where the value stands
// and which rule it breaks, and neither repeats it.
func TestNeitherTheCheckNorTheServerRepeatsAValueThatBreaksARule(t *testing.T) {
	t.Parallel()

	const (
		token    = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhbGljZSJ9.c2lnbmF0dXJl"
		password = "hunter2"
	)
	url := func(address string) string {
		return strings.Replace(lustreProfile, "url: https://slurm.example.org:6820/slurm", "url: "+address, 1)
	}
	command := func(written string) string {
		return strings.Replace(vestaProfile, "command: [ssh, login.example.org, scontrol, token, lifespan=3600]", "command: "+written, 1)
	}
	tests := []struct {
		name    string
		profile string
		secret  string
		at      string
	}{
		{
			name:    "a token where the name of its variable belongs",
			profile: strings.Replace(lustreProfile, "env: SDASH_LUSTRE_TOKEN", "env: "+token, 1),
			secret:  token, at: ":10:5: spec.token.env: ",
		},
		{
			name:    "a token where the path of its file belongs",
			profile: strings.Replace(devProfile, "file: /home/alice/.config/sdash/dev.token", "file: "+token, 1),
			secret:  token, at: ":9:5: spec.token.file: ",
		},
		{
			name:    "a token where the socket belongs",
			profile: strings.Replace(vestaProfile, "socket: /run/slurmrestd/slurmrestd.socket", "socket: "+token, 1),
			secret:  token, at: ":8:5: spec.endpoint.socket: ",
		},
		{
			name:    "a token where the CA file belongs",
			profile: strings.Replace(lustreProfile, "caFile: /etc/pki/example-org-ca.pem", "caFile: "+token, 1),
			secret:  token, at: ":8:5: spec.endpoint.caFile: ",
		},
		{
			name:    "a token as the name of the cluster",
			profile: strings.Replace(devProfile, "name: dev", "name: "+token, 1),
			secret:  token, at: ":4:3: metadata.name: ",
		},
		{
			name:    "a password in a url without a host",
			profile: url("https://alice:" + password + "@/slurm"),
			secret:  password, at: ":7:5: spec.endpoint.url: ",
		},
		{
			name:    "a password in a url of another scheme",
			profile: url("ftp://alice:" + password + "@slurm.example.org/"),
			secret:  password, at: ":7:5: spec.endpoint.url: ",
		},
		{
			name:    "a password in a url without a scheme",
			profile: url("alice:" + password + "@slurm.example.org"),
			secret:  password, at: ":7:5: spec.endpoint.url: ",
		},
		{
			name:    "a password in a url that cannot be parsed",
			profile: url("https://alice:" + password + "@slurm.example.org:port/"),
			secret:  password, at: ":7:5: spec.endpoint.url: ",
		},
		{
			name:    "a password where the port belongs",
			profile: url("https://slurm.example.org:" + password),
			secret:  password, at: ":7:5: spec.endpoint.url: ",
		},
		{
			name:    "a token in the query of a url without a scheme",
			profile: url("slurm.example.org/?token=" + token),
			secret:  token, at: ":7:5: spec.endpoint.url: ",
		},
		{
			name:    "a password before the ssh host",
			profile: strings.Replace(vestaProfile, "host: login.example.org", "host: alice:"+password+"@login.example.org", 1),
			secret:  password, at: ":10:5: spec.ssh.host: ",
		},
		{
			name:    "a command line with a secret in it, as the one item of the list",
			profile: command(`['curl -H "X-Secret: ` + password + `" https://idp.example.org/token']`),
			secret:  password, at: ":12:15: spec.token.command[0]: ",
		},
		{
			name:    "a command line without a path in it, as the one item of the list",
			profile: command(`[get-token --password ` + password + `]`),
			secret:  password, at: ":12:15: spec.token.command[0]: ",
		},
		{
			name:    "a command line with a secret in it, as a string",
			profile: command(`'curl -H "X-Secret: ` + password + `" https://idp.example.org/token'`),
			secret:  password, at: ":12:5: spec.token.command: ",
		},
		{
			// No secret, and the same mistake: taken for valid, it would be
			// listed as a command without a program.
			name:    "a blank as the program",
			profile: command(`[" "]`),
			at:      ":12:15: spec.token.command[0]: ",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			dir := profiles(t, map[string]string{"p.yaml": tt.profile})

			stdout, stderr, code := check(t, nil, "--config", dir)

			// Fatal, because a server started on a profile that passes
			// would serve until the test is given up on.
			require.Equal(t, exitcode.Usage, code, stdout)
			assert.Empty(t, stdout)
			assert.True(t, strings.HasPrefix(stderr, "sdash: the cluster profiles are not valid:\n  "+filepath.Join(dir, "p.yaml")+tt.at), stderr)
			assert.Equal(t, 2, strings.Count(stderr, "\n"), "one problem: %s", stderr)
			if tt.secret != "" {
				assert.NotContains(t, stderr, tt.secret)
			}

			served, startup := &output{}, &output{}
			code = run(t.Context(), Process{
				Args:   []string{"--listen", "127.0.0.1:0", "--no-browser", "--config", dir},
				Stdout: served,
				Stderr: startup,
			}, serve)

			assert.Equal(t, exitcode.Usage, code)
			assert.Empty(t, served.String())
			assert.Equal(t, stderr, startup.String(), "the server and the check report the same")
		})
	}
}

// A check reads. The token command of this profile leaves a file behind
// when it is run, and its endpoint and its ssh host are this machine's own,
// where something could well be listening; neither the check nor the start
// of the server runs the one or touches the others
// (doc/adr/0016-e2e-and-fixtures-on-sind.md).
func TestReadingTheProfilesRunsNoTokenCommand(t *testing.T) {
	t.Parallel()

	marker := filepath.Join(t.TempDir(), "the-token-command-ran")
	dir := profiles(t, map[string]string{"vesta.yaml": `apiVersion: sdash/v1alpha1
kind: Cluster
metadata:
  name: vesta
spec:
  endpoint:
    url: http://127.0.0.1:6820
  ssh:
    host: localhost
  token:
    command: [/bin/sh, -c, "echo ran > ` + marker + `"]
`})

	stdout, stderr, code := check(t, nil, "--config", dir)

	require.Equal(t, exitcode.OK, code, stderr)
	assert.Contains(t, stdout, "command /bin/sh ")
	assert.NoFileExists(t, marker, "config check ran the token command")

	sdash := launch(t, newDesktop(t, nil, nil), "--no-browser", "--config", dir)
	status := servedStatus(t, sdash)
	require.Equal(t, exitcode.OK, sdash.stop())

	assert.Equal(t, []api.Cluster{{Name: "vesta"}}, status.Clusters)
	assert.NoFileExists(t, marker, "the server ran the token command")
}

// One run shows everything there is to fix, each problem with the file, the
// line and the column an editor jumps to, and exits 2, the code of a
// configuration error.
func TestConfigCheckPrintsEveryProblemAndExitsTwo(t *testing.T) {
	t.Parallel()

	dir := profiles(t, map[string]string{
		"vesta.yaml":  strings.Replace(vestaProfile, "    host: login.example.org", "    hots: login.example.org", 1),
		"lustre.yaml": strings.Replace(lustreProfile, "url: https://", "url: ", 1),
		"dev.yaml":    devProfile,
		"copy.yaml":   devProfile,
		"site.yaml":   "apiVersion: clusterctl/v1alpha1\nkind: Site\n",
		"broken.yaml": "spec: [\n",
	})

	stdout, stderr, code := check(t, nil, "--config", dir)

	assert.Equal(t, exitcode.Usage, code)
	assert.Empty(t, stdout, "no cluster is listed beside the problems")
	at := func(file string) string { return "  " + filepath.Join(dir, file) }
	assert.Equal(t, "sdash: the cluster profiles are not valid:\n"+
		at("broken.yaml")+": is not YAML: line 1: did not find expected node content\n"+
		at("dev.yaml")+`:4:3: metadata.name: is a name another cluster has, at `+filepath.Join(dir, "copy.yaml")+
		":4:3; remove one of them or give it a name of its own\n"+
		at("lustre.yaml")+`:7:5: spec.endpoint.url: does not begin with http:// or https://`+"\n"+
		at("site.yaml")+`:1:1: apiVersion: is not supported; this sdash reads "sdash/v1alpha1"`+"\n"+
		at("vesta.yaml")+`:10:5: spec.ssh.hots: unknown field "hots"; did you mean "host"?`+"\n",
		stderr)
}

// Having configured nothing is no mistake, and the check says which of the
// ways of having nothing it found.
func TestConfigCheckWithoutProfilesSaysSoAndExitsZero(t *testing.T) {
	t.Parallel()

	empty := t.TempDir()
	missing := filepath.Join(t.TempDir(), "sdash")
	withoutClusters := profiles(t, map[string]string{"later.yaml": "# no cluster yet\n", "notes.txt": "kind: Nothing\n"})
	tests := []struct {
		name string
		args []string
		env  map[string]string
		says string
	}{
		{name: "an empty directory", args: []string{"--config", empty}, says: "no clusters in " + empty + " (from --config)\n"},
		{name: "a directory with no document in it", args: []string{"--config", withoutClusters}, says: "no clusters in " + withoutClusters + " (from --config)\n"},
		{name: "a directory that does not exist", args: []string{"--config", missing}, says: "no clusters: " + missing + " (from --config) does not exist\n"},
		{
			name: "a default directory that does not exist",
			env:  map[string]string{"HOME": filepath.Dir(missing)},
			says: "no clusters: " + filepath.Join(filepath.Dir(missing), ".config", "sdash") + " (from HOME) does not exist\n",
		},
		{name: "nothing that names a directory", says: "no clusters: none of --config, SDASH_CONFIG, XDG_CONFIG_HOME and HOME names a configuration directory\n"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			stdout, stderr, code := check(t, tt.env, tt.args...)

			assert.Equal(t, exitcode.OK, code)
			assert.Equal(t, tt.says, stdout)
			assert.Empty(t, stderr)
		})
	}
}

// The directory is the flag's, else the one SDASH_CONFIG names, else the
// XDG one, else ~/.config/sdash; the check says which it read and why.
func TestTheProfilesAreReadFromTheDirectoryTheFlagOrTheEnvironmentNames(t *testing.T) {
	t.Parallel()

	byFlag := profiles(t, map[string]string{"c.yaml": strings.Replace(devProfile, "name: dev", "name: by-flag", 1)})
	byVariable := profiles(t, map[string]string{"c.yaml": strings.Replace(devProfile, "name: dev", "name: by-variable", 1)})
	xdg, home := t.TempDir(), t.TempDir()
	for dir, name := range map[string]string{filepath.Join(xdg, "sdash"): "by-xdg", filepath.Join(home, ".config", "sdash"): "by-home"} {
		require.NoError(t, os.MkdirAll(dir, 0o700))
		require.NoError(t, os.WriteFile(filepath.Join(dir, "c.yaml"), []byte(strings.Replace(devProfile, "name: dev", "name: "+name, 1)), 0o600))
	}
	everything := map[string]string{"SDASH_CONFIG": byVariable, "XDG_CONFIG_HOME": xdg, "HOME": home}
	tests := []struct {
		name    string
		args    []string
		env     map[string]string
		cluster string
		from    string
	}{
		{name: "the flag, over everything else", args: []string{"--config", byFlag}, env: everything, cluster: "by-flag", from: "--config"},
		{name: "SDASH_CONFIG, over the XDG rule", env: everything, cluster: "by-variable", from: "SDASH_CONFIG"},
		{name: "XDG_CONFIG_HOME, over the home directory", env: map[string]string{"XDG_CONFIG_HOME": xdg, "HOME": home}, cluster: "by-xdg", from: "XDG_CONFIG_HOME"},
		{name: "the home directory", env: map[string]string{"HOME": home}, cluster: "by-home", from: "HOME"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			stdout, stderr, code := check(t, tt.env, tt.args...)

			require.Equal(t, exitcode.OK, code, stderr)
			first, rest, _ := strings.Cut(stdout, "\n")
			assert.True(t, strings.HasPrefix(first, "1 cluster in "), first)
			assert.True(t, strings.HasSuffix(first, " (from "+tt.from+")"), first)
			assert.Contains(t, rest, "\n"+tt.cluster+" ")
		})
	}

	// --config is a flag of every command, so it may stand before the
	// command as well as after it.
	t.Run("the flag before the command", func(t *testing.T) {
		t.Parallel()

		stdout, stderr := &output{}, &output{}

		code := run(t.Context(), Process{Args: []string{"--config", byFlag, "config", "check"}, Stdout: stdout, Stderr: stderr}, serve)

		require.Equal(t, exitcode.OK, code, stderr)
		assert.Contains(t, stdout.String(), "\nby-flag ")
	})
}

// What is named as the directory and is none cannot be read as one. That is
// a mistake in the configuration, not a server that failed.
func TestAConfigurationDirectoryThatIsAFileIsAConfigurationError(t *testing.T) {
	t.Parallel()

	file := filepath.Join(profiles(t, map[string]string{"vesta.yaml": vestaProfile}), "vesta.yaml")

	stdout, stderr, code := check(t, nil, "--config", file)

	assert.Equal(t, exitcode.Usage, code)
	assert.Empty(t, stdout)
	assert.Equal(t, "sdash: read the configuration directory: "+file+" is not a directory\n", stderr)
}

// "sdash config" alone is a question about what it can do, and is answered.
func TestConfigWithoutACommandPrintsItsHelp(t *testing.T) {
	t.Parallel()

	stdout, stderr := &output{}, &output{}

	code := run(t.Context(), Process{Args: []string{"config"}, Stdout: stdout, Stderr: stderr}, serve)

	assert.Equal(t, exitcode.OK, code)
	assert.Empty(t, stderr.String())
	assert.Contains(t, stdout.String(), "sdash config [command]")
	assert.Contains(t, stdout.String(), "  check ")
	assert.Contains(t, stdout.String(), "--config string")
}

// A server that started on half a configuration would show some clusters
// and not others, and say nothing about why. It does not start, opens no
// listener, and says what "sdash config check" says, with the same exit
// code.
func TestTheServerDoesNotStartOnAProfileThatIsNotValid(t *testing.T) {
	t.Parallel()

	dir := profiles(t, map[string]string{
		"vesta.yaml":  vestaProfile,
		"lustre.yaml": strings.Replace(lustreProfile, "env: SDASH_LUSTRE_TOKEN", "env: SDASH-LUSTRE-TOKEN", 1),
	})
	stdout, stderr := &output{}, &output{}

	code := run(t.Context(), Process{
		Args:   []string{"--listen", "127.0.0.1:0", "--no-browser", "--config", dir},
		Stdout: stdout,
		Stderr: stderr,
	}, serve)

	assert.Equal(t, exitcode.Usage, code)
	assert.Empty(t, stdout.String(), "no address is printed")
	assert.Equal(t, "sdash: the cluster profiles are not valid:\n  "+filepath.Join(dir, "lustre.yaml")+
		`:10:5: spec.token.env: is not the name of an environment variable: letters, digits and "_", not beginning with a digit; `+
		"env names the variable and does not hold the token\n",
		stderr.String())

	_, checked, checkCode := check(t, nil, "--config", dir)
	assert.Equal(t, checked, stderr.String(), "the server and the check report the same")
	assert.Equal(t, checkCode, code)
}

// The status is how the interface learns which clusters there are. It lists
// them by name, however the profiles are spread over files, so that the
// order on the screen does not change when a file is renamed.
func TestTheServedStatusListsTheConfiguredClustersByName(t *testing.T) {
	t.Parallel()

	dir := profiles(t, map[string]string{
		"a.yaml": vestaProfile + "---\n" + lustreProfile,
		"z.yaml": devProfile,
	})
	sdash := launch(t, newDesktop(t, nil, nil), "--no-browser", "--config", dir)

	status := servedStatus(t, sdash)

	assert.Equal(t, []api.Cluster{{Name: "dev"}, {Name: "lustre"}, {Name: "vesta"}}, status.Clusters)
	assert.Equal(t, exitcode.OK, sdash.stop())
	assert.Empty(t, sdash.stderr.String())
}

// What the server read is a step of its start, shown with -v. A directory
// the user named and that is not there shows without -v: the name is most
// likely misspelt, and the user would look at an sdash without clusters
// and not know why. That the default directory is not there is the ordinary
// case of a first start, and is no warning.
func TestTheServerSaysWhereItReadTheProfilesFrom(t *testing.T) {
	t.Parallel()

	dir := profiles(t, map[string]string{"vesta.yaml": vestaProfile, "dev.yaml": devProfile})
	missing := filepath.Join(t.TempDir(), "sdahs")
	home := t.TempDir()
	tests := []struct {
		name   string
		args   []string
		env    map[string]string
		says   string
		silent bool
	}{
		{
			name: "the directory and the number of clusters, with -v",
			args: []string{"-v", "--config", dir},
			says: `level=INFO msg="reading cluster profiles" dir=` + dir + ` from=--config clusters=2`,
		},
		{
			name: "a directory that was named and does not exist, without -v",
			args: []string{"--config", missing},
			says: `level=WARN msg="configuration directory does not exist" dir=` + missing + ` from=--config`,
		},
		{
			name: "a directory SDASH_CONFIG names and that does not exist, without -v",
			env:  map[string]string{"SDASH_CONFIG": missing, "HOME": home},
			says: `level=WARN msg="configuration directory does not exist" dir=` + missing + ` from=SDASH_CONFIG`,
		},
		{
			name: "a default directory that does not exist, with -v",
			args: []string{"-v"},
			env:  map[string]string{"HOME": home},
			says: `level=INFO msg="configuration directory does not exist" dir=` + filepath.Join(home, ".config", "sdash") + ` from=HOME`,
		},
		{
			name:   "a default directory that does not exist, without -v",
			env:    map[string]string{"HOME": home},
			silent: true,
		},
		{
			name: "no directory at all, with -v",
			args: []string{"-v"},
			says: `level=INFO msg="no configuration directory"`,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			sdash := launchIn(t, newDesktop(t, nil, nil), tt.env, append([]string{"--no-browser"}, tt.args...)...)

			require.Equal(t, exitcode.OK, sdash.stop())
			if tt.silent {
				assert.Empty(t, sdash.stderr.String())
				return
			}
			assert.Contains(t, sdash.stderr.String(), tt.says)
		})
	}
}
