# Samples

Every file here is executed by `pnpm docs:check`, and a non-zero exit fails the build. That is
what "documentation is a product surface, not a manual" means in practice: a sample that stops
working is a build failure rather than a support ticket.

A sample is a `.ts` file that runs to completion, prints what it demonstrates, and asserts what
the prose around it claims. Keep each one small enough to read in a page, and name it after the
page it belongs to.
