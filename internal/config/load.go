// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

// Package config finds and reads the configuration of sdash: the cluster
// profiles in the user's configuration directory
// (doc/adr/0025-cluster-profiles-as-yaml-documents.md).
//
// A profile says where a slurmrestd is, how to reach it and where the token
// comes from, and two of its fields, the SSH host and the token command,
// name what sdash is to execute. So a profile is as trusted as a script,
// and it is read strictly: a key that no field has, a document of another
// kind and a name used twice are errors, each with the file, the line and
// the column it was written at. Every document is judged, so that one run
// reports all there is to fix. What is reported names the place and the rule
// and does not repeat the value: a token written into the wrong field must
// not reach a terminal or a journal that way.
//
// Reading is all this package does. It starts no process, opens no
// connection, and opens no file but the profiles themselves: what a profile
// names is not looked at (doc/adr/0016-e2e-and-fixtures-on-sind.md). It
// never writes a profile either. dir.go is its one file that reaches the
// operating system, and a test holds it to that.
//
// It is clusterctl's configuration reader, reduced: no layers, no merging,
// no schema and no secrets, because one kind of document with a dozen
// fields needs none of them.
//
// Adapted from GSI-HPC/clusterctl internal/config.
package config

import (
	"cmp"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"path/filepath"
	"slices"
	"strings"
)

// maxFileSize bounds what is read of one file. A profile is a few lines; a
// file beyond this is not one, and reading it whole would only fill memory.
const maxFileSize = 1 << 20

// Profiles is what a configuration directory holds.
type Profiles struct {
	// Dir is the directory that was read.
	Dir string
	// Missing says that Dir does not exist. That is no error: sdash then
	// has no clusters.
	Missing bool
	// Clusters are the cluster profiles, sorted by name. The order of the
	// files and of the documents in them carries no meaning.
	Clusters []Cluster
}

// Names returns the names of the clusters, in the order of Clusters.
func (p *Profiles) Names() []string {
	names := make([]string, len(p.Clusters))
	for i, cluster := range p.Clusters {
		names[i] = cluster.Metadata.Name
	}
	return names
}

// load reads the profiles of the directory at the root of fsys, which dir
// names in positions and messages.
//
// It reads the files of the directory whose name ends in ".yaml" and does
// not begin with a dot, in the order of their names, and does not descend.
// Any problem with any of them fails the whole load, with an *Error that
// lists them all: sdash does not start on half a configuration.
func load(fsys fs.FS, dir string) (*Profiles, error) {
	switch info, err := fs.Stat(fsys, "."); {
	case errors.Is(err, fs.ErrNotExist):
		return &Profiles{Dir: dir, Missing: true}, nil
	case err != nil:
		return nil, fmt.Errorf("read the configuration directory: %w", err)
	case !info.IsDir():
		return nil, fmt.Errorf("read the configuration directory: %s is not a directory", dir)
	}
	entries, err := fs.ReadDir(fsys, ".")
	if err != nil {
		return nil, fmt.Errorf("read the configuration directory: %w", err)
	}

	var clusters []Cluster
	var problems []Problem
	for _, entry := range entries {
		// A hidden file is not configuration: an editor keeps its swap
		// files beside the file it edits.
		if !strings.HasSuffix(entry.Name(), ".yaml") || strings.HasPrefix(entry.Name(), ".") {
			continue
		}
		file := filepath.Join(dir, entry.Name())
		data, err := readProfile(fsys, entry.Name())
		if err != nil {
			problems = append(problems, Problem{Position: Position{File: file}, Message: err.Error()})
			continue
		}
		found, wrong := parse(file, data)
		clusters = append(clusters, found...)
		problems = append(problems, wrong...)
	}
	problems = append(problems, duplicates(clusters)...)
	if len(problems) > 0 {
		slices.SortStableFunc(problems, func(a, b Problem) int {
			return cmp.Or(cmp.Compare(a.File, b.File), cmp.Compare(a.Line, b.Line), cmp.Compare(a.Column, b.Column))
		})
		return nil, &Error{Problems: problems}
	}
	slices.SortFunc(clusters, func(a, b Cluster) int {
		return cmp.Compare(a.Metadata.Name, b.Metadata.Name)
	})
	return &Profiles{Dir: dir, Clusters: clusters}, nil
}

// readProfile returns the content of one profile file. The error it returns
// completes a message that begins with the name of the file.
//
// Only a regular file is read, directly or through a symbolic link, as a
// tool that manages a user's configuration files leaves them. A named pipe
// would hold sdash until someone wrote to it, and a device has no end. The
// kind is checked before the file is opened, so that nothing else is opened
// at all, and again on the open file, which is the one that is read.
func readProfile(fsys fs.FS, name string) ([]byte, error) {
	info, err := fs.Stat(fsys, name)
	if err != nil {
		return nil, fmt.Errorf("cannot be read: %w", withoutPath(err))
	}
	if err := checkRegular(info); err != nil {
		return nil, err
	}
	file, err := fsys.Open(name)
	if err != nil {
		return nil, fmt.Errorf("cannot be read: %w", withoutPath(err))
	}
	// Nothing was written, so a close that fails loses nothing.
	defer func() { _ = file.Close() }()
	if info, err = file.Stat(); err != nil {
		return nil, fmt.Errorf("cannot be read: %w", withoutPath(err))
	}
	if err := checkRegular(info); err != nil {
		return nil, err
	}
	data, err := io.ReadAll(io.LimitReader(file, maxFileSize+1))
	if err != nil {
		return nil, fmt.Errorf("cannot be read: %w", withoutPath(err))
	}
	if len(data) > maxFileSize {
		return nil, fmt.Errorf("is larger than %d bytes, which no profile is", maxFileSize)
	}
	return data, nil
}

// checkRegular refuses what is not a regular file, and says what it is.
func checkRegular(info fs.FileInfo) error {
	what := "not a regular file"
	switch mode := info.Mode(); {
	case mode.IsRegular():
		return nil
	case mode.IsDir():
		what = "a directory"
	case mode&fs.ModeNamedPipe != 0:
		what = "a named pipe"
	case mode&fs.ModeSocket != 0:
		what = "a socket"
	case mode&fs.ModeDevice != 0:
		what = "a device"
	}
	return fmt.Errorf("is %s, and only a file is read as a profile", what)
}

// withoutPath strips the operation and the path a file system error
// carries: the problem it becomes part of names the file already.
func withoutPath(err error) error {
	if within, ok := errors.AsType[*fs.PathError](err); ok {
		return within.Err
	}
	return err
}

// duplicates reports every cluster whose name another cluster before it
// has. A second profile of a name is an error and does not replace the
// first: the files are read in name order, so a stale copy such as
// vesta_old.yaml would otherwise decide which host sdash connects to and
// which command it runs for the token.
//
// Adapted from GSI-HPC/clusterctl internal/config/load.go.
func duplicates(clusters []Cluster) []Problem {
	var problems []Problem
	first := map[string]Position{}
	for _, cluster := range clusters {
		name := cluster.Metadata.Name
		if at, taken := first[name]; taken {
			problems = append(problems, Problem{
				Position: cluster.Position,
				Field:    "metadata.name",
				Message:  fmt.Sprintf("is a name another cluster has, at %s; remove one of them or give it a name of its own", at),
			})
			continue
		}
		first[name] = cluster.Position
	}
	return problems
}
