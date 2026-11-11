# Afilli content cleanup

Scope: only `PRIVATE_OBJECT_DIR/afilli-content/<id>` and `<id>/ready`.
Chat storage, legacy photos and unrelated paths are never candidates.
There are no startup migrations or DDL and no new columns.

## Preview before enabling

After the normal API build:

```sh
pnpm --filter @workspace/api-server content:preview
```

This reads both storage and database and logs counts/bytes, without writing to
either. It fails closed on unavailable storage, tables or metadata. Counts are
for that run's snapshot, not a promise that a later run has identical candidates.

One explicit cleanup pass:

```sh
pnpm --filter @workspace/api-server content:clean
```

Inspect the preview before choosing apply. Do not run apply against a production
database while older API processes without the lifecycle lock are still serving.
All content writers must run the lock-aware version before enabling deletion.

## Scheduling

The API keeps its existing hosting configuration. In production it runs a pass
on startup, at hourly intervals while alive, and on the first request after an
hour has elapsed (catch-up after an autoscaled instance sleeps). Development does
not start background content cleanup. The default production mode is **preview**.
Set `AFILLI_CONTENT_CLEANUP_MODE=apply` in the production environment only after
reviewing the read-only counts. No deployment or environment setting is changed
by this implementation.

This is opportunistic hourly maintenance, not a wall-clock guarantee while the
entire API is asleep. If a strict idle-time schedule is required, run the same
built CLI hourly from an external scheduler with the same storage and database
configuration. Do not add a second web server or rely on workspace workflows for
production scheduling. Multiple instances and CLI runs serialize with publishers
through a PostgreSQL advisory lock on a separate, bounded connection pool.

## Safety and retry behavior

- Real post, book (including draft), profile, live story and video references
  protect media regardless of its `linked` hint or the reference's owner.
- A 24-hour allocation/object age threshold protects new/late uploads and
  partially completed finalize operations. Expired stories have an additional
  10-minute access-URL grace period. Old incomplete allocations cannot complete.
- Cancellation revokes access immediately but retains the ledger. Removing a
  video also retains its ledger so failed deletes can be retried.
- Both staging and `/ready` are scanned, even when a media row is missing.
  Late PUT replays are found on later passes; recent object timestamps postpone
  deletion. Incomplete raw PUT bytes are not visible as stored objects.
- Object generation preconditions prevent deleting a replacement that arrived
  since the listing. Any failed object deletion leaves the media row intact.
  Already-missing objects are success; repeat runs are safe after process crashes.
- Historical expired story metadata is retained. Cleanup removes bytes and media
  allocations, not readers' other content.

Logs include candidate/deleted counts, estimated bytes and failures. A CLI pass
exits nonzero if any candidate failed; the next pass retries from current state.
No signed URLs, credentials or user identifiers are included in count reports.
