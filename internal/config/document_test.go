// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

package config

import (
	"reflect"
	"slices"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/GSI-HPC/sdash/internal/apis/v1alpha1"
)

// profile writes a cluster profile named vesta whose spec holds the given
// lines. The name is in line 4, and the first line of the spec is line 6; a
// key directly under spec is in column 3, and one a level down in column 5.
func profile(spec ...string) string {
	return "apiVersion: sdash/v1alpha1\nkind: Cluster\nmetadata:\n  name: vesta\nspec:\n  " +
		strings.Join(spec, "\n  ") + "\n"
}

// viaURL and byEnv are a valid endpoint and a valid token source, for the
// cases that are about something else.
const (
	viaURL = "endpoint: {url: 'https://slurm.example.org'}"
	byEnv  = "token: {env: SDASH_TOKEN}"
)

// The words of the rules that several cases break.
const (
	notAURL      = `is not a URL; write http:// or https://, then the host, and a port and a base path where the endpoint has them`
	hasUserInfo  = `holds a user name or a password; a profile holds no credential, and the token comes from spec.token`
	notAVariable = `is not the name of an environment variable: letters, digits and "_", not beginning with a digit; env names the variable and does not hold the token`
	notSplit     = `holds white space; sdash does not split a string into words, so write the program and each of its arguments as an item of its own`
	relative     = `is a relative path; the program is a name to look up in PATH or an absolute path, and "~" is not expanded`
)

// Two secrets, as they end up in the wrong field of a profile: a JWT, which
// is letters, digits, "-" and "_" in three parts joined by dots, and a token
// in base64, which has "/", "+" and "=" as well. No problem may repeat
// either.
const (
	aJWT         = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhbGljZSJ9.c2lnbmF0dXJl"
	anOpaqueOne  = "c2VjcmV0/dG9rZW4+c2VjcmV0=="
	aPassword    = "hunter2"
	withPassword = "alice:" + aPassword + "@"
)

// problemsOf reads src as the file f.yaml and returns what is wrong with
// it, one rendered problem to a string.
func problemsOf(src string) []string {
	_, problems := parse("f.yaml", []byte(src))
	rendered := make([]string, len(problems))
	for i, problem := range problems {
		rendered[i] = problem.String()
	}
	return rendered
}

// clustersOf reads src, which has to be valid, and returns its profiles.
func clustersOf(t *testing.T, src string) []Cluster {
	t.Helper()
	clusters, problems := parse("f.yaml", []byte(src))
	require.Empty(t, problems)
	return clusters
}

// wrong is a file with something wrong in it, and the problems it is
// reported with. The tables of such files are functions and not part of
// their tests, because the test that holds the manual to the messages
// (manual_test.go) goes through them all.
type wrong struct {
	name string
	src  string
	want []string
}

// brokenRules returns each rule a profile has to keep, broken once.
func brokenRules() []wrong {
	return []wrong{
		// The endpoint: exactly one of url and socket.
		{
			name: "no endpoint",
			src:  profile(byEnv),
			want: []string{`f.yaml:5:1: spec.endpoint: is missing; it names the slurmrestd by "url" or "socket"`},
		},
		{
			name: "an endpoint with neither a url nor a socket",
			src:  profile("endpoint: {}", byEnv),
			want: []string{`f.yaml:6:3: spec.endpoint: sets none of "url" and "socket"; it takes exactly one of them`},
		},
		{
			name: "an endpoint with a url and a socket",
			src:  profile("endpoint:", "  url: https://slurm.example.org", "  socket: /run/slurmrestd.socket", byEnv),
			want: []string{`f.yaml:6:3: spec.endpoint: sets "url" and "socket"; it takes exactly one of them`},
		},
		{
			// The key counts, not its value: this endpoint has a url, which
			// lacks its value, and that is the one thing to report.
			name: "a url without a value",
			src:  profile("endpoint:", "  url:", byEnv),
			want: []string{`f.yaml:7:5: spec.endpoint.url: has no value; give it one or remove it`},
		},

		// The URL: http or https, a host, and at most a base path.
		{
			name: "a url of another scheme",
			src:  profile("endpoint:", "  url: ftp://slurm.example.org", byEnv),
			want: []string{`f.yaml:7:5: spec.endpoint.url: does not begin with http:// or https://`},
		},
		{
			name: "a url without a scheme",
			src:  profile("endpoint:", "  url: slurm.example.org/slurm", byEnv),
			want: []string{`f.yaml:7:5: spec.endpoint.url: does not begin with http:// or https://`},
		},
		{
			name: "a host and a port without a scheme",
			src:  profile("endpoint:", "  url: localhost:6820", byEnv),
			want: []string{`f.yaml:7:5: spec.endpoint.url: does not begin with http:// or https://`},
		},
		{
			name: "a url that is not one",
			src:  profile("endpoint:", "  url: 'https://[::1'", byEnv),
			want: []string{`f.yaml:7:5: spec.endpoint.url: ` + notAURL},
		},
		{
			name: "a url without a host",
			src:  profile("endpoint:", "  url: https:///slurm", byEnv),
			want: []string{`f.yaml:7:5: spec.endpoint.url: names no host`},
		},
		{
			name: "a url with a port and no host",
			src:  profile("endpoint:", "  url: 'http://:6820'", byEnv),
			want: []string{`f.yaml:7:5: spec.endpoint.url: names no host`},
		},
		{
			name: "a url with a port that is none",
			src:  profile("endpoint:", "  url: http://slurm.example.org:99999", byEnv),
			want: []string{`f.yaml:7:5: spec.endpoint.url: the port is not between 1 and 65535`},
		},
		{
			// A password here would be a credential in the profile, which
			// record 0007 rules out.
			name: "a url with a password",
			src:  profile("endpoint:", "  url: https://"+withPassword+"slurm.example.org", byEnv),
			want: []string{`f.yaml:7:5: spec.endpoint.url: ` + hasUserInfo},
		},
		{
			// The password is the first thing to take out, so it is what
			// is said of an address that has more wrong with it.
			name: "a url with a password and no host",
			src:  profile("endpoint:", "  url: https://"+withPassword+"/slurm", byEnv),
			want: []string{`f.yaml:7:5: spec.endpoint.url: ` + hasUserInfo},
		},
		{
			name: "a url with a password and another scheme",
			src:  profile("endpoint:", "  url: ftp://"+withPassword+"slurm.example.org/", byEnv),
			want: []string{`f.yaml:7:5: spec.endpoint.url: ` + hasUserInfo},
		},
		{
			// Without its scheme the address reads as the scheme "alice",
			// and nothing in it is known to be a password. So no message
			// repeats an address, whatever is wrong with it.
			name: "a password in a url without a scheme",
			src:  profile("endpoint:", "  url: "+withPassword+"slurm.example.org", byEnv),
			want: []string{`f.yaml:7:5: spec.endpoint.url: does not begin with http:// or https://`},
		},
		{
			name: "a password in a url that is not one",
			src:  profile("endpoint:", "  url: https://"+withPassword+"slurm.example.org:port/", byEnv),
			want: []string{`f.yaml:7:5: spec.endpoint.url: ` + notAURL},
		},
		{
			// The library would say: invalid port ":hunter2" after host.
			name: "a password where the port belongs",
			src:  profile("endpoint:", "  url: https://slurm.example.org:"+aPassword, byEnv),
			want: []string{`f.yaml:7:5: spec.endpoint.url: ` + notAURL},
		},
		{
			name: "a token in the query of a url without a scheme",
			src:  profile("endpoint:", "  url: slurm.example.org/?token="+aJWT, byEnv),
			want: []string{`f.yaml:7:5: spec.endpoint.url: does not begin with http:// or https://`},
		},
		{
			name: "a url with a query",
			src:  profile("endpoint:", "  url: https://slurm.example.org/slurm?x=1", byEnv),
			want: []string{`f.yaml:7:5: spec.endpoint.url: holds a query or a fragment; after the host an endpoint has a base path and nothing else`},
		},
		{
			name: "a url with a fragment",
			src:  profile("endpoint:", "  url: 'https://slurm.example.org/#jobs'", byEnv),
			want: []string{`f.yaml:7:5: spec.endpoint.url: holds a query or a fragment; after the host an endpoint has a base path and nothing else`},
		},

		// The socket and the CA file.
		{
			name: "a socket at a relative path",
			src:  profile("endpoint:", "  socket: run/slurmrestd.socket", byEnv),
			want: []string{`f.yaml:7:5: spec.endpoint.socket: is not an absolute path; a relative path and "~" are not expanded`},
		},
		{
			name: "a CA file at a relative path",
			src:  profile("endpoint:", "  url: https://slurm.example.org", "  caFile: ca.pem", byEnv),
			want: []string{`f.yaml:8:5: spec.endpoint.caFile: is not an absolute path; a relative path and "~" are not expanded`},
		},
		{
			name: "a CA file for a url without TLS",
			src:  profile("endpoint:", "  url: http://slurm.example.org", "  caFile: /etc/pki/ca.pem", byEnv),
			want: []string{`f.yaml:8:5: spec.endpoint.caFile: only an https url is verified against a CA file`},
		},
		{
			// The url has a problem of its own, and whether it would have
			// been https is not guessed.
			name: "a CA file for a url that is none",
			src:  profile("endpoint:", "  url: slurm.example.org:6820", "  caFile: /etc/pki/ca.pem", byEnv),
			want: []string{`f.yaml:7:5: spec.endpoint.url: does not begin with http:// or https://`},
		},
		{
			name: "a CA file for a socket",
			src:  profile("endpoint:", "  socket: /run/slurmrestd.socket", "  caFile: /etc/pki/ca.pem", byEnv),
			want: []string{`f.yaml:8:5: spec.endpoint.caFile: only an https url is verified against a CA file`},
		},

		// The route through SSH.
		{
			name: "ssh without a host",
			src:  profile(viaURL, "ssh: {}", byEnv),
			want: []string{`f.yaml:7:3: spec.ssh.host: is missing; it names the host the endpoint is reached through`},
		},
		{
			name: "ssh written as the host itself",
			src:  profile(viaURL, "ssh: login.example.org", byEnv),
			want: []string{`f.yaml:7:3: spec.ssh: must be a mapping, not a string`},
		},
		{
			// The host becomes an argument of ssh, and ssh would read this
			// one as an option that runs a command.
			name: "a host that ssh would read as an option",
			src:  profile(viaURL, "ssh:", "  host: -oProxyCommand=touch /tmp/owned", byEnv),
			want: []string{`f.yaml:8:5: spec.ssh.host: is not a host as sdash hands one to ssh: letters, digits, ".", "_", ":" and "-", not beginning with "-"; a user, a port or a jump host belongs in your ssh configuration`},
		},
		{
			// Every character of it may stand in a host name, and still ssh
			// would read it as its option to jump through another host.
			name: "a host that is an option of ssh by its first character alone",
			src:  profile(viaURL, "ssh:", "  host: -Jjump.example.org", byEnv),
			want: []string{`f.yaml:8:5: spec.ssh.host: is not a host as sdash hands one to ssh: letters, digits, ".", "_", ":" and "-", not beginning with "-"; a user, a port or a jump host belongs in your ssh configuration`},
		},
		{
			name: "a user that is an option by its first character alone",
			src:  profile(viaURL, byEnv, "user: -alice"),
			want: []string{`f.yaml:8:3: spec.user: is not a user name: letters, digits, ".", "_" and "-", not beginning with "-"`},
		},
		{
			name: "a host with a user",
			src:  profile(viaURL, "ssh:", "  host: alice@login.example.org", byEnv),
			want: []string{`f.yaml:8:5: spec.ssh.host: is not a host as sdash hands one to ssh: letters, digits, ".", "_", ":" and "-", not beginning with "-"; a user, a port or a jump host belongs in your ssh configuration`},
		},

		// The token: exactly one of command, env and file.
		{
			name: "no token source",
			src:  profile(viaURL),
			want: []string{`f.yaml:5:1: spec.token: is missing; it names where the token comes from by "command", "env" or "file"`},
		},
		{
			name: "a token with no source",
			src:  profile(viaURL, "token: {}"),
			want: []string{`f.yaml:7:3: spec.token: sets none of "command", "env" and "file"; it takes exactly one of them`},
		},
		{
			name: "a token with two sources",
			src:  profile(viaURL, "token:", "  env: SDASH_TOKEN", "  file: /home/alice/token"),
			want: []string{`f.yaml:7:3: spec.token: sets "env" and "file"; it takes exactly one of them`},
		},
		{
			name: "a token with all three sources",
			src:  profile(viaURL, "token:", "  command: [scontrol, token]", "  env: SDASH_TOKEN", "  file: /home/alice/token"),
			want: []string{`f.yaml:7:3: spec.token: sets "command", "env" and "file"; it takes exactly one of them`},
		},
		{
			name: "a command without a program",
			src:  profile(viaURL, "token:", "  command: []"),
			want: []string{`f.yaml:8:5: spec.token.command: is an empty list; it names a program and its arguments`},
		},
		{
			name: "a command whose program is empty",
			src:  profile(viaURL, "token:", "  command: ['', token]"),
			want: []string{`f.yaml:8:15: spec.token.command[0]: is empty; the first item names the program`},
		},
		{
			name: "a command whose program is a blank",
			src:  profile(viaURL, "token:", "  command: [' ']"),
			want: []string{`f.yaml:8:15: spec.token.command[0]: ` + notSplit},
		},
		{
			// The mistake the list exists to rule out, inside a list: the
			// whole line would be looked up as the name of one program.
			name: "a command line written as the one item of a list",
			src:  profile(viaURL, "token:", "  command: [ssh login.example.org scontrol token]"),
			want: []string{`f.yaml:8:15: spec.token.command[0]: ` + notSplit},
		},
		{
			name: "a command line with a secret among its arguments, as one item",
			src:  profile(viaURL, "token:", `  command: ['curl -H "X-Secret: `+aPassword+`" https://idp.example.org/token']`),
			want: []string{`f.yaml:8:15: spec.token.command[0]: ` + notSplit},
		},
		{
			name: "a command line as the first item, before an argument",
			src:  profile(viaURL, "token:", "  command: [ssh login.example.org, scontrol, token]"),
			want: []string{`f.yaml:8:15: spec.token.command[0]: ` + notSplit},
		},
		{
			// The command is what sdash executes. A program at a relative
			// path would be whatever lies in the directory sdash was
			// started in.
			name: "a program at a path relative to the working directory",
			src:  profile(viaURL, "token:", "  command: [./token.sh]"),
			want: []string{`f.yaml:8:15: spec.token.command[0]: ` + relative},
		},
		{
			name: "a program below a directory that has no root",
			src:  profile(viaURL, "token:", "  command: [bin/token, vesta]"),
			want: []string{`f.yaml:8:15: spec.token.command[0]: ` + relative},
		},
		{
			name: "a program below the home directory, as a shell writes it",
			src:  profile(viaURL, "token:", "  command: [~/bin/token]"),
			want: []string{`f.yaml:8:15: spec.token.command[0]: ` + relative},
		},
		{
			// A string would have to be split into words, which is what a
			// shell does, and sdash runs the program itself.
			name: "a command written as a shell would take it",
			src:  profile(viaURL, "token:", "  command: ssh login.example.org scontrol token"),
			want: []string{`f.yaml:8:5: spec.token.command: must be a list of strings, such as [a, b], not a string; sdash does not split a string into words`},
		},
		{
			name: "a command with a list in it",
			src:  profile(viaURL, "token:", "  command:", "    - ssh", "    - [scontrol, token]"),
			want: []string{`f.yaml:10:9: spec.token.command[1]: must be a string, not a list`},
		},
		{
			name: "a command with an item left empty",
			src:  profile(viaURL, "token:", "  command:", "    - ssh", "    -"),
			want: []string{`f.yaml:10:8: spec.token.command[1]: has no value; give it one or remove it`},
		},
		{
			name: "a variable that no shell can set",
			src:  profile(viaURL, "token:", "  env: SDASH-TOKEN"),
			want: []string{`f.yaml:8:5: spec.token.env: ` + notAVariable},
		},
		{
			name: "a variable that begins with a digit",
			src:  profile(viaURL, "token:", "  env: 1TOKEN"),
			want: []string{`f.yaml:8:5: spec.token.env: ` + notAVariable},
		},
		{
			name: "a variable written with its dollar",
			src:  profile(viaURL, "token:", "  env: $SDASH_TOKEN"),
			want: []string{`f.yaml:8:5: spec.token.env: ` + notAVariable},
		},
		{
			// The likeliest slip of a first user, and the one that must
			// not put the token on a terminal or into a journal.
			name: "a token written where the name of its variable belongs",
			src:  profile(viaURL, "token:", "  env: "+aJWT),
			want: []string{`f.yaml:8:5: spec.token.env: ` + notAVariable},
		},
		{
			name: "a token written where the path of its file belongs",
			src:  profile(viaURL, "token:", "  file: "+aJWT),
			want: []string{`f.yaml:8:5: spec.token.file: is not an absolute path; a relative path and "~" are not expanded`},
		},
		{
			name: "a token file below the home directory, as a shell writes it",
			src:  profile(viaURL, "token:", "  file: ~/.config/sdash/token"),
			want: []string{`f.yaml:8:5: spec.token.file: is not an absolute path; a relative path and "~" are not expanded`},
		},

		// The user.
		{
			name: "a user name with a space",
			src:  profile(viaURL, byEnv, "user: alice smith"),
			want: []string{`f.yaml:8:3: spec.user: is not a user name: letters, digits, ".", "_" and "-", not beginning with "-"`},
		},
		{
			name: "a user given and left empty",
			src:  profile(viaURL, byEnv, `user: ""`),
			want: []string{`f.yaml:8:3: spec.user: has no value; give it one or remove it`},
		},

		// What YAML allows and a profile does not.
		{
			name: "a field written twice",
			src:  profile(viaURL, byEnv, "user: alice", "user: bob"),
			want: []string{`f.yaml:9:3: spec.user: is written twice; the first is in line 8`},
		},
		{
			name: "a value taken from an anchor",
			src:  profile("endpoint: {url: &address 'https://slurm.example.org'}", byEnv, "user: *address"),
			want: []string{`f.yaml:8:3: spec.user: is an alias; a profile takes no anchors and aliases, so write the value out`},
		},
		{
			name: "a key that is not a string",
			src:  profile(viaURL, byEnv, "[a, b]: c"),
			want: []string{`f.yaml:8:3: spec: a key must be a plain string, not a list`},
		},
		{
			name: "a value over several lines",
			src:  profile(viaURL, "token:", "  file: |", "    /home/alice/token"),
			want: []string{`f.yaml:8:5: spec.token.file: holds a control character, such as a line break or a tab`},
		},
		{
			name: "a NUL in an argument",
			src:  profile(viaURL, "token:", `  command: [scontrol, "to\0ken"]`),
			want: []string{`f.yaml:8:25: spec.token.command[1]: holds a NUL character`},
		},
		{
			name: "a spec that is a list",
			src:  profile("- endpoint"),
			want: []string{`f.yaml:5:1: spec: must be a mapping, not a list`},
		},

		// Every problem of a document is reported, not the first alone.
		{
			name: "several mistakes in one document",
			src:  profile("endpoint:", "  url: slurm.example.org", "ssh:", "  host: a b", "token:", "  env: 1", "user: -x"),
			want: []string{
				`f.yaml:7:5: spec.endpoint.url: does not begin with http:// or https://`,
				`f.yaml:9:5: spec.ssh.host: is not a host as sdash hands one to ssh: letters, digits, ".", "_", ":" and "-", not beginning with "-"; a user, a port or a jump host belongs in your ssh configuration`,
				`f.yaml:11:5: spec.token.env: ` + notAVariable,
				`f.yaml:12:3: spec.user: is not a user name: letters, digits, ".", "_" and "-", not beginning with "-"`,
			},
		},
	}
}

// missingParts returns documents that lack a whole part.
func missingParts() []wrong {
	return []wrong{
		{
			name: "nothing but the version and the kind",
			src:  "apiVersion: sdash/v1alpha1\nkind: Cluster\n",
			want: []string{
				`f.yaml:1:1: metadata: is missing; it names the cluster`,
				`f.yaml:1:1: spec: is missing; it names the endpoint and the source of the token`,
			},
		},
		{
			name: "metadata without a name",
			src:  "apiVersion: sdash/v1alpha1\nkind: Cluster\nmetadata: {}\nspec:\n  " + viaURL + "\n  " + byEnv + "\n",
			want: []string{`f.yaml:3:1: metadata.name: is missing; it is the name sdash lists the cluster under`},
		},
		{
			name: "a spec with nothing in it",
			src:  "apiVersion: sdash/v1alpha1\nkind: Cluster\nmetadata: {name: vesta}\nspec: {}\n",
			want: []string{
				`f.yaml:4:1: spec.endpoint: is missing; it names the slurmrestd by "url" or "socket"`,
				`f.yaml:4:1: spec.token: is missing; it names where the token comes from by "command", "env" or "file"`,
			},
		},
		{
			name: "a spec without a value",
			src:  "apiVersion: sdash/v1alpha1\nkind: Cluster\nmetadata: {name: vesta}\nspec:\n",
			want: []string{`f.yaml:4:1: spec: must be a mapping, not an empty value`},
		},
		{
			name: "metadata that is a string",
			src:  "apiVersion: sdash/v1alpha1\nkind: Cluster\nmetadata: vesta\nspec:\n  " + viaURL + "\n  " + byEnv + "\n",
			want: []string{`f.yaml:3:1: metadata: must be a mapping, not a string`},
		},
	}
}

// unknownFields returns profiles with a key that no field has.
func unknownFields() []wrong {
	return []wrong{
		{
			// One slip, one problem: the endpoint is not also told that
			// it has no url, and the CA file not that it has no https url
			// to go with.
			name: "a letter doubled",
			src:  profile("endpoint:", "  urll: https://slurm.example.org", "  caFile: /etc/pki/ca.pem", byEnv),
			want: []string{`f.yaml:7:5: spec.endpoint.urll: unknown field "urll"; did you mean "url"?`},
		},
		{
			name: "two letters swapped",
			src:  profile(viaURL, "ssh:", "  hots: login.example.org", byEnv),
			want: []string{`f.yaml:8:5: spec.ssh.hots: unknown field "hots"; did you mean "host"?`},
		},
		{
			name: "a letter wrong",
			src:  profile(viaURL, "token:", "  emv: SDASH_TOKEN"),
			want: []string{`f.yaml:8:5: spec.token.emv: unknown field "emv"; did you mean "env"?`},
		},
		{
			name: "another case",
			src:  profile("endpoint:", "  url: https://slurm.example.org", "  cafile: /etc/pki/ca.pem", byEnv),
			want: []string{`f.yaml:8:5: spec.endpoint.cafile: unknown field "cafile"; did you mean "caFile"?`},
		},
		{
			name: "a letter dropped",
			src:  profile(viaURL, "tokn: {env: SDASH_TOKEN}", byEnv),
			want: []string{`f.yaml:7:3: spec.tokn: unknown field "tokn"; did you mean "token"?`},
		},
		{
			name: "a field of another place",
			src:  profile(viaURL, byEnv, "url: https://slurm.example.org"),
			want: []string{`f.yaml:8:3: spec.url: unknown field "url"; the fields here are "endpoint", "ssh", "token" and "user"`},
		},
		{
			name: "a word that is close to nothing",
			src:  profile(viaURL, "token:", "  env: SDASH_TOKEN", "  lifespan: 3600"),
			want: []string{`f.yaml:9:5: spec.token.lifespan: unknown field "lifespan"; the fields here are "command", "env" and "file"`},
		},
		{
			// Two letters of four are shared, which is no slip of the
			// hand: nobody who wrote port meant host.
			name: "a word of the same length, where there is one field",
			src:  profile(viaURL, "ssh:", "  host: login", "  port: 22", byEnv),
			want: []string{`f.yaml:9:5: spec.ssh.port: unknown field "port"; the one field here is "host"`},
		},
		{
			// The two keys every document has are looked for before any
			// other, and are told apart from a key that is not there.
			name: "the key of the version in another case",
			src:  strings.Replace(profile(viaURL, byEnv), "apiVersion:", "apiversion:", 1),
			want: []string{`f.yaml:1:1: apiversion: unknown field "apiversion"; did you mean "apiVersion"?`},
		},
		{
			name: "the key of the kind with a capital",
			src:  strings.Replace(profile(viaURL, byEnv), "kind:", "Kind:", 1),
			want: []string{`f.yaml:2:1: Kind: unknown field "Kind"; did you mean "kind"?`},
		},
		{
			name: "both of them as another program writes them",
			src:  strings.NewReplacer("apiVersion:", "api_version:", "kind:", "kinds:").Replace(profile(viaURL, byEnv)),
			want: []string{
				`f.yaml:1:1: api_version: unknown field "api_version"; did you mean "apiVersion"?`,
				`f.yaml:2:1: kinds: unknown field "kinds"; did you mean "kind"?`,
			},
		},
		{
			// What the misspelt key holds is not judged: the document is
			// reported for the key, and for its version once that is read.
			name: "a misspelt key of the version in a document of another program",
			src:  "apiversion: clusterctl/v1alpha1\nkind: Site\n",
			want: []string{
				`f.yaml:1:1: apiversion: unknown field "apiversion"; did you mean "apiVersion"?`,
				`f.yaml:2:1: kind: is not a kind this sdash reads; expected "Cluster"`,
			},
		},
		{
			name: "a merge key",
			src:  profile(viaURL, byEnv, "<<: {user: alice}"),
			want: []string{`f.yaml:8:3: spec.<<: unknown field "<<"; the fields here are "endpoint", "ssh", "token" and "user"`},
		},
	}
}

// otherDocuments returns documents that are not a Cluster of this version.
func otherDocuments() []wrong {
	return []wrong{
		{
			name: "a document of clusterctl",
			src:  "apiVersion: clusterctl/v1alpha1\nkind: Site\nspec:\n  domains: {hpc: hpc.example.org}\n",
			want: []string{`f.yaml:1:1: apiVersion: is not supported; this sdash reads "sdash/v1alpha1"`},
		},
		{
			name: "a later version of sdash",
			src:  "kind: Cluster\napiVersion: sdash/v1\nmetadata: {name: vesta}\n",
			want: []string{`f.yaml:2:1: apiVersion: is not supported; this sdash reads "sdash/v1alpha1"`},
		},
		{
			name: "no version",
			src:  "# a profile\nkind: Cluster\nmetadata: {name: vesta}\n",
			want: []string{`f.yaml:2:1: apiVersion: is missing; this sdash reads "sdash/v1alpha1"`},
		},
		{
			name: "another kind of this version",
			src:  "apiVersion: sdash/v1alpha1\nkind: Site\nspec:\n  domains: {hpc: hpc.example.org}\n",
			want: []string{`f.yaml:2:1: kind: is not a kind this sdash reads; expected "Cluster"`},
		},
		{
			name: "no kind",
			src:  "apiVersion: sdash/v1alpha1\nmetadata: {name: vesta}\n",
			want: []string{`f.yaml:1:1: kind: is missing; expected "Cluster"`},
		},
		{
			name: "a kind that is a list",
			src:  "apiVersion: sdash/v1alpha1\nkind: [Cluster]\n",
			want: []string{`f.yaml:2:1: kind: must be a string, not a list`},
		},
		{
			name: "a list of profiles in place of documents",
			src:  "- apiVersion: sdash/v1alpha1\n  kind: Cluster\n",
			want: []string{`f.yaml:1:1: a profile is a mapping with apiVersion, kind, metadata and spec, not a list`},
		},
		{
			name: "plain text",
			src:  "the profile of vesta\n",
			want: []string{`f.yaml:1:1: a profile is a mapping with apiVersion, kind, metadata and spec, not a string`},
		},
	}
}

// notYAML returns files that are not YAML.
func notYAML() []wrong {
	return []wrong{
		{
			name: "a list that is not closed",
			src:  "apiVersion: sdash/v1alpha1\nkind: Cluster\nspec:\n  token: {command: [ssh, login\n  user: alice\n",
			want: []string{"f.yaml: is not YAML: line 3: did not find expected ',' or ']'"},
		},
		{
			name: "a tab for indentation",
			src:  "apiVersion: sdash/v1alpha1\nkind: Cluster\nmetadata:\n\tname: vesta\n",
			want: []string{"f.yaml: is not YAML: line 4: found character that cannot start any token"},
		},
		{
			name: "a binary file",
			src:  "\x7fELF\x02\x01\x01\x00\x00\x00",
			want: []string{"f.yaml: is not YAML: control characters are not allowed"},
		},
		{
			name: "an anchor that is not defined",
			src:  "apiVersion: sdash/v1alpha1\nkind: *kind\n",
			want: []string{"f.yaml: is not YAML: unknown anchor 'kind' referenced"},
		},
	}
}

// Everything a profile can hold, in the three shapes the records name: a
// URL with its CA file and a token from the environment, a socket behind an
// sshd with a token command, and a plain URL with a token file.
func TestAProfileIsReadIntoEveryFieldOfACluster(t *testing.T) {
	t.Parallel()

	clusters := clustersOf(t, `
apiVersion: sdash/v1alpha1
kind: Cluster
metadata:
  name: lustre
spec:
  endpoint:
    url: https://slurm.example.org:6820/slurm
    caFile: /etc/pki/example-org-ca.pem
  token:
    env: SDASH_LUSTRE_TOKEN
---
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
---
apiVersion: sdash/v1alpha1
kind: Cluster
metadata:
  name: dev
spec:
  endpoint:
    url: http://127.0.0.1:6820
  token:
    file: /home/alice/.config/sdash/dev.token
`)

	require.Len(t, clusters, 3)
	meta := func(name string) v1alpha1.Cluster {
		return v1alpha1.Cluster{APIVersion: "sdash/v1alpha1", Kind: "Cluster", Metadata: v1alpha1.ObjectMeta{Name: name}}
	}

	lustre := meta("lustre")
	lustre.Spec.Endpoint = v1alpha1.Endpoint{URL: "https://slurm.example.org:6820/slurm", CAFile: "/etc/pki/example-org-ca.pem"}
	lustre.Spec.Token = v1alpha1.TokenSource{Env: "SDASH_LUSTRE_TOKEN"}
	assert.Equal(t, lustre, clusters[0].Cluster)
	assert.Equal(t, Position{File: "f.yaml", Line: 5, Column: 3}, clusters[0].Position)

	vesta := meta("vesta")
	vesta.Spec.Endpoint = v1alpha1.Endpoint{Socket: "/run/slurmrestd/slurmrestd.socket"}
	vesta.Spec.SSH = &v1alpha1.SSH{Host: "login.example.org"}
	vesta.Spec.Token = v1alpha1.TokenSource{Command: []string{"ssh", "login.example.org", "scontrol", "token", "lifespan=3600"}}
	vesta.Spec.User = "alice"
	assert.Equal(t, vesta, clusters[1].Cluster)
	assert.Equal(t, Position{File: "f.yaml", Line: 16, Column: 3}, clusters[1].Position)

	dev := meta("dev")
	dev.Spec.Endpoint = v1alpha1.Endpoint{URL: "http://127.0.0.1:6820"}
	dev.Spec.Token = v1alpha1.TokenSource{File: "/home/alice/.config/sdash/dev.token"}
	assert.Equal(t, dev, clusters[2].Cluster)
	assert.Nil(t, clusters[2].Spec.SSH, "a cluster without ssh is reached directly")
}

// The decoder goes by the yaml tags and by four shapes of field. A field
// added to the types without a tag, or of another shape, would be a key the
// reader refuses or a value it cannot read, in every profile that uses it.
func TestEveryFieldOfTheDocumentTypesIsOneTheReaderDecodes(t *testing.T) {
	t.Parallel()

	var visit func(t *testing.T, typ reflect.Type)
	visit = func(t *testing.T, typ reflect.Type) {
		t.Helper()
		keys := map[string]bool{}
		for i := range typ.NumField() {
			field := typ.Field(i)
			key := field.Tag.Get("yaml")
			require.NotEmpty(t, key, "%s.%s names no key", typ.Name(), field.Name)
			require.False(t, keys[key], "%s has the key %q twice", typ.Name(), key)
			require.NotContains(t, key, ".", "a key with a dot would read as a path in a message")
			keys[key] = true

			switch kind := field.Type; kind.Kind() {
			case reflect.String:
			case reflect.Slice:
				assert.Equal(t, reflect.String, kind.Elem().Kind(), "%s.%s is a list of something other than strings", typ.Name(), field.Name)
			case reflect.Struct:
				visit(t, kind)
			case reflect.Pointer:
				require.Equal(t, reflect.Struct, kind.Elem().Kind(), "%s.%s points to something other than a mapping", typ.Name(), field.Name)
				visit(t, kind.Elem())
			default:
				assert.Fail(t, "a shape the reader does not decode", "%s.%s is a %s", typ.Name(), field.Name, kind.Kind())
			}
		}
	}
	visit(t, reflect.TypeFor[v1alpha1.Cluster]())
}

// Each rule a profile has to keep, with the problem it is reported as: the
// place of the field, its path, and a message that says what to write.
func TestEveryRuleIsReportedAtThePlaceOfItsField(t *testing.T) {
	t.Parallel()

	tests := brokenRules()
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			clusters, problems := parse("f.yaml", []byte(tt.src))

			rendered := make([]string, len(problems))
			for i, problem := range problems {
				rendered[i] = problem.String()
			}
			assert.Equal(t, tt.want, rendered)
			assert.Empty(t, clusters, "a profile with a problem is no cluster")
		})
	}
}

// A value that breaks a rule may be a secret in the wrong field: the token
// where the name of its variable belongs is the likeliest slip a first user
// makes. What is reported ends in terminals, journals and bug reports, so a
// problem says where the value stands and which rule it breaks, and does not
// repeat it. Every field that holds a value has a row here, so a field that
// is added to the types gets one.
func TestAProblemNeverRepeatsTheValueThatBrokeTheRule(t *testing.T) {
	t.Parallel()

	valid := profile(viaURL, byEnv)
	tests := []struct {
		field string
		// src is a profile with a secret as the value of the field.
		src func(secret string) string
		// keeps is the secret that keeps the rule of the field, where one
		// does. sdash cannot tell it from a value, and lists it as one.
		keeps string
	}{
		{field: "apiVersion", src: func(s string) string { return strings.Replace(valid, "sdash/v1alpha1", s, 1) }},
		{field: "kind", src: func(s string) string { return strings.Replace(valid, "kind: Cluster", "kind: "+s, 1) }},
		{field: "metadata.name", src: func(s string) string { return strings.Replace(valid, "name: vesta", "name: "+s, 1) }},
		{field: "spec.endpoint.url", src: func(s string) string { return profile("endpoint: {url: '"+s+"'}", byEnv) }},
		{field: "spec.endpoint.socket", src: func(s string) string { return profile("endpoint: {socket: '"+s+"'}", byEnv) }},
		{field: "spec.endpoint.caFile", src: func(s string) string {
			return profile("endpoint: {url: 'https://slurm.example.org', caFile: '"+s+"'}", byEnv)
		}},
		// A JWT is letters, digits, "-", "_" and dots, which is a host as
		// ssh takes one, the name of a program and the name of a user.
		{field: "spec.ssh.host", src: func(s string) string { return profile(viaURL, "ssh: {host: '"+s+"'}", byEnv) }, keeps: aJWT},
		{field: "spec.token.command", src: func(s string) string { return profile(viaURL, "token: {command: ['"+s+"']}") }, keeps: aJWT},
		{field: "spec.token.env", src: func(s string) string { return profile(viaURL, "token: {env: '"+s+"'}") }},
		{field: "spec.token.file", src: func(s string) string { return profile(viaURL, "token: {file: '"+s+"'}") }},
		{field: "spec.user", src: func(s string) string { return profile(viaURL, byEnv, "user: '"+s+"'") }, keeps: aJWT},
	}
	var covered []string
	for _, tt := range tests {
		covered = append(covered, tt.field)
		for name, secret := range map[string]string{"a JWT": aJWT, "a token in base64": anOpaqueOne} {
			t.Run(name+" in "+tt.field, func(t *testing.T) {
				t.Parallel()

				clusters, problems := parse("f.yaml", []byte(tt.src(secret)))

				if secret == tt.keeps {
					assert.Empty(t, problems)
					assert.Len(t, clusters, 1)
					return
				}
				require.NotEmpty(t, problems, "the value breaks no rule, so this row checks nothing")
				assert.Empty(t, clusters)
				for _, problem := range problems {
					assert.NotContains(t, problem.String(), secret)
				}
			})
		}
	}

	all := fields(reflect.TypeFor[v1alpha1.Cluster](), "")
	holdsAValue := func(path string) bool {
		return !slices.ContainsFunc(all, func(other string) bool { return strings.HasPrefix(other, path+".") })
	}
	assert.ElementsMatch(t, slices.DeleteFunc(slices.Clone(all), func(path string) bool { return !holdsAValue(path) }), covered)
}

// What is valid at the edges of the rules, so that a rule does not grow
// stricter than it says.
func TestWhatTheRulesAllowIsAccepted(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name string
		spec []string
	}{
		{name: "a url with a base path", spec: []string{"endpoint: {url: 'https://slurm.example.org/api/slurm/'}", byEnv}},
		{name: "a url without TLS", spec: []string{"endpoint: {url: 'http://slurm.example.org:6820'}", byEnv}},
		{name: "a url with an IPv6 address", spec: []string{"endpoint: {url: 'http://[::1]:6820'}", byEnv}},
		{name: "a scheme in capitals", spec: []string{"endpoint: {url: 'HTTPS://slurm.example.org'}", byEnv}},
		{name: "a socket through ssh", spec: []string{"endpoint: {socket: /run/slurmrestd.socket}", "ssh: {host: login}", byEnv}},
		{name: "a url through ssh", spec: []string{viaURL, "ssh: {host: login.example.org}", byEnv}},
		{name: "an alias of the ssh configuration", spec: []string{viaURL, "ssh: {host: gsi_login-2}", byEnv}},
		{name: "an IPv6 address as the ssh host", spec: []string{viaURL, "ssh: {host: '2001:db8::1'}", byEnv}},
		{name: "a command of one word", spec: []string{viaURL, "token: {command: [/usr/local/bin/slurm-token]}"}},
		{name: "an empty argument after the program", spec: []string{viaURL, "token: {command: [get-token, '']}"}},
		{name: "a program with a dot in its name, found in PATH", spec: []string{viaURL, "token: {command: [token.sh]}"}},
		{name: "arguments with blanks and a relative path", spec: []string{viaURL, `token: {command: [/usr/bin/curl, -H, "X-Site: example org", ./token]}`}},
		{name: "an argument with a line break", spec: []string{viaURL, `token: {command: [sh, -c, "scontrol token |\n cut -d= -f2"]}`}},
		{name: "a variable with an underscore first", spec: []string{viaURL, "token: {env: _token2}"}},
		{name: "a token file with a space in its path", spec: []string{viaURL, "token: {file: '/home/alice/my tokens/vesta'}"}},
		{name: "a user name with a dot", spec: []string{viaURL, byEnv, "user: alice.smith"}},
		{name: "an anchor nobody refers to", spec: []string{"endpoint: &e {url: 'https://slurm.example.org'}", byEnv}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			clusters, problems := parse("f.yaml", []byte(profile(tt.spec...)))

			assert.Empty(t, problems)
			assert.Len(t, clusters, 1)
		})
	}
}

// The name stands in the interface and is to stand in addresses of the
// browser API, so it is held to a DNS label.
func TestTheNameOfAClusterIsADNSLabel(t *testing.T) {
	t.Parallel()

	label63 := strings.Repeat("a", 63)
	tests := []struct {
		name  string
		given string
		valid bool
	}{
		{name: "letters", given: "vesta", valid: true},
		{name: "letters, digits and hyphens", given: "vesta-2-test", valid: true},
		{name: "one character", given: "v", valid: true},
		{name: "digits alone", given: "'2025'", valid: true},
		{name: "63 characters", given: label63, valid: true},
		{name: "64 characters", given: label63 + "a"},
		{name: "a capital", given: "Vesta"},
		{name: "an underscore", given: "vesta_test"},
		{name: "a dot", given: "vesta.example.org"},
		{name: "a hyphen first", given: "'-vesta'"},
		{name: "a hyphen last", given: "vesta-"},
		{name: "a space", given: "vesta test"},
		{name: "a slash", given: "vesta/test"},
		{name: "a letter beyond ASCII", given: "vírgo"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			src := strings.Replace(profile(viaURL, byEnv), "name: vesta", "name: "+tt.given, 1)

			clusters, problems := parse("f.yaml", []byte(src))

			if tt.valid {
				assert.Empty(t, problems)
				assert.Len(t, clusters, 1)
				return
			}
			require.Len(t, problems, 1)
			assert.Equal(t, Position{File: "f.yaml", Line: 4, Column: 3}, problems[0].Position)
			assert.Equal(t, "metadata.name", problems[0].Field)
			assert.Equal(t, `is not a name sdash takes: a name is at most 63 of a-z, 0-9 and "-", and begins and ends with a letter or a digit`, problems[0].Message)
		})
	}
}

// A document that lacks a whole part is told so once, at the mapping the
// part is missing from, and not once more for every field of the part.
func TestAMissingPartIsReportedOnceWhereItIsMissing(t *testing.T) {
	t.Parallel()

	tests := missingParts()
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			assert.Equal(t, tt.want, problemsOf(tt.src))
		})
	}
}

// A key no field has is the commonest mistake in a file written by hand,
// and YAML itself would let it pass: the cluster would be read without what
// the key was meant to set.
func TestAnUnknownFieldIsReportedWithTheFieldThatWasMeant(t *testing.T) {
	t.Parallel()

	tests := unknownFields()
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			assert.Equal(t, tt.want, problemsOf(tt.src))
		})
	}

	// The misspelt key counts as the field it stands for, so what follows
	// from the field being there is still said.
	t.Run("a misspelt key beside the field it excludes", func(t *testing.T) {
		t.Parallel()

		src := profile("endpoint:", "  urll: https://slurm.example.org", "  socket: /run/slurmrestd.socket", byEnv)

		assert.Equal(t, []string{
			`f.yaml:7:5: spec.endpoint.urll: unknown field "urll"; did you mean "url"?`,
			`f.yaml:6:3: spec.endpoint: sets "url" and "socket"; it takes exactly one of them`,
		}, problemsOf(src))
	})

	t.Run("at the top of a document", func(t *testing.T) {
		t.Parallel()

		src := profile(viaURL, byEnv) + "specs: {}\nlabels: {}\n"

		assert.Equal(t, []string{
			`f.yaml:8:1: specs: unknown field "specs"; did you mean "spec"?`,
			`f.yaml:9:1: labels: unknown field "labels"; the fields here are "apiVersion", "kind", "metadata" and "spec"`,
		}, problemsOf(src))
	})

	t.Run("in metadata, which has one field", func(t *testing.T) {
		t.Parallel()

		src := strings.Replace(profile(viaURL, byEnv), "  name: vesta\n", "  name: vesta\n  description: the big one\n", 1)

		assert.Equal(t, []string{
			`f.yaml:5:3: metadata.description: unknown field "description"; the one field here is "name"`,
		}, problemsOf(src))
	})
}

// A document of another program or another version is not a profile with
// unknown fields. It is reported once, by what was expected in its place.
func TestADocumentOfAnotherKindOrVersionIsReportedByWhatWasExpected(t *testing.T) {
	t.Parallel()

	tests := otherDocuments()
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			assert.Equal(t, tt.want, problemsOf(tt.src))
		})
	}
}

// A file that is not YAML is reported with the words of the YAML library.
// The line it names stays inside the message and is not made a position:
// for the list that is never closed it names line 3, and the list begins in
// line 4.
func TestAFileThatIsNotYAMLIsReportedInTheWordsOfTheYAMLLibrary(t *testing.T) {
	t.Parallel()

	tests := notYAML()
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			_, problems := parse("f.yaml", []byte(tt.src))

			require.Len(t, problems, 1)
			assert.Equal(t, tt.want, []string{problems[0].String()})
			assert.Equal(t, Position{File: "f.yaml"}, problems[0].Position)
		})
	}
}

// The documents before a syntax error were read, and what is wrong with
// them is still said. What follows the error cannot be read at all.
func TestTheDocumentsBeforeASyntaxErrorAreStillJudged(t *testing.T) {
	t.Parallel()

	src := "apiVersion: sdash/v1alpha1\nkind: Site\n---\nmetadata: {name: [vesta\n"

	problems := problemsOf(src)

	require.Len(t, problems, 2)
	assert.Equal(t, `f.yaml:2:1: kind: is not a kind this sdash reads; expected "Cluster"`, problems[0])
	assert.Contains(t, problems[1], "is not YAML: ")
}

// Several documents in one file are several clusters, and an empty document
// is none: a file may begin with a document marker, end with one, or hold a
// part that is commented out.
func TestAFileHoldsSeveralDocumentsAndEmptyOnesAreSkipped(t *testing.T) {
	t.Parallel()

	one := profile(viaURL, byEnv)
	two := strings.Replace(one, "name: vesta", "name: lustre", 1)
	tests := []struct {
		name  string
		src   string
		names []string
	}{
		{name: "nothing at all", src: ""},
		{name: "comments alone", src: "# no cluster yet\n"},
		{name: "document markers alone", src: "---\n---\n...\n"},
		{name: "one document", src: one, names: []string{"vesta"}},
		{name: "a marker before the document", src: "---\n" + one, names: []string{"vesta"}},
		{name: "two documents", src: one + "---\n" + two, names: []string{"vesta", "lustre"}},
		{name: "an empty document between two", src: one + "---\n# removed for now\n---\n" + two, names: []string{"vesta", "lustre"}},
		{name: "a marker after the last document", src: one + "---\n" + two + "---\n", names: []string{"vesta", "lustre"}},
		{name: "a byte order mark first", src: "\ufeff" + one, names: []string{"vesta"}},
		{name: "written as JSON, which is YAML", src: `{"apiVersion": "sdash/v1alpha1", "kind": "Cluster", "metadata": {"name": "vesta"},` +
			` "spec": {"endpoint": {"url": "https://slurm.example.org"}, "token": {"env": "SDASH_TOKEN"}}}`, names: []string{"vesta"}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			var names []string
			for _, cluster := range clustersOf(t, tt.src) {
				names = append(names, cluster.Metadata.Name)
			}

			assert.Equal(t, tt.names, names)
		})
	}
}

// Every leaf of a profile is text, and it is read as the text that was
// written. YAML readers disagree on what 0600, 1e3 and yes are; here none
// of them is anything but what the user typed.
func TestAValueIsTheTextThatWasWritten(t *testing.T) {
	t.Parallel()

	src := strings.Replace(profile(viaURL, "token:", "  command: [sleep, 5, yes, 0600, 1e3, 0x1F, 2026-10-05, !!binary aGk=, 'null']", "user: 1000"),
		"name: vesta", "name: 2026", 1)

	clusters := clustersOf(t, src)

	require.Len(t, clusters, 1)
	assert.Equal(t, "2026", clusters[0].Metadata.Name)
	assert.Equal(t, "1000", clusters[0].Spec.User)
	assert.Equal(t, []string{"sleep", "5", "yes", "0600", "1e3", "0x1F", "2026-10-05", "aGk=", "null"}, clusters[0].Spec.Token.Command)
}

func TestAPositionIsRenderedWithWhatIsKnownOfIt(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name     string
		position Position
		want     string
	}{
		{name: "a field", position: Position{File: "/etc/sdash/vesta.yaml", Line: 7, Column: 5}, want: "/etc/sdash/vesta.yaml:7:5"},
		{name: "a file as a whole", position: Position{File: "vesta.yaml"}, want: "vesta.yaml"},
		{
			// A terminal would obey the sequence; the name of a file is
			// whatever whoever created it chose.
			name:     "a file name with an escape sequence",
			position: Position{File: "\x1b[2Jvesta.yaml", Line: 1, Column: 1},
			want:     `"\x1b[2Jvesta.yaml":1:1`,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			assert.Equal(t, tt.want, tt.position.String())
		})
	}
}

// The error of a load is what "sdash config check" and a server that does
// not start print: every problem on a line of its own.
func TestTheErrorListsEveryProblemOnItsOwnLine(t *testing.T) {
	t.Parallel()

	err := &Error{Problems: []Problem{
		{Position: Position{File: "a.yaml", Line: 2, Column: 1}, Field: "kind", Message: `is not a kind this sdash reads; expected "Cluster"`},
		{Position: Position{File: "b.yaml"}, Message: "is not YAML: line 3: did not find expected key"},
	}}

	assert.Equal(t, "the cluster profiles are not valid:\n"+
		"  a.yaml:2:1: kind: is not a kind this sdash reads; expected \"Cluster\"\n"+
		"  b.yaml: is not YAML: line 3: did not find expected key", err.Error())
}

// A report is read on a terminal, and a profile may hold anything: a key
// with an escape sequence in it would be obeyed there. The path of the
// unknown field is printed quoted, as the key in the message is.
func TestAKeyATerminalWouldObeyIsPrintedQuoted(t *testing.T) {
	t.Parallel()

	problems := problemsOf(profile(viaURL, byEnv, `"\e[2Jlogin": alice`))

	assert.Equal(t, []string{
		`f.yaml:8:3: "spec.\x1b[2Jlogin": unknown field "\x1b[2Jlogin"; the fields here are "endpoint", "ssh", "token" and "user"`,
	}, problems)
}

func TestOnlyAValueATerminalWouldObeyIsQuoted(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name  string
		value string
		want  string
	}{
		{name: "a path", value: "/home/alice/.config/sdash/vesta.token", want: "/home/alice/.config/sdash/vesta.token"},
		{name: "a path with a space", value: "/home/alice/my tokens/vesta", want: "/home/alice/my tokens/vesta"},
		{name: "a name beyond ASCII", value: "/home/zoë/schlüssel", want: "/home/zoë/schlüssel"},
		{name: "an escape sequence", value: "\x1b]0;owned\x07", want: `"\x1b]0;owned\a"`},
		{name: "a line break", value: "a\nb", want: `"a\nb"`},
		{name: "a character that turns the direction of the text", value: "a\u202eb", want: `"a\u202eb"`},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			assert.Equal(t, tt.want, Printable(tt.value))
		})
	}
}

// A suggestion that is wrong sends the user the wrong way, so one is made
// for a slip of the hand and for nothing else.
func TestAFieldIsSuggestedForASlipOfTheHandAndNotForAnotherWord(t *testing.T) {
	t.Parallel()

	endpoint := []string{"caFile", "socket", "url"}
	top := []string{"apiVersion", "kind", "metadata", "spec"}
	tests := []struct {
		name    string
		written string
		known   []string
		meant   string
	}{
		{name: "a letter doubled", written: "urll", known: endpoint, meant: "url"},
		{name: "a letter dropped", written: "ur", known: endpoint, meant: "url"},
		{name: "two letters swapped", written: "ulr", known: endpoint, meant: "url"},
		{name: "a letter wrong", written: "uri", known: endpoint, meant: "url"},
		{name: "another case", written: "CAFILE", known: endpoint, meant: "caFile"},
		{name: "an underscore too many", written: "ca_file", known: endpoint, meant: "caFile"},
		{name: "a word cut short", written: "sock", known: endpoint, meant: "socket"},
		{name: "a plural", written: "specs", known: top, meant: "spec"},
		{name: "the same key as another program writes it", written: "api_version", known: top, meant: "apiVersion"},
		{name: "a word that shares half its letters", written: "port", known: []string{"host"}},
		{name: "another word of three letters", written: "uid", known: endpoint},
		{name: "a part of a longer name", written: "version", known: top},
		{name: "another word altogether", written: "address", known: endpoint},
		{name: "nothing", written: "", known: endpoint},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			meant, hint := suggest(tt.written, tt.known)

			assert.Equal(t, tt.meant, meant)
			if tt.meant == "" {
				assert.NotContains(t, hint, "did you mean")
				return
			}
			assert.Equal(t, `; did you mean "`+tt.meant+`"?`, hint)
		})
	}
}
