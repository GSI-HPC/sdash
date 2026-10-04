// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

package static

import (
	"io/fs"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// The server maps a request path straight to a name in this file system, so
// its root has to be the content of dist/, not the directory holding it. The
// placeholder is the one file present in every build, with or without the
// interface.
func TestFilesAreRootedAtTheContentOfDist(t *testing.T) {
	t.Parallel()

	files, err := Files()
	require.NoError(t, err)

	info, err := fs.Stat(files, "placeholder.txt")
	require.NoError(t, err)
	assert.True(t, info.Mode().IsRegular())

	_, err = fs.Stat(files, "dist")
	assert.ErrorIs(t, err, fs.ErrNotExist)
}
