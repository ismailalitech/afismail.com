+++
title = "Aegis 1.2: a signed export time, the log's head in each result, a trust floor and a switch"
date = '2026-11-21T11:30:00+01:00'
draft = false
description = "What Aegis 1.2 adds to the verifier: an evidence pack whose manifest and export time the verifier signs, with every result saying so, so a stripped signature is caught; the audit log's head and the verdict's warnings in each signed result; and two policy keys, a trust floor and a switch that takes an entry out of service. On the bench gateway since 21 November 2026, with the runs that show each part."
weight = 50

[params]
+++

Aegis 1.2 is the verifier of 1.1 with the additions below, merged as
[pull request 53](https://github.com/ismailalitech/aegis/pull/53), with the data formats for readers in
[pull request 54](https://github.com/ismailalitech/aegis/pull/54), and running on the bench gateway since 21 November
2026; on GitHub as [v1.2.0](https://github.com/ismailalitech/aegis/releases/tag/v1.2.0). The Prover SDK and the endpoint images are unchanged: everything here happens
in `aegis-fleet`, in the evidence pack, in the two standalone checkers and in the documents for readers
([`docs/evidence-format.md`](https://github.com/ismailalitech/aegis/blob/main/docs/evidence-format.md),
[`docs/audit-and-policy.md`](https://github.com/ismailalitech/aegis/blob/main/docs/audit-and-policy.md)).

| Gap in 1.1 | What 1.2 does | Where a reader sees it |
|---|---|---|
| a pack's export time was the manifest's `"exported"`, which nobody signed | the verifier signs the manifest and the export time, `manifest.cose` | the checker reports `"export_time": {"signed": true}` |
| removing that signature would make a pack look like one of 1.1 | every 1.2 result says the verifier signs its packs | `aegis.pack-signed` in the signed result |
| a result and the audit log were not tied to each other | each result names the log's last batch when it was signed | `aegis.audit-log`, `aegis.audit-batch`, `aegis.audit-head` |
| an admitted endpoint's cautions were spread over several claims | the verdict's warning and the vector's details in one list | `aegis.warnings` |
| any label was enough to be admitted; an entry could only be removed | a floor on the trust label, and a switch | `"min_trust"`, `"disabled"`; `aegis.min-trust`, `aegis.disabled` |

## On the bench

The board regression passed 14 of 14 with 1.2 deployed. Then STM32 board 2 was given a floor it cannot meet, taken
out of service, and given a floor it meets; and a pack of the bench was checked with the signed export time required:

![The gateway with Aegis 1.2 on 21 November 2026: the regression 14 of 14; with min_trust trustzone on STM32 board 2, QUARANTINED policy: entry stm32h573-dk-2 can NEVER meet min_trust trustzone: its trust is trustzone-devkey, and the board not contacted; with disabled true, QUARANTINED disabled by policy, credential revoked; with min_trust trustzone-devkey, admitted again; a 1.2 pack verified with --require-signed-export, its export time signed](/aegis/diagrams/console-v12-bench.svg)

The first refusal is the one 1.2 was written to give. The STM32s are labelled `trustzone-devkey`, because their
PSA tokens are signed with TF-M's published key, and no cycle can raise that: the label follows from the key the
policy pins. So the gateway says the policy is wrong, once it loads it, rather than asking the board and reporting
a quarantine that looks like the board's fault.

## The signed manifest

`fleet.py export-evidence` now writes `manifest.cose` beside `manifest.json`: a COSE_Sign1 by the verifier's identity
key, with a media type of its own (`application/vnd.aegis.evidence-pack+cbor`), over the endpoint, the export time,
the SHA-256 of `manifest.json` byte for byte and the SHA-256 of the result. Through the manifest's hash it covers every
file the manifest names.

![The signed manifest: the signed result says aegis.pack-signed; manifest.json lists every file and the export time; manifest.cose signs the endpoint, the export time and the hashes of the manifest and the result; verify_evidence.py with --require-signed-export reports the time as signed. A pack whose manifest.cose was removed is refused because its result says aegis.pack-signed; a manifest edited after signing is refused](/aegis/diagrams/pack-signed-manifest.svg)

A signature that is only there when it is there would be no defence: whoever wants an unsigned time removes
`manifest.cose` and the manifest's pointer to it, and the pack reads as one made by 1.1. So every result a 1.2
verifier signs carries `aegis.pack-signed`, and the checker refuses a pack whose signed result says it and that has
no `manifest.cose`, with or without `--require-signed-export`. What can still be shown without a signed time is a pack
whose result came from a 1.1 verifier, and `--require-signed-export` refuses that too.

The same on the [simulated device](/projects/fpga-soc/microchip-polarfire-soc/aegis/standards-and-releases/a20-attest-a-device-without-hardware/)
with 1.2, on the build PC: its pack as exported, the signature removed, and the export time moved by a day.

![verify_evidence.py on the simulated device's 1.2 pack: the result says aegis.pack-signed, names the audit log's batch 1 and its head, and carries two warnings; the export time signed and the pack verified. With manifest.cose and signed_manifest removed: refused, the result says its verifier signs every pack. With the export time moved: refused, not the manifest the verifier signed. verify_audit.py with --result: batch 1 found in the log, the result's decision admit in batch 2](/aegis/diagrams/console-v12-pack.svg)

The signed time is the verifier's clock, as every time it signs. One key signs results, audit batches and pack
statements; each reader requires its own media type, so none is taken for another.

## The log's head in each result

With the audit log on, each result names the log's last batch record on disk when it was signed: the log's id, the
batch number and the SHA-256 of the record. The batch was written before the result, so it never holds the result's
own decision; that goes into a later batch, with the result's hash when the decision changed.

![The log's head in a result: batch N on disk when the result is signed; the result names its log, number and SHA-256; the result's own decision goes into batch N+1 or later; verify_audit.py with --result finds batch N byte for byte in the log, or refuses it, and reports where the decision is](/aegis/diagrams/result-audit-head.svg)

`tools/verify_audit.py log DIR --key KEY --result attestation-result.cbor` fails unless that batch is in the log byte
for byte, whether the log was cut off before it, written again or replaced. A result handed to a relying party is
therefore also an [anchor](/projects/fpga-soc/microchip-polarfire-soc/aegis/standards-and-releases/x08-a-signed-audit-log-and-a-signed-policy/)
of the log, kept by whoever holds the result. It costs the loop one `stat` of the last segment per result.

## `aegis.warnings`

The first entry is the verdict's warning as the journal shows it, then each detail of the trustworthiness vector as
`"<category>: <text>"`, at most eight texts of at most 300 characters. Unlike the EAR's status details it is there
whatever the status, so an endpoint admitted with cautions has them in one place. On the simulated device the two
warnings are that the key was pinned on first use and that the software measures itself.

## A trust floor and a switch

Two policy keys that only make the verifier stricter; a policy without them runs as before.

![A trust floor and a switch: the policy entry's min_trust, its own or the policy's; possible_trust works out at load time the labels the entry can ever get; if none meets the floor, the entry is refused as a policy error, not contacted, result incomplete; otherwise it is contacted and the label of each quote checked again, and admitted as before with aegis.min-trust in the result. An entry with disabled true is not contacted, quarantined, its session revoked, result incomplete](/aegis/diagrams/min-trust-floor.svg)

**`"min_trust"`**, per entry or at the policy's top level, admits only a verdict whose label is the floor or
stronger, in the order
`trustzone > trustzone-devkey > device-key > software > development-shared-key`
(why that order: [trust labels](/projects/fpga-soc/microchip-polarfire-soc/aegis/trust-model/x05-trust-labels-endorsement-transcript/)).
A floor the entry's kind, profile and attestation key can never meet is refused when the policy loads, as above. An
entry cannot opt out of a top-level floor: `"min_trust": null` is a policy error, not "no floor". An entry whose
verdicts carry no label meets no floor.

**`"disabled": true`** keeps the entry, with its keys, endorsement pin and address, and stops the gateway from
contacting the endpoint. Every cycle it is quarantined with `disabled by policy`, so everything a quarantine does
follows: the enforcement hook runs, the session is revoked, the audit log records a `refuse`. The signed status is
`incomplete`, because nothing was appraised, not `contraindicated`.

`fleet.py check` says all of this before a policy is signed. On the simulated device's policy with one key added each
time:

![fleet.py check on the simulated device's entry: min_trust device-key, REFUSED, it can never meet it with software trust, exit 1; min_trust software, met; min_trust null, refused, unknown min_trust; disabled true, DISABLED, not contacted, quarantined every cycle, session revoked, exit 0](/aegis/diagrams/console-v12-check.svg)

## For anyone building a reader

[Pull request 54](https://github.com/ismailalitech/aegis/pull/54) adds what a program needs to read Aegis evidence
without running Aegis code: [`docs/data-formats.md`](https://github.com/ismailalitech/aegis/blob/main/docs/data-formats.md), a reference of every file, claim and closed list
the verifier writes; [JSON Schemas](https://github.com/ismailalitech/aegis/tree/main/docs/schemas) (draft 2020-12) for the manifest, the state file, the policy, the endorsement record
and the signers file; and synthetic golden vectors in
[`tests/vectors/aegis-1.2/`](https://github.com/ismailalitech/aegis/blob/main/tests/vectors/aegis-1.2/README.md), made by the verifier's own writers
with keys derived from published seeds: an evidence pack for every kind, profile and status (a disabled entry among
them), a signed policy, an audit log with an anchor. None of their keys is a secret or a real device's, and their
signatures differ from run to run, so a reader compares structure and verifies signatures rather than bytes.

## Compatibility

A 1.1 reader skips verifier claims it does not know and accepts a 1.2 result; a 1.2 reader accepts a 1.1 result and
reports the new claims as absent, and a 1.1 pack as verified with its export time "not signed". Both directions are
tests in `tests/host/test_verifier_v12.py`, with 1.1's reader and checker taken from the `v1.1.0` tag; the host
fuzzer sends hostile pack statements and 1.2 claims to the readers.

## What 1.2 does not change

- **Root on the gateway** holds the verifier's key: it can sign a pack with any time and write the log again. The
  head in a result helps only where the result is kept off the gateway.
- **The signed time is the gateway's clock.** A reader learns when the verifier says it made the pack, not when it
  was made.
- **The floor is only as good as the labels.** The STM32s stay `trustzone-devkey` while they run with TF-M's
  published keys; a floor of `trustzone` refuses them, it does not make them stronger.
- The known limits of [releases 1.0 and 1.1](/projects/fpga-soc/microchip-polarfire-soc/aegis/standards-and-releases/x09-releases-1-0-and-1-1/)
  stand.

The records behind the figures: the operator's record of the bench and the two runs on the build PC are in this
site's `tools/aegis-figures/records/` (`v12-bench.txt`, `v12-pack.txt`, `v12-check.txt`).
