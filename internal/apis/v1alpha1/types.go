// SPDX-FileCopyrightText: 2026 GSI Helmholtz Centre for Heavy Ion Research GmbH <http://www.gsi.de>
// SPDX-License-Identifier: Apache-2.0

package v1alpha1

// Cluster is the profile of one Slurm cluster. It holds what the accepted
// decision records say a profile holds and nothing more: the endpoint and
// the route to it (doc/adr/0006-direct-or-through-ssh.md), and the source of
// the token (doc/adr/0007-jwt-and-the-token-source.md).
type Cluster struct {
	// APIVersion is the version the document is written against,
	// GroupVersion.
	APIVersion string `yaml:"apiVersion"`
	// Kind is KindCluster.
	Kind string `yaml:"kind"`
	// Metadata names the cluster.
	Metadata ObjectMeta `yaml:"metadata"`
	// Spec says how sdash is to speak to the cluster.
	Spec ClusterSpec `yaml:"spec"`
}

// ObjectMeta names a document.
type ObjectMeta struct {
	// Name is the name sdash lists the cluster under. It is a DNS label, so
	// that it can stand in an address of the browser API as it is, and it
	// is unique among the profiles sdash reads.
	Name string `yaml:"name"`
}

// ClusterSpec says where the slurmrestd of a cluster is, how to reach it and
// how to authenticate to it. The route and the token are separate settings:
// each of the two routes goes with each of the three token sources.
type ClusterSpec struct {
	// Endpoint is where slurmrestd listens.
	Endpoint Endpoint `yaml:"endpoint"`
	// SSH is set when the endpoint is reached through SSH, and nil when it
	// is reached directly.
	SSH *SSH `yaml:"ssh"`
	// Token says where the JWT comes from. A token itself has no place in a
	// profile.
	Token TokenSource `yaml:"token"`
	// User is the Slurm user name, for a site whose tokens do not carry it.
	// It is empty where the token names the user.
	User string `yaml:"user"`
}

// Endpoint is where slurmrestd listens: at a URL or on a unix socket,
// exactly one of the two.
type Endpoint struct {
	// URL is an http or https address, which may end in a base path: what
	// a proxy of the site puts in front of slurmrestd's own paths. With SSH
	// set it is the address at which the host behind the sshd reaches
	// slurmrestd, so localhost is that host.
	URL string `yaml:"url"`
	// Socket is the absolute path of a unix socket. With SSH set it is a
	// path on the host behind the sshd.
	Socket string `yaml:"socket"`
	// CAFile is the absolute path of the certificate authority an https URL
	// is verified against, for a site whose authority the system does not
	// know.
	CAFile string `yaml:"caFile"`
}

// SSH is the route through an sshd. sdash runs the system ssh client for
// it, so everything but the host stays in the user's ssh configuration.
type SSH struct {
	// Host is the host ssh is asked to connect to: a host name, an address,
	// or a Host alias of the user's ssh configuration.
	Host string `yaml:"host"`
}

// TokenSource says where the JWT comes from: a command, a variable of the
// environment or a file, exactly one of the three.
//
// In what form the token arrives is not decided: whether a command prints
// the token alone or a line such as the "SLURM_JWT=" one of scontrol, and
// what a file or a variable holds around it
// (doc/adr/0025-cluster-profiles-as-yaml-documents.md). Nothing reads a
// token yet.
type TokenSource struct {
	// Command is a program and its arguments, which sdash is to run without
	// a shell to get the token. The first item is the program: a name to
	// look up in PATH or an absolute path, in one word.
	Command []string `yaml:"command"`
	// Env is the name of the environment variable the token is taken from.
	Env string `yaml:"env"`
	// File is the absolute path of the file the token is taken from.
	File string `yaml:"file"`
}
