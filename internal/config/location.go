// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

package config

import "path/filepath"

const (
	// FlagConfig is the flag that names the configuration directory.
	FlagConfig = "--config"
	// EnvConfig is the environment variable that names it when the flag is
	// not given.
	EnvConfig = "SDASH_CONFIG"
)

// Location is the configuration directory of a process and what named it.
type Location struct {
	// Dir is the directory. It is empty when nothing names one: sdash then
	// has no configuration, as with a directory that does not exist.
	Dir string
	// From is what named Dir: FlagConfig, EnvConfig, "XDG_CONFIG_HOME" or
	// "HOME".
	From string
}

// Locate finds the configuration directory: the one the flag names, else
// the one SDASH_CONFIG names, else sdash's directory below XDG_CONFIG_HOME,
// else ~/.config/sdash.
//
// The last two are the XDG base directory rule, on every system: on macOS
// too, where Go's os.UserConfigDir answers ~/Library/Application Support.
// The documentation then names one place, and a user's profiles lie at the
// same path on a Mac and on a login node. As that rule asks, a relative
// XDG_CONFIG_HOME is ignored, and so is a relative HOME: a directory that
// depends on where sdash was started is not the user's.
//
// The environment is handed in and HOME is read from it, so that a test
// places the directory without touching its process.
//
// Adapted from GSI-HPC/clusterctl internal/config/paths.go.
func Locate(flag string, getenv func(string) string) Location {
	if flag != "" {
		return Location{Dir: filepath.Clean(flag), From: FlagConfig}
	}
	if dir := getenv(EnvConfig); dir != "" {
		return Location{Dir: filepath.Clean(dir), From: EnvConfig}
	}
	if base := getenv("XDG_CONFIG_HOME"); filepath.IsAbs(base) {
		return Location{Dir: filepath.Join(base, "sdash"), From: "XDG_CONFIG_HOME"}
	}
	if home := getenv("HOME"); filepath.IsAbs(home) {
		return Location{Dir: filepath.Join(home, ".config", "sdash"), From: "HOME"}
	}
	return Location{}
}

// Chosen says whether the user named the directory, with the flag or with
// SDASH_CONFIG, and did not leave it to the default.
func (l Location) Chosen() bool {
	return l.From == FlagConfig || l.From == EnvConfig
}
