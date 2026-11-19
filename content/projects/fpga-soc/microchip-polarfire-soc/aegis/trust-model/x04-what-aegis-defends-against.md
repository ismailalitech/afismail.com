+++
title = "What Aegis defends against, and what it does not"
date = '2026-11-19T12:05:00+01:00'
draft = false
description = "The project's threat model in one page: the attackers it considers and the ones it leaves out, each threat with its defence and the test that shows it, and the limits to state with any claim."
weight = 40

[params]
+++

The project keeps a full threat model in its repository
([`docs/threat-model.md`](https://github.com/ismailalitech/aegis/blob/main/docs/threat-model.md)). This page is the
short version: who the attacker is, what is defended and how it was shown, and what is not claimed. A threat counts as
tested only where a test or a record on the bench shows it.

## What is protected

| Asset | Where it lives |
|---|---|
| The gateway's ML-DSA-65 identity key | a root-only file on the PolarFire's Linux: the chip cannot hold it in hardware ([case study](/projects/fpga-soc/microchip-polarfire-soc/aegis/identity-and-quotes/k01-chip-is-not-an-s-device/)) |
| Each endpoint's ML-DSA-65 device key | derived inside the secure side from a key of the chip: the STM32's hardware-unique key in SAES, the RW612's die key in ELS, the Zynq UltraScale+'s PUF-protected device key |
| The session keys from ML-KEM-768 | the endpoint's secure RAM, and a root-only file per endpoint on the gateway |
| The policy: allowed measurements, enrolled keys, pinned profiles | one file and a key folder on the gateway |
| The measurements | taken by the boot loader (STM32), the secure partition before non-secure code runs (RW612), or the FSBL (Zynq UltraScale+) |

## Who the attacker is

Considered:

- **Someone on the network** who can read, drop, replay, change and inject traffic, and connect to any open port.
- **Someone who controls the endpoint's non-secure side:** any code there, any argument to the secure side's calls,
  and every peripheral the TrustZone set-up leaves to it.
- **An endpoint running modified firmware that still boots,** signed with a key the boot loader trusts or, on the
  RW612, with no secure boot at all.
- **A device that cannot attest**, old or foreign.

Not considered, because they are out of scope or cannot be shown on this bench:

- someone with lab tools at the board: side channels, fault injection, probing;
- someone with root on the gateway;
- someone with a debugger on an endpoint: the STM32s are in the open product state and the RW612 has no secure boot
  fused;
- attacks on the toolchains.

## Threats and what answers them

| Threat | Defence | Shown by | Status |
|---|---|---|---|
| An old quote replayed | a fresh 32-byte challenge in every token | host tests; board checks | tested |
| A quote changed on the way | an ML-DSA-65 signature over the whole token | 3,000 mutated tokens, none accepted ([lab 51](/projects/fpga-soc/microchip-polarfire-soc/aegis/attesting-an-endpoint/a05-quarantine-and-red-team/)) | tested |
| Modified firmware that boots | every measurement checked against the policy; quarantine and a revoked credential | tampered images quarantined on the STM32, the RW612 and the Zynq UltraScale+ | tested |
| A device that cannot attest | no valid quote, no admission | the Arduino quarantined every cycle | tested |
| A downgrade to a classical-only token | post-quantum endpoints must return the ML-DSA quote | red-team harness | tested |
| A swapped ML-KEM key during provisioning | the endpoint signs its key together with the gateway's nonce | host test; red-team key replay | tested |
| A fake gateway | the endpoint checks credentials against a gateway key pinned in its secure image | a credential from another key refused on the board ([lab 50](/projects/fpga-soc/microchip-polarfire-soc/aegis/attesting-an-endpoint/a04-attest-the-stm32/)) | tested |
| A credential replayed from another exchange | it must name this exchange's ciphertext and encapsulation key | the gateway's own captured message replayed and refused, session kept ([case study](/projects/fpga-soc/microchip-polarfire-soc/aegis/attesting-an-endpoint/k09-a-refused-key-exchange-left-half-of-one/)) | tested |
| Ending a session by starting a new exchange | a session is replaced only when an exchange completes; a refused start leaves nothing pending | board; fuzzer seeds on both partitions ([case study](/projects/fpga-soc/microchip-polarfire-soc/aegis/attesting-an-endpoint/k03-anyone-could-end-a-session/)) | tested |
| Replayed heartbeats | a fresh nonce, a rising counter, KMAC256 under the session key | gateway journal; host tests | tested |
| Slow or malformed clients against the gateway | a thread per connection, at most 8, a 3 s timeout | red-team harness ([case study](/projects/fpga-soc/microchip-polarfire-soc/aegis/attesting-an-endpoint/k04-one-slow-client-stalled-the-service/)) | tested |
| Parser and memory bugs on hostile input | strict field types, bounded lines, both partitions fuzzed with sanitizers against a model | about 1.9 million executions with nothing found after the fixes; in CI | tested |
| The gateway's own software or fabric changed | the gateway's quote carries its code hash and design digests | the PC verifier refused after each change until re-enrolled ([lab 48](/projects/fpga-soc/microchip-polarfire-soc/aegis/identity-and-quotes/a02-gateway-identity-and-quote/)) | tested |
| A cloned endpoint key | the key comes from a per-chip secret only the secure side can use | a second STM32 with identical firmware has a different key and is refused under the first one's name ([lab 56](/projects/fpga-soc/microchip-polarfire-soc/aegis/attesting-an-endpoint/a10-two-chips-two-keys/)) | shown on two chips |
| Non-secure code reaching the key or the secure image | TrustZone and peripheral rules on the STM32 and the RW612 | non-secure probes fault or read as zero, each against a control ([lab 58](/projects/fpga-soc/microchip-polarfire-soc/aegis/attesting-an-endpoint/a12-trustzone-on-the-rw612/), [lab 64](/projects/fpga-soc/microchip-polarfire-soc/aegis/attesting-an-endpoint/a17-the-stm32-from-the-non-secure-side/)) | tested |
| One chip, two firmwares: the RW612's single-image prover passing as the TrustZone one | the gateway pins the claims profile per endpoint | host test | tested |
| Re-enrolment silently replacing a pinned key | enrolment keeps existing pins unless forced | host test | tested |
| A secure partition's stack overflowing | TF-M's stack limit faults first; the high-water mark is in every heartbeat | STM32 `sstack=19088/26624`, RW612 `stack=19384/32768` | measured |
| Cloning the Zynq UltraScale+ key, or using it from Linux | the key derived in the FSBL under the PUF-protected device key and used only by OP-TEE | the same key across a power cycle; Linux-side probes and the lock-down are phase C, not done ([lab 63](/projects/fpga-soc/microchip-polarfire-soc/aegis/zynq-ultrascale-endpoint/a16-a-key-from-the-puf/)) | partly tested |
| A session that outlives its credential | the endpoint's secure side ends it on its own clock | a 32 s credential refused after its end on both STM32s and the RW612 ([lab 65](/projects/fpga-soc/microchip-polarfire-soc/aegis/attesting-an-endpoint/a18-the-endpoint-ends-its-session/)); not yet on the Zynq UltraScale+ | tested on three endpoints |
| An unattested device keeping network access | nftables rules and a one-port VLAN design | 13 of 13 and 16 of 16 in network namespaces ([lab 53](/projects/fpga-soc/microchip-polarfire-soc/aegis/enforcement/a07-enforcement-without-a-switch/), [lab 59](/projects/fpga-soc/microchip-polarfire-soc/aegis/enforcement/a08-one-port-and-a-vlan-switch/)); the bench has no VLAN switch | design tested, placement not |

## The limits to state with any claim

1. **Development keys, no closed device.** The STM32s run TF-M's published signing keys in the open product state;
   the RW612 has no secure boot fused; the Zynq UltraScale+ boot ROM does not check who signed its image without a
   fuse. Closing a device is irreversible and is not done on this bench.
2. **The TF-M attestation key on the STM32 is a published one.** Only the ML-DSA-65 signature from the device key
   counts.
3. **The gateway's key is software,** and both enrolments are trust on first use.
4. **Partition isolation:** TF-M level 1 on the STM32, level 2 on the RW612.
5. **Side channels and fault injection are not evaluated.** ML-DSA signing is hedged.
6. **No enforcement on the real gateway** until a VLAN switch is in place.
7. **The endpoints have no wall clock.** A session ends after a length of time on the endpoint's clock; a clock that
   someone can slow lengthens it.
8. **The fabric accelerator is a performance block,** not a security mechanism; the gateway's services run in
   software.

Every result is listed with its method and record on the [results page](/resources/aegis-results/).
