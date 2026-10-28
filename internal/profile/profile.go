// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

// Package profile reads the profile file, in which the user names the
// clusters sdash connects to: the slurmrestd of each and where its token
// comes from (doc/adr/0033-the-profile-file.md).
//
// The file is the user's. sdash reads it at start and never writes it. The
// token command runs a program as the user, so it is set here and nowhere
// else: nothing the browser sends can change it
// (doc/adr/0012-local-listener-security.md).
package profile

import (
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"slices"
	"strings"

	"github.com/BurntSushi/toml"

	"github.com/GSI-HPC/sdash/internal/slurm/auth"
)

// The place of the profile file below the user's configuration directory.
const (
	configHomeVariable = "XDG_CONFIG_HOME"
	homeVariable       = "HOME"
	subdir             = "sdash"
	fileName           = "clusters.toml"
)

// namePattern is what a cluster's name may be. The name is a segment of the
// addresses of the browser API and of the interface, so it holds nothing
// that would have to be escaped there.
var namePattern = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._-]{0,62}$`)

// Profile is what the profile file says.
type Profile struct {
	// Path is the file the profile was read from; empty when there was none.
	Path string
	// Clusters are the clusters, in the order of the file.
	Clusters []Cluster
}

// Cluster is one cluster of the profile file.
type Cluster struct {
	// Name is how the user calls the cluster in sdash.
	Name string
	// Endpoint is the URL of the cluster's slurmrestd.
	Endpoint string
	// CAFile is a PEM file of the authorities that sign the endpoint's
	// certificate, beside the system's; empty for the system's alone.
	CAFile string
	// Token says where the token of each request comes from.
	Token Token
}

// Token is where the token of a cluster comes from: exactly one of its
// fields is set.
type Token struct {
	// Command is a command that prints a token, run without a shell.
	Command []string
	// File is a file that holds a token, read again when it is needed.
	File string
	// Env is the name of an environment variable that holds a token.
	Env string
}

// Source returns the source of the tokens t names. getenv reads the
// environment for a token in a variable.
func (t Token) Source(getenv func(string) string) auth.Source {
	switch {
	case len(t.Command) > 0:
		return auth.Command(t.Command...)
	case t.File != "":
		return auth.File(t.File)
	default:
		return auth.Fixed(getenv(t.Env))
	}
}

// What a cluster is in the file. The keys are written in snake case, as
// TOML files commonly are.
type fileCluster struct {
	Name     string    `toml:"name"`
	Endpoint string    `toml:"endpoint"`
	CAFile   string    `toml:"ca_file"`
	Token    fileToken `toml:"token"`
}

type fileToken struct {
	Command []string `toml:"command"`
	File    string   `toml:"file"`
	Env     string   `toml:"env"`
}

type file struct {
	Clusters []fileCluster `toml:"cluster"`
}

// DefaultPath returns where the profile file is when the command line names
// none: clusters.toml in the directory sdash has below the user's
// configuration directory, as the XDG Base Directory specification places
// it.
func DefaultPath(getenv func(string) string) (string, error) {
	if dir := getenv(configHomeVariable); filepath.IsAbs(dir) {
		return filepath.Join(dir, subdir, fileName), nil
	}
	// A relative XDG_CONFIG_HOME is to be ignored, as if unset.
	home := getenv(homeVariable)
	if !filepath.IsAbs(home) {
		return "", fmt.Errorf("neither %s nor %s is set to an absolute path", configHomeVariable, homeVariable)
	}
	return filepath.Join(home, ".config", subdir, fileName), nil
}

// Load reads the profile file at path. A file that does not exist is a
// profile without clusters when optional is set, as for the default path,
// and a failure otherwise, as for a path the user named. getenv gives the
// home directory for a path that starts with ~/.
func Load(path string, optional bool, getenv func(string) string) (Profile, error) {
	body, err := os.ReadFile(path)
	if errors.Is(err, fs.ErrNotExist) && optional {
		return Profile{}, nil
	}
	if err != nil {
		return Profile{}, fmt.Errorf("read the profile file: %w", err)
	}
	p, err := parse(string(body), filepath.Dir(path), getenv)
	if err != nil {
		return Profile{}, fmt.Errorf("profile file %s: %w", path, err)
	}
	p.Path = path
	return p, nil
}

// parse reads the text of a profile file. dir is the directory of the file,
// against which a relative path in it is read.
func parse(text, dir string, getenv func(string) string) (Profile, error) {
	var f file
	meta, err := toml.Decode(text, &f)
	if err != nil {
		return Profile{}, err
	}
	// A key sdash does not know is a mistake of spelling, and one that would
	// otherwise go unnoticed until the setting it was meant for is missed.
	if undecoded := meta.Undecoded(); len(undecoded) > 0 {
		keys := make([]string, len(undecoded))
		for i, k := range undecoded {
			keys[i] = k.String()
		}
		return Profile{}, fmt.Errorf("unknown keys: %s", strings.Join(keys, ", "))
	}

	var p Profile
	for i, fc := range f.Clusters {
		c, err := cluster(fc, dir, getenv)
		if err != nil {
			label := fmt.Sprintf("cluster %d", i+1)
			if fc.Name != "" {
				label = fmt.Sprintf("cluster %q", fc.Name)
			}
			return Profile{}, fmt.Errorf("%s: %w", label, err)
		}
		if slices.ContainsFunc(p.Clusters, func(o Cluster) bool { return o.Name == c.Name }) {
			return Profile{}, fmt.Errorf("cluster %q: the name is taken by an earlier cluster", c.Name)
		}
		p.Clusters = append(p.Clusters, c)
	}
	return p, nil
}

// cluster checks a cluster of the file and resolves its paths.
func cluster(fc fileCluster, dir string, getenv func(string) string) (Cluster, error) {
	switch {
	case fc.Name == "":
		return Cluster{}, errors.New("no name")
	case !namePattern.MatchString(fc.Name):
		return Cluster{}, errors.New("a name is up to 63 letters, digits, dots, hyphens and underscores, " +
			"and starts with a letter or a digit")
	case fc.Endpoint == "":
		return Cluster{}, errors.New("no endpoint")
	}

	sources := 0
	for _, set := range []bool{len(fc.Token.Command) > 0, fc.Token.File != "", fc.Token.Env != ""} {
		if set {
			sources++
		}
	}
	if sources != 1 {
		return Cluster{}, errors.New("the token comes from exactly one of command, file and env")
	}
	if len(fc.Token.Command) > 0 && fc.Token.Command[0] == "" {
		return Cluster{}, errors.New("the token command names no program")
	}

	c := Cluster{
		Name:     fc.Name,
		Endpoint: fc.Endpoint,
		Token:    Token{Command: fc.Token.Command, Env: fc.Token.Env},
	}
	var err error
	if fc.CAFile != "" {
		if c.CAFile, err = resolve(fc.CAFile, dir, getenv); err != nil {
			return Cluster{}, fmt.Errorf("ca_file: %w", err)
		}
	}
	if fc.Token.File != "" {
		if c.Token.File, err = resolve(fc.Token.File, dir, getenv); err != nil {
			return Cluster{}, fmt.Errorf("token file: %w", err)
		}
	}
	return c, nil
}

// resolve makes a path of the file absolute: ~/ stands for the home
// directory, as a user writes it in a shell, and a relative path is read
// against the directory of the file, so that the file means the same
// wherever sdash is started.
func resolve(path, dir string, getenv func(string) string) (string, error) {
	if rest, ok := strings.CutPrefix(path, "~/"); ok {
		home := getenv(homeVariable)
		if !filepath.IsAbs(home) {
			return "", fmt.Errorf("%q starts with ~/, and %s is not set to an absolute path", path, homeVariable)
		}
		return filepath.Join(home, rest), nil
	}
	if strings.HasPrefix(path, "~") {
		return "", fmt.Errorf("%q: only ~/ is expanded, for the own home directory", path)
	}
	if filepath.IsAbs(path) {
		return filepath.Clean(path), nil
	}
	return filepath.Join(dir, path), nil
}
