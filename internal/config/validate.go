// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

package config

import (
	"errors"
	"net/url"
	"path/filepath"
	"strconv"
	"strings"
	"unicode"

	"github.com/GSI-HPC/sdash/internal/apis/v1alpha1"
)

// validate checks a decoded profile against the rules of its kind and
// reports every one it breaks.
//
// The rules judge what is written and nothing else. No path is looked up
// and no host is resolved: a token file may not be there yet, a socket
// appears only when its daemon or a forward runs and lies on the host behind
// the sshd where the route goes through one, and a profile is checked on
// machines that cannot reach the cluster. Whether a profile works shows when
// sdash connects, and nothing connects yet
// (doc/adr/0016-e2e-and-fixtures-on-sind.md).
//
// No rule repeats the value that breaks it. The value may be a secret in
// the wrong field, a token where the name of its variable belongs or a
// password in an address, and what is reported here ends in terminals, in
// the journal of a service and in bug reports. The file, the line and the
// column say which value is meant.
func (d *document) validate(cluster *v1alpha1.Cluster) {
	if d.require("metadata", "it names the cluster") &&
		d.require("metadata.name", "it is the name sdash lists the cluster under") {
		d.check("metadata.name", checkName(cluster.Metadata.Name))
	}
	if !d.require("spec", "it names the endpoint and the source of the token") {
		return
	}
	spec := cluster.Spec

	if d.exactlyOne("spec.endpoint", "it names the slurmrestd", "url", "socket") {
		// Whether a CA file has a use is said of a url that is known to be
		// one, or of an endpoint without a url, and not of a url that has
		// a problem of its own.
		https, judged := false, !d.written("spec.endpoint.url")
		if d.usable("spec.endpoint.url") {
			err := checkURL(spec.Endpoint.URL)
			d.check("spec.endpoint.url", err)
			https, judged = isHTTPS(spec.Endpoint.URL), err == nil
		}
		// The socket may lie on the host behind the sshd, so the rule is
		// that of a Unix path, whatever system sdash runs on.
		if d.usable("spec.endpoint.socket") && !strings.HasPrefix(spec.Endpoint.Socket, "/") {
			d.check("spec.endpoint.socket", notAbsolute())
		}
		if d.usable("spec.endpoint.caFile") {
			d.check("spec.endpoint.caFile", checkPath(spec.Endpoint.CAFile))
			if judged && !https {
				d.report("spec.endpoint.caFile", "only an https url is verified against a CA file")
			}
		}
	}

	if d.written("spec.ssh") && d.require("spec.ssh.host", "it names the host the endpoint is reached through") {
		d.check("spec.ssh.host", checkSSHHost(spec.SSH.Host))
	}

	if d.exactlyOne("spec.token", "it names where the token comes from", "command", "env", "file") {
		if d.usable("spec.token.command") {
			if len(spec.Token.Command) == 0 {
				d.report("spec.token.command", "is an empty list; it names a program and its arguments")
			} else {
				d.check("spec.token.command[0]", checkProgram(spec.Token.Command[0]))
			}
		}
		if d.usable("spec.token.env") {
			d.check("spec.token.env", checkEnvName(spec.Token.Env))
		}
		if d.usable("spec.token.file") {
			d.check("spec.token.file", checkPath(spec.Token.File))
		}
	}

	if d.usable("spec.user") {
		d.check("spec.user", checkUser(spec.User))
	}
}

// written says whether the key of the field at path is in the document, as
// it is or misspelt.
func (d *document) written(path string) bool {
	_, ok := d.at[path]
	return ok || d.meant[path]
}

// usable says whether the field at path is written and could be read, so
// that a rule can judge its value.
func (d *document) usable(path string) bool {
	if _, ok := d.at[path]; !ok {
		return false
	}
	for p := path; p != ""; p = parent(p) {
		if d.unread[p] {
			return false
		}
	}
	return true
}

// require reports a field that has to be written and is not, and says
// whether the field is usable. A field inside a mapping that is itself
// missing or unreadable is not reported: the mapping's own problem says it.
func (d *document) require(path, purpose string) bool {
	if d.written(path) {
		return d.usable(path)
	}
	if within := parent(path); within == "" || d.usable(within) {
		d.report(path, "is missing; %s", purpose)
	}
	return false
}

// exactlyOne requires the mapping at path and reports it unless exactly one
// of the named keys is written in it. It says whether the mapping is usable,
// so that the rules of its fields run.
//
// What counts is the key, not its value: "url:" with nothing after it is a
// url that lacks its value, which is reported as such, and not an endpoint
// without a url.
func (d *document) exactlyOne(path, purpose string, keys ...string) bool {
	if !d.require(path, purpose+" by "+either(keys)) {
		return false
	}
	var written []string
	for _, key := range keys {
		if d.written(join(path, key)) {
			written = append(written, key)
		}
	}
	switch len(written) {
	case 1:
	case 0:
		d.report(path, "sets none of %s; it takes exactly one of them", all(keys))
	default:
		d.report(path, "sets %s; it takes exactly one of them", all(written))
	}
	return true
}

// check reports err, if there is one, as a problem with the field at path.
func (d *document) check(path string, err error) {
	if err != nil {
		d.report(path, "%s", err)
	}
}

// either lists keys as alternatives: "url" or "socket".
func either(keys []string) string { return list(keys, "or") }

// all lists keys together: "command", "env" and "file".
func all(keys []string) string { return list(keys, "and") }

// list quotes keys and joins them with commas and, before the last, word.
func list(keys []string, word string) string {
	quoted := make([]string, len(keys))
	for i, key := range keys {
		quoted[i] = strconv.Quote(key)
	}
	if len(quoted) < 2 {
		return strings.Join(quoted, "")
	}
	last := len(quoted) - 1
	return strings.Join(quoted[:last], ", ") + " " + word + " " + quoted[last]
}

// checkName holds a cluster's name to a DNS label. The name is shown in the
// interface and is to stand in addresses of the browser API, where a label
// needs no escaping.
func checkName(name string) error {
	const letters = "abcdefghijklmnopqrstuvwxyz0123456789"
	if len(name) <= 63 && only(name, letters+"-") &&
		strings.Contains(letters, name[:1]) && strings.Contains(letters, name[len(name)-1:]) {
		return nil
	}
	return errors.New("is not a name sdash takes: a name is at most 63 of a-z, 0-9 and \"-\", " +
		"and begins and ends with a letter or a digit")
}

// checkURL holds the endpoint to an http or https address with a host and,
// if anything follows the host, a base path.
//
// A password in the address is recognised only where the address can be
// parsed and has its scheme. Without the scheme, "alice:secret@host" reads
// as the scheme "alice"; and for an address it cannot parse, the library
// quotes the part it stopped at, which for "https://host:secret" is the
// password. So the library's words are not passed on, and the user
// information is looked for before anything else.
func checkURL(raw string) error {
	u, err := url.Parse(raw)
	switch {
	case err != nil:
		return errors.New("is not a URL; write http:// or https://, then the host, " +
			"and a port and a base path where the endpoint has them")
	case u.User != nil:
		// A password in the address would be a credential in the profile
		// (doc/adr/0007-jwt-and-the-token-source.md).
		return errors.New("holds a user name or a password; a profile holds no credential, and the token comes from spec.token")
	case u.Scheme != "http" && u.Scheme != "https", u.Opaque != "":
		return errors.New("does not begin with http:// or https://")
	case u.Hostname() == "":
		return errors.New("names no host")
	case u.RawQuery != "" || u.ForceQuery || u.Fragment != "" || strings.HasSuffix(raw, "#"):
		return errors.New("holds a query or a fragment; after the host an endpoint has a base path and nothing else")
	}
	if port := u.Port(); port != "" {
		if number, err := strconv.Atoi(port); err != nil || number < 1 || number > 65535 {
			return errors.New("the port is not between 1 and 65535")
		}
	}
	return nil
}

// isHTTPS says whether raw is an address a CA file can apply to.
func isHTTPS(raw string) bool {
	u, err := url.Parse(raw)
	return err == nil && u.Scheme == "https"
}

// checkPath holds a path on this machine to an absolute one. A relative
// path would depend on the directory sdash was started in, and "~" is the
// shell's to expand, not sdash's.
func checkPath(path string) error {
	if filepath.IsAbs(path) {
		return nil
	}
	return notAbsolute()
}

// notAbsolute is the problem with a path that does not start at the root.
func notAbsolute() error {
	return errors.New("is not an absolute path; a relative path and \"~\" are not expanded")
}

// checkProgram holds the first item of the token command to one program: a
// name, which is looked up in PATH, or an absolute path.
//
// An item with white space in it is a command line written as one string,
// which would be looked up as the name of one program: the mistake the list
// exists to rule out, inside a list. That a program whose own path holds a
// blank cannot be named is the price; it is reached through PATH or a link.
//
// A relative path is refused as it is for a file, and with more reason. The
// command is what sdash executes, and a name with a slash in it is run as it
// stands, so "./token" would be whatever lies in the directory sdash was
// started in.
func checkProgram(program string) error {
	switch {
	case program == "":
		return errors.New("is empty; the first item names the program")
	case strings.ContainsFunc(program, unicode.IsSpace):
		return errors.New("holds white space; sdash does not split a string into words, " +
			"so write the program and each of its arguments as an item of its own")
	case strings.Contains(program, "/") && !filepath.IsAbs(program):
		return errors.New("is a relative path; the program is a name to look up in PATH or an absolute path, " +
			"and \"~\" is not expanded")
	}
	return nil
}

// checkSSHHost holds the SSH host to a host name, an address or an alias,
// and to nothing ssh would read as more than that. The value becomes an
// argument of the system ssh (doc/adr/0006-direct-or-through-ssh.md): one
// that began with "-" would be read as an option, and options of ssh run
// commands. A user, a port and a jump host have their place in the user's
// ssh configuration, which applies unchanged.
func checkSSHHost(host string) error {
	const letters = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
	if only(host, letters+"._:-") && !strings.HasPrefix(host, "-") {
		return nil
	}
	return errors.New("is not a host as sdash hands one to ssh: letters, digits, \".\", \"_\", \":\" and \"-\", " +
		"not beginning with \"-\"; a user, a port or a jump host belongs in your ssh configuration")
}

// checkEnvName holds the name of the token's environment variable to what a
// shell can set. What fails here is, as likely as a name with a typing
// error, the token itself, written where its variable belongs; the message
// is for both.
func checkEnvName(name string) error {
	const letters = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_"
	if only(name, letters+"0123456789") && strings.Contains(letters, name[:1]) {
		return nil
	}
	return errors.New("is not the name of an environment variable: letters, digits and \"_\", " +
		"not beginning with a digit; env names the variable and does not hold the token")
}

// checkUser holds the user name to the portable alphabet of user names, as
// clusterctl does for the accounts it logs in as.
func checkUser(user string) error {
	const letters = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
	if only(user, letters+"._-") && !strings.HasPrefix(user, "-") {
		return nil
	}
	return errors.New("is not a user name: letters, digits, \".\", \"_\" and \"-\", not beginning with \"-\"")
}

// only says whether s is not empty and holds no character outside allowed.
func only(s, allowed string) bool {
	return s != "" && strings.Trim(s, allowed) == ""
}
