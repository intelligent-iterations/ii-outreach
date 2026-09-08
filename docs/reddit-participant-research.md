# Reddit participant research

The library qualifies recent Reddit evidence, prepares drafts for review,
schedules approved messages, and records delivery and reply-check results.
Your application supplies all browser, model, persistence, and execution
adapters. It passes validated snapshots to the framework and saves returned
state transitions atomically.

## Qualification

A candidate needs an exact recent Reddit post or comment naming its author,
a concise evidence note, and an authenticated profile readback confirming that
chat is available. Deleted users, bots, campaign duplicates, and accounts
already contacted or suppressed are excluded.

Recent substantive activity in a selected community can qualify for assumed
intent. Evidence outside those communities must itself establish intent
aligned with the campaign. Unrelated profile history is insufficient.

Discovery maintains a bounded, resumable cursor. Inconclusive browser reads
must not delete previously accepted evidence or invalidate people reserved by
an approved delivery batch. The host owns checkpoints and recovery.

## Drafts

The caller chooses `exact`, `adapt`, or `new` mode and supplies approved example
messages. Exact mode preserves the selected example. Adapt mode permits at
most three word changes, or a lower caller-specified limit. New mode uses the
example as a style reference. Campaign facts and exact source evidence are
supplied as data, not embedded in reusable prompts.

Model output is untrusted. The library validates stable references, coverage,
mode-specific constraints, and materialized text. Returned drafts are review
material. They never authorize scheduling or delivery.

## Scheduling and delivery

A human approves the exact final message. The host atomically records that
approval and allocates an account and UTC delivery slot using the scheduling
functions. The participant scheduler enforces a maximum of four messages per
rolling hour per account within the 6:00 AM to 10:00 PM Eastern daily window,
with overflow moved to the next permitted day.

Before sending, the host claims the current approved record and verifies that
the text still matches the approval. Its platform adapter verifies the sender,
refuses ambiguous conversations, and confirms the exact sent text by reading
it back. An inconclusive send result requires review instead of an automatic
retry that could duplicate delivery.

Only a successful, exact readback authorizes a confirmed delivery receipt.
A crash after claiming requires host recovery and human review when delivery
is uncertain. Replies are checked through an explicit read-only operation;
checking a reply never authorizes a follow-up message.

See [the framework contract](stateless-framework.md) for the adapter boundary.
