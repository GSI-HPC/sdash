// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

package config

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

// Where the profiles are read from is part of the command line contract:
// the flag wins over SDASH_CONFIG, which wins over the XDG rule, and the
// default is ~/.config/sdash on every system.
func TestTheConfigurationDirectoryIsTheMostSpecificOneThatIsNamed(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name   string
		flag   string
		env    map[string]string
		want   Location
		chosen bool
	}{
		{
			name: "the default, below the home directory",
			env:  map[string]string{"HOME": "/home/alice"},
			want: Location{Dir: "/home/alice/.config/sdash", From: "HOME"},
		},
		{
			name: "below XDG_CONFIG_HOME",
			env:  map[string]string{"HOME": "/home/alice", "XDG_CONFIG_HOME": "/home/alice/etc"},
			want: Location{Dir: "/home/alice/etc/sdash", From: "XDG_CONFIG_HOME"},
		},
		{
			name:   "the one SDASH_CONFIG names, itself and not a directory below it",
			env:    map[string]string{"HOME": "/home/alice", "XDG_CONFIG_HOME": "/home/alice/etc", "SDASH_CONFIG": "/srv/sdash"},
			want:   Location{Dir: "/srv/sdash", From: "SDASH_CONFIG"},
			chosen: true,
		},
		{
			name:   "the one the flag names",
			flag:   "/tmp/profiles",
			env:    map[string]string{"HOME": "/home/alice", "XDG_CONFIG_HOME": "/home/alice/etc", "SDASH_CONFIG": "/srv/sdash"},
			want:   Location{Dir: "/tmp/profiles", From: "--config"},
			chosen: true,
		},
		{
			// A directory named by hand may be relative to where sdash is
			// started, as any path on a command line is.
			name:   "a relative directory from the flag",
			flag:   "./profiles/",
			want:   Location{Dir: "profiles", From: "--config"},
			chosen: true,
		},
		{
			name:   "a relative directory from SDASH_CONFIG",
			env:    map[string]string{"SDASH_CONFIG": "profiles"},
			want:   Location{Dir: "profiles", From: "SDASH_CONFIG"},
			chosen: true,
		},
		{
			// The XDG rule: a relative value is not valid and is ignored.
			name: "a relative XDG_CONFIG_HOME",
			env:  map[string]string{"HOME": "/home/alice", "XDG_CONFIG_HOME": "etc"},
			want: Location{Dir: "/home/alice/.config/sdash", From: "HOME"},
		},
		{
			name: "an empty SDASH_CONFIG and an empty XDG_CONFIG_HOME",
			env:  map[string]string{"HOME": "/home/alice", "XDG_CONFIG_HOME": "", "SDASH_CONFIG": ""},
			want: Location{Dir: "/home/alice/.config/sdash", From: "HOME"},
		},
		{
			name: "XDG_CONFIG_HOME without a home directory",
			env:  map[string]string{"XDG_CONFIG_HOME": "/etc/xdg"},
			want: Location{Dir: "/etc/xdg/sdash", From: "XDG_CONFIG_HOME"},
		},
		{
			// A directory below wherever sdash happens to be started is
			// nobody's configuration.
			name: "a relative home directory",
			env:  map[string]string{"HOME": "alice"},
			want: Location{},
		},
		{
			name: "nothing at all",
			want: Location{},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			got := Locate(tt.flag, func(name string) string { return tt.env[name] })

			assert.Equal(t, tt.want, got)
			assert.Equal(t, tt.chosen, got.Chosen())
		})
	}
}
