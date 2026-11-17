+++
title = "Post-quantum attestation gateway on PolarFire SoC"
description = "A PolarFire SoC decides which devices on a network may be trusted, from signed evidence that their secure hardware produces, using the NIST post-quantum algorithms ML-DSA-65 and ML-KEM-768."
date = '2026-11-17T00:30:00+01:00'
draft = false
weight = 20

[params]
  project = true
  platform = "Microchip PolarFire SoC and STMicroelectronics STM32H5"
  problem = "A network usually trusts a device because it is plugged in. A device should earn access by proving what it is and what firmware it runs, and keep proving it, with signatures that a future quantum computer cannot forge."
  role = "Designed and built the complete system: the gateway services, the fabric accelerator and its tests, the secure partition on the endpoint, the attestation and provisioning protocol, the red-team harness and the regression."
  result = "A signed endpoint is admitted and holds an ML-KEM session; a validly signed but modified firmware image is quarantined within one cycle and its credential revoked; an Arduino that cannot attest is quarantined every cycle; NIST test vectors pass on three platforms; 12 of 12 regression stages pass."
  hardware = "Microchip PolarFire SoC Discovery Kit (MPFS095T) as the gateway, STM32H573I-DK as an attested endpoint, Arduino Uno R3 as a device that cannot attest"
  tools = "Libero SoC 2026.1, TF-M v2.3.0, liboqs 0.16.0, mldsa-native, mlkem-native, Icarus Verilog, Python"
  guide = "/projects/fpga-soc/microchip-polarfire-soc/aegis/bench-and-reproduce/a01-reproduce-the-bench/"
  toc = true
+++

## Problem

Zero-trust guidance asks that a device earns access by proving what it is and what it runs, and keeps proving it. Two
things make that hard for small devices. The proofs are usually signed with classical public-key schemes, which a large
quantum computer could forge. And a small device cannot carry the machinery that decides whether a proof is good.

I wanted a small gateway that makes that decision from evidence produced inside the endpoint's own secure hardware,
signed and exchanged with the algorithms NIST standardised for the post-quantum era: ML-DSA (FIPS 204) for signatures
and ML-KEM (FIPS 203) for key exchange. It had to run on real boards, be attacked by a harness I wrote, and say plainly
what it does not protect.

## Hardware and constraints

| Board | Role | Why |
|---|---|---|
| PolarFire SoC Discovery Kit | The gateway: decides admission, issues credentials | Linux on three cores for the services, FPGA fabric for an accelerator, a fourth core for a real-time supervisor |
| STM32H573I-DK | An attested endpoint | TrustZone, a hardware-unique key, and Ethernet; runs TF-M v2.3.0 |
| Arduino Uno R3 | A device that cannot attest | No keys, no measured boot, no network: it must be refused |

Constraints that shaped the design:

- **The gateway's chip is the non-"S" part.** It has no hardware crypto block and does not give software a key held by
  the chip's SRAM PUF. The gateway's own identity key is therefore generated and stored in software, and the documents
  say so. This was found during the work and corrected in the project's own notes.
- **The gateway has one Ethernet port.** It can decide, but it cannot sit in the traffic path of a separated network.
  Real separation needs a managed switch with 802.1Q VLANs. The enforcement rules exist and are not claimed.
- **The endpoint runs development keys.** Anyone with a debugger or the published TF-M signing keys can replace its
  secure image. A product would close the device, which is irreversible and deliberately not done on this bench.

## My contribution

- **Gateway services.** `aegisd` signs the gateway's own quote; `aegis-fleet` attests each endpoint every 30 seconds,
  admits or quarantines it with a reason, issues an ML-KEM credential and keeps a session alive with heartbeats.
- **Endpoint partition.** A TF-M secure partition that derives an ML-DSA-65 key from the chip's hardware-unique key,
  signs the TF-M attestation token and the gateway's challenge, performs the ML-KEM exchange and verifies the
  gateway's credential against a key pinned in the secure image.
- **Fabric accelerator.** A Keccak-f[1600] round engine and an NTT unit in the FPGA, checked against C references and
  against the NIST vectors with every Keccak permutation done in the fabric; then a second version that keeps the hash
  state in the fabric and squeezes whole blocks into memory by DMA, measured faster than software.
- **A legacy node and a verifier.** An Arduino sketch that answers every request with a statement that it cannot
  attest, and a PC tool that checks the gateway's own quote.
- **Red-team harness and regression.** Mutated tokens, malformed frames, hostile replies, downgrade and replay attempts,
  and one command that runs everything on the real boards.

## Architecture

![The system: a PC checks the gateway quote; the PolarFire gateway runs aegisd and aegis-fleet, reads the system controller and can use the fabric accelerator; the STM32 is attested over Ethernet and the Arduino Uno through a PC relay](/aegis/diagrams/system-overview.svg)

One decision cycle:

1. The gateway sends the endpoint a fresh 32-byte challenge.
2. The endpoint returns a TF-M attestation token (it contains the challenge and a measurement and signer id for each
   software image) and an ML-DSA-65 signature over the token from its device key.
3. The gateway checks the signature against the enrolled key, the challenge against the one it sent, and every
   measurement against its policy. Any mismatch is **QUARANTINED**, with the reason in the log.
4. If admitted and without a valid credential, the gateway runs an ML-KEM-768 exchange. The endpoint signs its
   encapsulation key; the gateway encapsulates and returns the ciphertext with a credential signed by its own
   ML-DSA-65 key and bound to that ciphertext. The endpoint checks the signature against the key pinned in its image.
5. Both sides now hold a session key. Heartbeats under that key confirm the endpoint still holds it. If the heartbeat
   fails, the gateway provisions again at the next cycle.

![One decision cycle: challenge, evidence, checks, then ADMITTED with an ML-KEM exchange and a session, or QUARANTINED with a reason](/aegis/diagrams/decision-cycle.svg)

The fabric half of the system, as the vendor's tool shows it: the block `aegis_pqc_0` sits on the same APB bus as the
project's other registers, next to the two peripheral blocks and the processor subsystem.

![The top-level SmartDesign canvas in Libero SoC, zoomed on the aegis_pqc block, with numbered callouts on it, FIC_3_PERIPHERALS, FIC_0_PERIPHERALS and the processor subsystem](/aegis/diagrams/libero-canvas-annotated.svg)

The parts are listed at the top of this page in the order a reader would work through them: how attestation works, the
bench, the gateway's identity, the fabric accelerator, the endpoint, enforcement and Linux timing. Each lab ends with what to
check and where it can go wrong, and the case studies record defects that were found and fixed. The threat list is in the
project's [threat model](https://github.com/ismailalitech/aegis/blob/main/docs/threat-model.md).

## Verification

Three kinds of evidence, kept apart:

- **Standard vectors.** The NIST ACVP vectors (ACVP-Server v1.1.0.41) for ML-KEM-768 and ML-DSA-65: 265 of 265 cases on
  the PC and on the STM32 Cortex-M33 code, and the same on the PolarFire with every Keccak permutation done in the
  fabric.
- **Attack harness.** 3,000 mutated tokens, 310 malformed frames to the gateway, 800 hostile endpoint replies, 76
  malformed commands to the STM32, downgrade and key-replay attempts. Two real defects were found and fixed.
- **Enforcement rules.** Three network namespaces stand in for the gateway, an endpoint and the network; the real ruleset
  and hook ran in them. The first run found that quarantine did not cut an open connection; fixed, 10 of 10 checks pass.
- **Whole system.** A regression that runs the host stages and the board stages: 12 of 12 pass, and the five host
  stages and the enforcement test also run on every push on a clean machine in GitHub Actions.

Every number is traced to a record with its method: [results and evidence](/resources/aegis-results/).

## Results and limits

| Question | Answer |
|---|---|
| Is a good endpoint admitted? | Yes, with an ML-KEM session and heartbeats every cycle |
| Is modified firmware caught if it is validly signed and boots normally? | Yes: the image measurement differs from the policy, the endpoint is quarantined within one cycle and its credential is deleted |
| Is a device that cannot attest refused? | Yes, on every cycle |
| Do the algorithms match the standard? | 265 of 265 NIST vectors on each platform tested |
| Does the fabric accelerator speed anything up? | The first one does not: it is correct, but moving data over the bus costs more than the 0.48 microseconds the permutation takes, and ML-DSA-65 sign goes from 14.3 to 15.5 ms ([lab 49](/projects/fpga-soc/microchip-polarfire-soc/aegis/post-quantum-in-fabric/a03-fabric-accelerator/)). The second does: ML-KEM-768 1.26 to 1.29 times and ML-DSA-65 1.19 to 1.54 times faster than software, with all 265 NIST vectors passing ([lab 54](/projects/fpga-soc/microchip-polarfire-soc/aegis/post-quantum-in-fabric/a08-sponge-accelerator/)) |
| Cost of the accelerator | First version: the whole design uses 36,373 logic elements (38.9 %), 2.06 ns worst slack. Second: 44,191 (47.3 %), 1.33 ns worst slack; timing met in every corner for both |
| Full re-attestation time over Ethernet | 0.30 s for the quote itself; 7.7 KB signed quote |
| Linux user-space interrupt response | 54 microseconds mean, 0.36 to 0.47 ms worst with a real-time priority on a pinned core; up to 5 ms without it. See [the lab](/projects/fpga-soc/microchip-polarfire-soc/aegis/linux-timing/a06-linux-latency-scheduling/) |

Limits, stated plainly:

- **No network enforcement on the real gateway.** It decides but does not block traffic, because one port cannot separate
  networks. The kernel and the rules exist and the rules are tested in [namespaces](/projects/fpga-soc/microchip-polarfire-soc/aegis/enforcement/a07-enforcement-without-a-switch/); the switch does not.
- **The gateway's key is software.** Linux file permissions protect it, and enrolment is trust on first use.
- **Development keys on the endpoint,** in the open product state. Only the ML-DSA signature from the device key is
  security-relevant; the TF-M attestation key is a published one.
- **Per-chip uniqueness of the device key is not shown,** because there is a single STM32 board.
- **Not evaluated:** side channels, fault injection, power loss during provisioning. ML-DSA signing is deterministic.
- Everything was measured on one set of boards.
- The code is public: [github.com/ismailalitech/aegis](https://github.com/ismailalitech/aegis). The labs run from it.
