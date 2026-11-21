+++
title = "A signed audit log, anchors off the gateway, and a signed policy"
date = '2026-11-21T09:40:00+01:00'
draft = false
description = "The gateway's decisions in a hash-chained log with one ML-DSA-65 signature per batch, written only when something changes; anchors kept on the PC so that a log cut short or written again is found; and a policy the gateway runs only if an operator key that is not on the gateway signed it, at a version that never goes back. Live on the bench gateway since 21 November 2026, with the costs measured there."
weight = 30

[params]
+++

[Standard evidence](/projects/fpga-soc/microchip-polarfire-soc/aegis/standards-and-releases/x07-standard-evidence/)
made each verdict a signed object. Two things around the verdicts were still unsigned. The **history**: the journal
says who was admitted when, and anyone who can write the journal can change it. And the **policy** the verdicts are
reached under: a JSON file that anyone who can write the policy directory can replace, or put back as it was last
month. Aegis 1.0 signs both
([`docs/audit-and-policy.md`](https://github.com/ismailalitech/aegis/blob/main/docs/audit-and-policy.md)).

![The signed policy and the audit log: policy-sign on the operator's PC signs with a key sealed to the PC's TPM; aegis-fleet loads fleet.cose only if a listed key signed it and its version is not older; its decisions go into an audit log of chained, signed batches; audit_anchors.py on the PC fetches the last batch record every 300 s, and verify_audit.py checks the log against every anchor kept](/aegis/diagrams/audit-policy-anchors.svg)

Both use the envelope of standard evidence unchanged (a tagged COSE_Sign1, ML-DSA-65, the signer's thumbprint as
`kid`, deterministic CBOR) with a media type of their own in the protected header, so the verifier's signature on an
attestation result is never valid as an audit batch, nor the other way round.

## The audit log

The log is a directory of segment files, each a CBOR sequence of **batch records**. A batch record is a COSE_Sign1
over:

| Field | |
|---|---|
| log | 16 random bytes, made when the log begins |
| batch | 1, 2, 3, ... through every segment |
| prev | the SHA-256 of the whole batch record before it; zeros for batch 1 |
| first | the number of the batch's first entry |
| entries | up to 256: time, event, subject, details |
| due | the time by which the verifier promises the next batch |

A batch names its number, the hash of the one before and its first entry, so every entry has one place in the log,
and a reader walking the segments finds a batch that was changed, removed, repeated, moved or taken from another log.

**An entry when something changes, not every cycle.** The loop logs `admit` and `refuse` when an endpoint's decision
is the first since start or differs from the last one; `issue`, `revoke` and `expiry` for sessions; `policy` when the
policy in use changes, and `policy-refused`; `enrol`; and its own `start`, `stop` and housekeeping. What makes a
decision another decision is admitted or not, the stage, the key, the measurements, how the key is trusted, the
evidence format and the enforcement result. The words of a refusal are recorded but are not part of it, so an
endpoint that stays refused for the same reason does not cost a batch every 30 seconds.

### What it costs

| Situation | Written |
|---|---|
| a cycle in which nothing changed | nothing: no byte, no signature, the key not opened |
| a cycle in which something changed | one batch, 3.5 kB plus the entries, one write and one `fsync`, at most one per 300 s |
| nothing changed for an hour | one empty batch, about 3.5 kB: "still here, nothing to report" |
| a one-hour session renewed | 3.7 kB per endpoint and hour |

For the bench, three provisioned endpoints at a 30 s cycle, that is about 0.3 MB a day. An endpoint that changes its
answer every cycle would cost a batch per cycle; the 300 s minimum interval bounds that to 288 batches, 1 to 1.5 MB, a
day.

**Measured on the bench gateway on 21 November 2026**, with the audit log on, a signed policy and standard results
on STM32 board 2: over ten minutes the audit directory did not grow (44 KB before and after; eight batches, 43 KB, in
the first hour), the fleet service's resident memory stayed at 25,132 KB, and the credentials directory at 10 KB.

### What a reader can tell, and what it cannot

| Done to the log | Without the verifier's key | Found by |
|---|---|---|
| an entry or a batch changed | the signature fails | any reader |
| a batch removed, repeated, reordered or moved in from another log | the chain breaks | any reader |
| the beginning removed | the log does not begin at batch 1 | any reader |
| **the end cut off between two batches** | **the rest is a whole, signed, shorter log** | only a reader with an anchor or a head from after the cut, or after the last batch's `due` time |
| the whole directory deleted | the verifier begins a new log | a reader with an anchor |

The fourth row is the one the design has to answer outside the gateway.
[Lab 67](/projects/fpga-soc/microchip-polarfire-soc/aegis/standards-and-releases/a20-attest-a-device-without-hardware/)
shows it on a real log: one bit changed, refused; the last batch cut off, verified; the same with the head of the
last batch given, refused.

![verify_audit.py on the verifier's log from the simulated-device run: verified as written; refused with one bit flipped; verified when the last batch is cut off; refused with the head of batch 3](/aegis/diagrams/console-verify-audit.svg)

## Anchors kept off the gateway

**An anchor is a batch record**: the verifier's own signed statement "the log L had N batches, and this is the
last". Kept where the gateway cannot write, it fixes the log up to that batch for good. `tools/audit_anchors.py`
keeps them on the bench PC, over the same read-only SSH as the bench watcher:

- `fetch` runs `fleet.py audit --out` on the gateway and accepts exactly one batch record, signed by the given key,
  at most 16 kB. A new record goes into a store where files are created once, made read-only and never overwritten;
  a record that contradicts one kept (another batch under a number already kept, a lower number, a log that was
  already followed by another) is not kept but saved as evidence and reported;
- `check` copies the whole log, checks it, then checks it against every anchor kept, and reports `truncated`,
  `rewritten`, `gap`, `replaced`, `rollback` or `stale`;
- `watch` fetches every 300 s and checks once an hour, and alerts when a finding appears or clears.

On the bench it keeps the gateway's anchors on the PC since 21 November 2026, against the gateway's signed policy.

**What it proves.** From the first anchor on, the log cannot be cut off at a record boundary, rolled back, deleted,
or written again from a kept batch or before, even with the verifier's key, without `check` saying so.
**What it does not.** Batches written after the last fetch can be cut off unseen until the next fetch (up to 5
minutes at 300 s); it cannot see entries that the key holder never wrote; and it trusts the PC that keeps the store.

The gateway also prints a line for every batch, `aegis-audit: batch N of log L, entries A to B, sha256 H`, and
`verify_audit.py --head N:H` checks a log against it: a weaker second anchor where the journal is forwarded.

## The signed policy

The policy stays the JSON it was, inside a COSE_Sign1 signed by an **operator key that no verifier holds**:

```text
{ 1: "tag:github.com,2026:ismailalitech/aegis/policy/v1",
  2: version, 3: issued, 4: the policy file byte for byte, 5: signer, ? 6: audience }
```

**Off by default.** A verifier checks signatures only when it has a signers file listing the operator's public keys.
With one:

| The policy offered | |
|---|---|
| unsigned JSON | refused: not signed |
| signed by a listed key, version not lower than the last accepted | accepted |
| a lower version | refused: rollback |
| the same version with other content | refused |
| signed by another key, altered, or with a claim outside the format | refused |
| a signers file that lists the verifier's own identity key | refused: that key is on the gateway |

In the loop, which reads the policy every cycle, a refused file leaves the last accepted policy in use and is said
once at error priority and in the audit log. A loop that ran unsigned and is then given a signers file stops, rather
than run on from the unsigned file; it is started again by systemd and refuses the unsigned file. If the signers file
disappears while the loop runs from a signed policy, the policy is refused and the last verified one stays.

**What the signature covers.** A policy names files: device keys, endorsers' keys, endorsement records. The signature
covers their names, not their content, unless the policy carries their hash too. `policy-sign --pin-keys` adds
`pq_pub_sha256` for every post-quantum entry from its key file before signing, so a replaced key file is refused.

**Signing.** The operator's tool keeps the key in its own state directory, sealed to the TPM where there is one, as on
the bench PC. `policy-sign` refuses what is not a policy (not JSON, a name twice, no endpoints), takes the next
version from its own ledger, prints what it is about to sign (the version, the hash, each endpoint and how its key is
pinned, the endorsers, whether results and the audit log are on), and signs only after the operator types `yes`.
It then reads the signed bytes back as a verifier does before it writes the file.

On the bench gateway since 21 November 2026, every change of policy goes this way: the STM32's
[switch to standard evidence](/projects/fpga-soc/microchip-polarfire-soc/aegis/standards-and-releases/x07-standard-evidence/)
and turning on results for every endpoint each needed a new signed version.

## Root on the gateway

The two objects defend against someone who can write files on the gateway but holds no signing key: a deployment
channel, a restore from an old backup, an operator's mistake, a file-write flaw in something running beside the
verifier. Against **root on the gateway** they do less, and the release notes say so:

- root holds the verifier's identity key, so it can write the log again from any point; only an anchor kept
  elsewhere shows that it is not the log that was anchored;
- it can leave entries out as they happen; nothing in this design shows an entry that was never written;
- it can replace or remove the signers file and delete the version counter. It cannot make a new *signed* policy,
  because the operator key is not on the gateway.

As before, root on the gateway is outside what Aegis defends against
([`docs/threat-model.md`](https://github.com/ismailalitech/aegis/blob/main/docs/threat-model.md), T26 and T27).
The gateway's identity key is a software key, because the chip is the part without the data-security block
([the chip is not an S device](/projects/fpga-soc/microchip-polarfire-soc/aegis/identity-and-quotes/k01-chip-is-not-an-s-device/)).

## Other limits

- **One clock.** Times in the log are the gateway's; a reader is told where the clock went back, not what the right
  time was.
- **Entries waiting in memory are lost with the process**: those held for the 300 s interval, or for a disk that came
  back.
- **The log keeps every segment by default.** At the worst rate that is about 0.5 GB a year; `max_segments` bounds it
  and records a signed `pruned` entry for what it deletes.
