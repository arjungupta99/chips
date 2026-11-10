---
title: Enterprise
description: Consumer-simple on the surface, enterprise-ready from the data model up.
sidebar:
  order: 1
---

Chips is built for one person and their harnesses first. The things an enterprise needs are not a
different product; they are the same data model with more of it turned on.

## What is already true

- **Tenancy from the first table.** Every table carries `workspace_id`, every repository method
  takes a workspace scope, and a lint rule fails any query that lacks the predicate.
- **An audit that cannot be edited.** The log is append-only and exportable, and the audit view
  is a read of it rather than a second record that could disagree. See
  [Audit event](/concepts/audit-event/).
- **A workspace cap on autonomy.** A space can forbid what a harness's own policy allows, and the
  cap always wins. See [Policy](/concepts/policy/).
- **Credentials that stay put.** Chips brokers decisions and never holds the credentials an
  harness acts with.
- **Data residency by construction.** The harness runs where you run it, and the server runs where
  you put it. Nothing has to leave your cloud.

## What comes later

Invites, passkeys and several people in a workspace are here. Not built yet: Postgres, S3, several
gateway processes behind one address and a Prometheus exporter; after them, SAML, SCIM, retention
policies and an admin surface.

The `ee/` directory in the repository is reserved and empty until then. Anything that would go in
it before that work is a signal the boundary is in the wrong place.
