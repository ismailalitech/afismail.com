+++
title = "Post-quantum attestation gateway on PolarFire SoC"
description = "A PolarFire SoC decides which devices on a network may be trusted, from signed evidence that their secure hardware produces, using the NIST post-quantum algorithms ML-DSA-65 and ML-KEM-768."
date = '2026-11-17T00:30:00+01:00'
draft = false
weight = 20

[params]
  project = true
  platform = "Microchip PolarFire SoC, STMicroelectronics STM32H5, NXP RW612 and AMD Zynq UltraScale+"
  problem = "A network usually trusts a device because it is plugged in. A device should earn access by proving what it is and what firmware it runs, and keep proving it, with signatures that a future quantum computer cannot forge."
  role = "Designed and built the complete system: the gateway services, the fabric accelerator and its tests, the secure partition on the endpoint, the attestation and provisioning protocol, the red-team harness and the regression."
  result = "A signed endpoint is admitted and holds an ML-KEM session; a validly signed but modified firmware image is quarantined within one cycle and its credential revoked; an Arduino that cannot attest is quarantined every cycle; NIST test vectors pass on three platforms; 13 of 13 regression stages pass."
  hardware = "Microchip PolarFire SoC Discovery Kit (MPFS095T) as the gateway, two STM32H573I-DK, an NXP FRDM-RW612 and a Trenz TE0807 (Zynq UltraScale+ XCZU4EG) on a TEBF0808 carrier as attested endpoints, Arduino Uno R3 as a device that cannot attest"
  tools = "Libero SoC 2026.1, TF-M v2.3.0, Zephyr v4.5.0, Vivado and Vitis 2025.2, TF-A, OP-TEE 4.7, liboqs 0.16.0, mldsa-native, mlkem-native, Icarus Verilog, Python"
  action = "/resources/aegis-explorer/"
  action_text = "Explore the architecture"
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
| NXP FRDM-RW612 | An attested endpoint from a second vendor | A die key in its EdgeLock Secure Subsystem, and Ethernet. First a Zephyr prover that measures itself (device-key trust); then TF-M with the prover in a TrustZone secure partition, hardened and reviewed (trustzone trust) |
| Trenz TE0807 (XCZU4EG) on a TEBF0808 | An attested Linux endpoint | A PUF, the CSU's AES and SHA-3, and Cortex-A53s with TrustZone. First a Linux prover (software trust); then OP-TEE holding the key (trustzone-devkey); then a key bound to the chip's PUF without fuses, with measurements from the boot chain (trustzone trust) |
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
  signs the TF-M attestation token and the gateway's challenge, performs the ML-KEM exchange, verifies the
  gateway's credential against a key pinned in the secure image, and ends the session on a clock of its own when the
  credential's lifetime has passed.
- **Fabric accelerator.** A Keccak-f[1600] round engine and an NTT unit in the FPGA, checked against C references and
  against the NIST vectors with every Keccak permutation done in the fabric; then a second version that keeps the hash
  state in the fabric and squeezes whole blocks into memory by DMA, measured faster than software.
- **A second chip family.** A Zephyr prover for the NXP RW612 that derives its ML-DSA-65 key from the die key inside
  the chip's EdgeLock Secure Subsystem and speaks the same protocol, then the same protocol code in a TF-M secure
  partition with the chip's peripherals closed to the network firmware; the protocol code is tested on the PC against
  the gateway's own code and fuzzed against a model.
- **A Linux endpoint with a key from the PUF.** On a Zynq UltraScale+: a boot chain and kernel built from source, the
  accelerator in the PL, the protocol as an OP-TEE trusted application, and an FSBL hook that derives the key under a
  device key only this chip's PUF recovers, with no eFUSE written.
- **A legacy node and a verifier.** An Arduino sketch that answers every request with a statement that it cannot
  attest, and a PC tool that checks the gateway's own quote.
- **Red-team harness and regression.** Mutated tokens, malformed frames, hostile replies, downgrade and replay attempts,
  and one command that runs everything on the real boards.

## Architecture

![The system: a PC checks the gateway quote; the PolarFire gateway runs aegisd and aegis-fleet, reads the system controller and can use the fabric accelerator; an NXP RW612, two STM32s and a Zynq UltraScale+ are attested over Ethernet, the Arduino Uno through a PC relay](/aegis/diagrams/system-overview.svg)

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
6. The session ends on both sides. The gateway renews the credential five minutes before its hour is up; if it does
   not, the endpoint's secure side ends the session itself, on its own clock, a sixteenth of the lifetime later
   ([lab 65](/projects/fpga-soc/microchip-polarfire-soc/aegis/attesting-an-endpoint/a18-the-endpoint-ends-its-session/)).

![One decision cycle: challenge, evidence, checks, then ADMITTED with an ML-KEM exchange and a session, or QUARANTINED with a reason](/aegis/diagrams/decision-cycle.svg)

The [architecture explorer](/aegis/explorer/) shows every component and connection, plays this cycle and six other walks
step by step, and replays verdict lines the gateway recorded.

The fabric half of the system, as the vendor's tool shows it: the block `aegis_pqc_0` sits on the same APB bus as the
project's other registers, next to the two peripheral blocks and the processor subsystem.

![The top-level SmartDesign canvas in Libero SoC, zoomed on the aegis_pqc block, with numbered callouts on it, FIC_3_PERIPHERALS, FIC_0_PERIPHERALS and the processor subsystem](/aegis/diagrams/libero-canvas-annotated.svg)

The parts are listed at the top of this page in the order a reader would work through them: how attestation works, the
bench, the gateway's identity, the fabric accelerator, the endpoints, the Zynq UltraScale+ endpoint, enforcement and
Linux timing. Each lab ends with what to
check and where it can go wrong, and the case studies record defects that were found and fixed. The threats, and what
answers each one, are summed up in [what Aegis defends against](/projects/fpga-soc/microchip-polarfire-soc/aegis/trust-model/x04-what-aegis-defends-against/);
the full list is the project's [threat model](https://github.com/ismailalitech/aegis/blob/main/docs/threat-model.md).

## Verification

Three kinds of evidence, kept apart:

- **Standard vectors.** The NIST ACVP vectors (ACVP-Server v1.1.0.41) for ML-KEM-768 and ML-DSA-65: 265 of 265 cases on
  the PC and on the STM32 Cortex-M33 code, and the same on the PolarFire with every Keccak permutation done in the
  fabric.
- **Attack harness.** 3,000 mutated tokens, 310 malformed frames to the gateway, 800 hostile endpoint replies, 76
  malformed commands to the STM32, downgrade and key-replay attempts. Two real defects were found and fixed.
- **Enforcement rules.** Three network namespaces stand in for the gateway, an endpoint and the network; the real ruleset
  and hook ran in them. The first run found that quarantine did not cut an open connection, and a later one that the rules dropped
  replies to the gateway's own connections; both fixed, 13 of 13 checks pass. The one-port VLAN design: 16 of 16.
- **Whole system.** A regression that runs the host stages and the board stages: 13 of 13 pass, 14 of 14 with the
  optional stage that lets each endpoint's session run out. The five host stages and the enforcement test also run on every push on a clean machine in GitHub Actions.

Every number is traced to a record with its method: [results and evidence](/resources/aegis-results/).

## State of the bench

What each board runs on 19 November 2026, and what is still open on it.

| Board | Runs | Gateway's verdict | Still open |
|---|---|---|---|
| PolarFire SoC Discovery Kit | `aegisd` and `aegis-fleet`; fabric design 102 with the second accelerator; a kernel with packet filtering and VLANs; the hardware watchdog driven by systemd, lock-ups turned into panics | the gateway's own quote accepted by the PC | no VLAN switch, so no enforcement; the cause of the overnight hang |
| STM32H573I-DK, boards 1 and 2 | TF-M v2.3.0 with the Aegis partition (SPE `02549860...`), non-secure prover 0.6.0; heartbeats carry `sstack=` and `ttl=` | admitted, each with its own session | open product state with development keys; isolation level 1 |
| NXP FRDM-RW612 | NXP's TF-M v2.1.4 with the Aegis partition 0.2.2; heartbeats carry `stack=`, `clk=` and `ttl=` | admitted, trustzone trust | no secure boot fused; isolation level 2 |
| Trenz TE0807 (Zynq UltraScale+) | our boot chain, encrypted under a key the PUF protects; OP-TEE with the Aegis trusted application | trustzone trust when last attested ([lab 63](/projects/fpga-soc/microchip-polarfire-soc/aegis/zynq-ultrascale-endpoint/a16-a-key-from-the-puf/)) | phase C (the PMU firmware, XMPU and XPPU lock-down, a restricted `/dev/mem`, a better random seed, probes from Linux) prepared, not on the board; the session's end built, not deployed; no tamper test yet with the boot-chain measurements |
| Arduino Uno R3 | a sketch that answers that it cannot attest | quarantined every cycle | nothing: it is the device that must be refused |

## Results and limits

| Question | Answer |
|---|---|
| Is a good endpoint admitted? | Yes, with an ML-KEM session and heartbeats every cycle |
| Is modified firmware caught if it is validly signed and boots normally? | Yes: the image measurement differs from the policy, the endpoint is quarantined within one cycle and its credential is deleted |
| Is a device that cannot attest refused? | Yes, on every cycle |
| Do the algorithms match the standard? | 265 of 265 NIST vectors on each platform tested |
| Does the fabric accelerator speed anything up? | The first one does not: it is correct, but moving data over the bus costs more than the 0.48 microseconds the permutation takes, and ML-DSA-65 sign goes from 14.3 to 15.5 ms ([lab 49](/projects/fpga-soc/microchip-polarfire-soc/aegis/post-quantum-in-fabric/a03-fabric-accelerator/)). The second does: ML-KEM-768 1.26 to 1.29 times and ML-DSA-65 1.19 to 1.54 times faster than software, with all 265 NIST vectors passing ([lab 54](/projects/fpga-soc/microchip-polarfire-soc/aegis/post-quantum-in-fabric/a08-sponge-accelerator/)) |
| Cost of the accelerator | First version: the whole design uses 36,373 logic elements (38.9 %), 2.06 ns worst slack. Second: 44,191 (47.3 %), 1.33 ns worst slack; timing met in every corner for both |
| Can a Linux board hold a key bound to its chip without writing a fuse? | Yes, on the Zynq UltraScale+: the PUF in boot-header mode, the key derived in the FSBL and used only by OP-TEE; the same key after a power cycle, the eFUSE cache unchanged. Phase C, which keeps Linux away from the device key, is not done ([lab 63](/projects/fpga-soc/microchip-polarfire-soc/aegis/zynq-ultrascale-endpoint/a16-a-key-from-the-puf/)) |
| Does a session end if the gateway stops renewing it? | Yes, on both STM32s and the RW612: the secure side ends it on its own clock after the credential's lifetime plus a sixteenth; a 32-second credential was refused after its end on each, while attestation kept working. The STM32's clock runs 6 % slow, which lengthens an hour's session to about 68 minutes. Built but not yet on the Zynq UltraScale+ ([lab 65](/projects/fpga-soc/microchip-polarfire-soc/aegis/attesting-an-endpoint/a18-the-endpoint-ends-its-session/)) |
| Full re-attestation time over Ethernet | 0.30 s for the quote itself; 7.7 KB signed quote |
| Linux user-space interrupt response | 54 microseconds mean, 0.36 to 0.47 ms worst with a real-time priority on a pinned core; up to 5 ms without it. See [the lab](/projects/fpga-soc/microchip-polarfire-soc/aegis/linux-timing/a06-linux-latency-scheduling/) |

Limits, stated plainly:

- **No network enforcement on the real gateway.** It decides but does not block traffic, because one port cannot separate
  networks. The kernel and the rules exist and the rules are tested in [namespaces](/projects/fpga-soc/microchip-polarfire-soc/aegis/enforcement/a07-enforcement-without-a-switch/); the switch does not.
- **The gateway's key is software.** Linux file permissions protect it, and enrolment is trust on first use.
- **Development keys on the endpoint,** in the open product state. Only the ML-DSA signature from the device key is
  security-relevant; the TF-M attestation key is a published one.
- **The Zynq UltraScale+ key is partly tested.** The red key that the PUF protects is on the build PC; without fuses
  the boot ROM does not check who signed the image; Linux is not yet kept away from the device key (phase C, prepared
  in the repository but not yet on the board); the kernel is not measured; OP-TEE's random numbers come from a timer-seeded software generator
  ([lab 63](/projects/fpga-soc/microchip-polarfire-soc/aegis/zynq-ultrascale-endpoint/a16-a-key-from-the-puf/)).
- **Per-chip uniqueness of the device key is shown on two chips, not on a population** ([lab 56](/projects/fpga-soc/microchip-polarfire-soc/aegis/attesting-an-endpoint/a10-two-chips-two-keys/)).
- **Not evaluated:** side channels, fault injection, power loss during provisioning. ML-DSA signing is hedged since [lab 55](/projects/fpga-soc/microchip-polarfire-soc/aegis/attesting-an-endpoint/a09-harden-a-running-endpoint/).
- **The gateway hung once for seven hours, cause unknown.** It now resets itself through the hardware watchdog, and a
  lock-up becomes a panic whose reason a PC records
  ([case study](/projects/fpga-soc/microchip-polarfire-soc/aegis/bench-and-reproduce/k15-a-gateway-that-hung-for-seven-hours/)).
- Everything was measured on one set of boards.
- The code is public: [github.com/ismailalitech/aegis](https://github.com/ismailalitech/aegis). The labs run from it.
