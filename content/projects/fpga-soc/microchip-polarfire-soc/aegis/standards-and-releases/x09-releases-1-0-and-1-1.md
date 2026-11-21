+++
title = "Releases 1.0 and 1.1, and their known limits"
date = '2026-11-21T10:00:00+01:00'
draft = false
description = "Aegis 1.0 and 1.1 were released on 21 November 2026: a bench prototype of a post-quantum attestation gateway with its source, its tests and the records of what ran on the boards. What each release contains, how it was verified, what runs on the bench, and the limits that are part of the release. 1.2 followed the same day."
weight = 40

[params]
+++

Both releases are on GitHub with their release notes:
[**Aegis 1.0**](https://github.com/ismailalitech/aegis/releases/tag/v1.0.0)
([notes](https://github.com/ismailalitech/aegis/blob/main/docs/release-notes-1.0.md)) and
[**Aegis 1.1**](https://github.com/ismailalitech/aegis/releases/tag/v1.1.0)
([notes](https://github.com/ismailalitech/aegis/blob/main/docs/release-notes-1.1.md)), both of 21 November 2026.
Aegis is a bench prototype, not a certified product. The known limits at the end of this page are part of the
release, not footnotes to it.

## What 1.0 contains

| Component | What it does |
|---|---|
| Gateway verifier, `aegis-fleet` | challenges each endpoint every 30 s, appraises its evidence against the policy, admits it with an ML-KEM-768 credential and session or quarantines it with the reason |
| Gateway identity and quote, `aegisd` | the gateway signs its own quote with ML-DSA-65, checked by a PC verifier; also runs on an ordinary Linux host |
| Fabric accelerator | a SHA-3 sponge and NTT block in the PolarFire fabric that speeds up ML-KEM-768 and ML-DSA-65 in liboqs |
| [Prover SDK](/projects/fpga-soc/microchip-polarfire-soc/aegis/standards-and-releases/x06-one-prover-sdk/) 1.0.0, API version 1 | the one protocol core every endpoint builds |
| Endpoint firmware | TF-M partitions on the STM32H573 and the RW612, an OP-TEE trusted application on the Zynq UltraScale+, a Linux prover |
| Endorser | endorses device keys at the bench instead of trust on first use; signs policies |
| Enforcement | an nftables ruleset and a one-port VLAN design, tested in network namespaces only |
| Standalone checkers | check evidence packs, the audit log and signed policies with third-party libraries only |
| Bench tools | the regression, the soak runner, the bench watcher |
| Evaluation container | every board-free part in one command ([lab 67](/projects/fpga-soc/microchip-polarfire-soc/aegis/standards-and-releases/a20-attest-a-device-without-hardware/)) |

Protocol features in 1.0:
[one transcript and endorsed enrolment](/projects/fpga-soc/microchip-polarfire-soc/aegis/trust-model/x05-trust-labels-endorsement-transcript/)
on every attesting endpoint of the bench; the session's end on the device's own clock;
and, opt-in and off by default,
[standard evidence and signed results](/projects/fpga-soc/microchip-polarfire-soc/aegis/standards-and-releases/x07-standard-evidence/),
the evidence pack, a
[signed audit log and a signed policy](/projects/fpga-soc/microchip-polarfire-soc/aegis/standards-and-releases/x08-a-signed-audit-log-and-a-signed-policy/).

| Standard | Status |
|---|---|
| ML-DSA-65, FIPS 204; ML-KEM-768, FIPS 203; KMAC256, SP 800-185 | final |
| EAT, RFC 9711, in a COSE_Sign1; ML-DSA in COSE, RFC 9964 | RFC |
| EAR (`draft-ietf-rats-ear-06`), AR4SI (`draft-ietf-rats-ar4si-11`) | IETF drafts |

## What 1.1 changes

The verifier labels a TF-M endpoint by the attestation key its policy pins: `trustzone-devkey` for TF-M's published
development key, as on the bench's STM32s, with a warning and a signed status of warning instead of affirming
([trust labels](/projects/fpga-soc/microchip-polarfire-soc/aegis/trust-model/x05-trust-labels-endorsement-transcript/)).
The anchor collector works against a gateway that runs from a signed policy. The Prover SDK is unchanged.

## How it was verified

- **Host tests**: about 450, run by CI and as the first stage of the regression.
- **Regression**: `tools/regression.sh --board --with-expiry`, 14 stages from the host tests to the endpoints'
  session end on the boards. It passed 14 of 14 three times during the soak, with the Zynq UltraScale+ connected.
- **Fuzzing**: the SDK core under libFuzzer against a model of the protocol, in the RW612, STM32 and EAT modes, in
  CI; the red-team harness sends hostile tokens, quotes, records, logs and policies to the verifier's parsers.
- **NIST vectors**: the fabric accelerator passes the 265 ACVP cases.
- **Soak**: three hours on three live boards, 40 of 40 samples answered, 37 session renewals per endpoint, no
  quarantine, reset or reboot. Its report says FAIL on one item, a false clock-rate estimate of the runner, explained
  in [the case study](/projects/fpga-soc/microchip-polarfire-soc/aegis/bench-and-reproduce/k16-a-soak-that-failed-its-own-clock-estimate/).

## On the bench

| Role | Board | Image |
|---|---|---|
| Gateway | PolarFire SoC Discovery Kit | `aegis-fleet` with the audit log on, a signed policy, signed results kept for every endpoint |
| Endpoint | STM32H573I-DK, board 2 | the partition on the Prover SDK with standard evidence, SPE `315dcc2f`, NSPE `acf8fc53` |
| Endpoint | STM32H573I-DK, board 1 | the partition on the Prover SDK, SPE `9de76167` |
| Endpoint | NXP FRDM-RW612 | TF-M 0.3.2 with the Aegis partition, key from the ELS die key |
| Endpoint | Trenz TE0807, Zynq UltraScale+ | trusted application 0.2.0 on the Prover SDK |
| Endpoint that cannot attest | Arduino Uno | quarantined on every cycle, by design |

STM32 board 1 was unplugged for the soak.

## Known limits

From the release notes; the full list is section 5 of the
[threat model](https://github.com/ismailalitech/aegis/blob/main/docs/threat-model.md).

- **Standard evidence runs on one board.** STM32 board 2; the RW612 and the Zynq UltraScale+ images are built
  without it.
- **EAR and AR4SI are IETF drafts.** Their claim numbers and profile string can still change; a later draft's output
  is refused rather than misread.
- **Root on the gateway** can still write the audit log again (shown only by an anchor kept off the gateway), leave
  entries out as they happen, and replace or remove the policy signers file.
- **Development keys.** The STM32s run in the Open state with TF-M's public signing keys, and the RW612 with
  development keys and no secure boot. Anyone with the debugger can replace a secure image, and the transcript does not
  defend against an image built by an attacker.
- **Soak: 3 hours only.** Memory, descriptor and disk trends are not judged under 4 hours; counter wraps and drift
  over several days are untested. The 24-hour soak has not run yet.
- **No VLAN enforcement on the bench network.** The ruleset and the one-port VLAN design are tested in network
  namespaces only, not on a switch.
- **Side channels and fault injection are not evaluated.**

## Aegis 1.2

[Aegis 1.2](/projects/fpga-soc/microchip-polarfire-soc/aegis/standards-and-releases/x10-aegis-1-2/) is merged ([pull request 53](https://github.com/ismailalitech/aegis/pull/53)) and on
the bench gateway since 21 November 2026; on GitHub as v1.2.0 (being released), with the other releases on the
[releases page](https://github.com/ismailalitech/aegis/releases). It changes only the verifier and the checkers: a
signed export time in the evidence pack, with `aegis.pack-signed` in every result so that a removed signature is
caught; the audit log's head and `aegis.warnings` in each result; and the policy keys `min_trust` and `disabled`. The
board regression passed 14 of 14 with it deployed. The data formats for readers (JSON Schemas, a reference of every
claim, golden vectors) are part of 1.2 too ([pull request 54](https://github.com/ismailalitech/aegis/pull/54)).
