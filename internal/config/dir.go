// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

package config

import (
	"io/fs"
	"os"
	"path/filepath"
	"syscall"
)

// Load reads the cluster profiles in the directory dir and returns them,
// sorted by name. A directory that does not exist holds no profiles, which
// is no error. When a profile is not valid the error is an *Error with every
// problem that was found, and no cluster is returned.
func Load(dir string) (*Profiles, error) {
	return load(directory(dir), dir)
}

// directory is the directory of that path as the file system the loader
// reads. It is the one place where this package reaches the operating
// system: everything the loader touches is a name inside this directory, so
// a path that a profile holds cannot be opened by mistake.
type directory string

// Open opens a file of the directory, or with "." the directory itself, for
// reading.
//
// The file is opened without blocking. An open that blocks waits on a named
// pipe until another process opens it for writing, and whoever can put a
// pipe where a profile was a moment ago could hold sdash at its start for
// good. The loader refuses the pipe once it is open.
func (d directory) Open(name string) (fs.File, error) {
	path, err := d.path("open", name)
	if err != nil {
		return nil, err
	}
	file, err := os.OpenFile(path, os.O_RDONLY|syscall.O_NONBLOCK, 0)
	if err != nil {
		return nil, err
	}
	return file, nil
}

// Stat describes a file of the directory without opening it. It follows a
// symbolic link, so it describes what Open would open.
func (d directory) Stat(name string) (fs.FileInfo, error) {
	path, err := d.path("stat", name)
	if err != nil {
		return nil, err
	}
	return os.Stat(path)
}

// path is the path of a name inside the directory. A name that leads out of
// it, which the loader never asks for, is refused.
func (d directory) path(op, name string) (string, error) {
	if !fs.ValidPath(name) {
		return "", &fs.PathError{Op: op, Path: name, Err: fs.ErrInvalid}
	}
	return filepath.Join(string(d), name), nil
}
