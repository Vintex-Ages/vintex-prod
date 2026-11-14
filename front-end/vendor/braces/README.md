# Vintex patched `braces`

This local package is based on upstream `braces@3.0.3` and retains its MIT
license and copyright notices. It adds a maximum AST nesting depth of 100 for
brace and parenthesis groups to prevent uncontrolled recursion
(GHSA-vfj7-8cjw-p6xm).

The custom version `3.0.4-vintex.1` identifies the backport; it is not an
upstream release. Remove this package and the root npm override after adopting
an upstream release that fixes the advisory.
