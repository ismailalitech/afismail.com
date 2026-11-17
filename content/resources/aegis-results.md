+++
title = "Aegis results and evidence"
description = "Every check of the Aegis gateway, its method, result and record, and the defects found along the way."
weight = 71

[params]
  topics = ["Reference"]
  toc = true
+++

Last updated 2026-11-17, repository release [v0.2.0](https://github.com/ismailalitech/aegis/releases/tag/v0.2.0). Evidence classes: **SIM** (simulation), **HOST** (a check on a PC), **BUILD** (tool output) and **BOARD** (measured on the physical boards). A result is claimed only in the class that produced it. Raw records that are small enough to publish are in [`evidence/console/`](https://github.com/ismailalitech/aegis/tree/main/evidence/console) of the repository; the figures in this page that come from Libero are screenshots, listed in [`docs/figures/`](https://github.com/ismailalitech/aegis/tree/main/docs/figures).

The whole-system check is `tools/regression.sh --board`: thirteen stages, five on the PC and eight on the boards. The five PC stages and the enforcement test also run on every push in GitHub Actions on a clean machine.

## 1. Results by check

| ID | Check | Class | Method | Result | Record |
|---|---|---|---|---|---|
| A1 | Algorithms against the NIST vectors, PC | HOST | liboqs 0.16.0 driven by the ACVP-Server v1.1.0.41 files, checked against recorded checksums | all cases pass | CI run; `vectors/acvp/SHA256SUMS` |
| A2 | Algorithms with the fabric hashing | BOARD | the same vectors on the PolarFire with every Keccak permutation done in the fabric | digests equal the reference; 4,657,147 permutations compared with software, 0 differences | regression stage `fabric-acvp` |
| A2b | Algorithms with the second accelerator | BOARD | the same vectors through liboqs with every SHA-3 and SHAKE call on the sponge block (8 slots, and 1 slot) | 265 of 265 both ways; ML-KEM-768 and ML-DSA-65 known-answer outputs byte-identical to plain liboqs | regression stage `fabric-sponge-acvp`; `evidence/accel-v2/` |
| A3 | Algorithms on the STM32 | BOARD | the secure partition's source and configuration in a temporary test image, over the console | 265 of 265 cases pass in 357 s | notes, phase 3 |
| A4 | Fabric self-test | BOARD | `pqc_selftest 500`: Keccak and both NTTs against C references | 0 mismatches in 500 each; forward then inverse in hardware: 0 failures | regression stage `fabric-selftest` |
| B1 | Accelerator RTL | SIM | `hw/tb/run_all.sh`; Python models judge the testbench | 380,925 APB transfers, 114,294 checks, 0 errors; Keccak 24 cycles, NTT 904 and 1,032 cycles | [waveform figure](/projects/fpga-soc/microchip-polarfire-soc/aegis/post-quantum-in-fabric/a03-fabric-accelerator/); `hw/tb/make_wave.sh` |
| B2 | Build and timing | BUILD | Libero SoC 2026.1, place and route, multi-corner timing | met in all corners; worst slack 1.021 ns (125 MHz) and 2.056 ns (50 MHz); 34,551 LUTs (36.95 %), 36,373 logic elements (38.9 %) | Libero report screenshots |
| B3 | Accelerator speed | BOARD | liboqs `speed_kem` and `speed_sig` on one U54, software Keccak against fabric Keccak | the fabric is 8 to 12 % slower end to end; Keccak 0.48 us in the core, 16.7 us seen by Linux | notes, phase 2 |
| B4 | Second accelerator RTL | SIM | `hw/tb/run_all.sh`: a 4,500-operation script from a Python model, against an AXI memory model with random waits and an error range | 3,251 checks, 835 DMA beats, no difference; five planted RTL bugs each detected | [waveform figure](/projects/fpga-soc/microchip-polarfire-soc/aegis/post-quantum-in-fabric/a08-sponge-accelerator/); `hw/tb/make_wave_dma.sh` |
| B5 | Second accelerator: build and timing | BUILD | Libero SoC 2026.1, design 102 | met in all corners; worst slack 1.329 ns (125 MHz) and 2.312 ns (50 MHz); 44,191 logic elements (47.3 %) | [Libero screenshots](/projects/fpga-soc/microchip-polarfire-soc/aegis/post-quantum-in-fabric/a08-sponge-accelerator/) |
| B6 | Second accelerator: speed | BOARD | liboqs `speed_kem` and `speed_sig` on one U54, software against the sponge block, two runs each | ML-KEM-768 1.26 to 1.29 times faster; ML-DSA-65 key pair 1.54, verify 1.47, sign 1.19 (1.27 in another run); the cost model with measured constants within 2.5 % | `evidence/accel-v2/after-fix/speed.md` |
| C1 | Gateway quote | BOARD | `host/aegis_verify.py quote` | accepted; 3,309-byte signature; 0.039 s | `evidence/console/quote-accepted.json` |
| C1b | Gateway device certificate | BOARD | system service read with the read-only tool; on export the system controller checks the certificate against Microchip's public key, the serial number and the factory key | status 0: valid and consistent with the device; 976-byte X.509 inside the 1,024-byte response. Not verified off-board: Microchip's issuing key is not published | re-read 2026-11-17 |
| C2 | Endpoint quote over Ethernet | BOARD | `PQKEY` and `PQCHAL` from the PC | key in 6 ms; quote with a 515-byte token and a 3,309-byte signature in 0.30 s | notes, phase 3 |
| C3 | Admission with a session | BOARD | gateway journal over repeated cycles | ADMITTED, credential issued, heartbeat rising each cycle | [journal figure](/projects/fpga-soc/microchip-polarfire-soc/aegis/attesting-an-endpoint/a05-quarantine-and-red-team/) |
| C4 | Modified firmware | BOARD | `tools/demo.sh`: a validly signed modified non-secure image, then the good one | QUARANTINED on the measurement, credential revoked; ADMITTED again with a new session; two clean runs | `evidence/console/demo-journal.txt` |
| C5 | Device that cannot attest | BOARD | an Arduino Uno through a PC relay | QUARANTINED every cycle | journal |
| C6 | Device that disappears | BOARD | the bench unplugged | STM32 QUARANTINED, credential revoked ("No route to host"); Uno QUARANTINED | `evidence/console/disconnected-journal.txt` |
| C7 | Mutual authentication | BOARD | `tests/board/mutual_auth_checks.py` | credentials from a foreign key, or for another ciphertext, refused with error -149; session unchanged | [case study](/projects/fpga-soc/microchip-polarfire-soc/aegis/attesting-an-endpoint/k03-anyone-could-end-a-session/) |
| C8 | Hedged signing and KMAC256 heartbeats, deployed | BOARD and HOST | staged deployment with a backup: gateway code, then image, then policy; PC tests of both changes | same key after the new image; new image quarantined until the policy names it, then admitted with KMAC heartbeats; regression 12 of 12 before and after; the partition's code signs one message twice with two different valid signatures (PC); KMAC equal to NIST's samples on both sides | [lab 55](/projects/fpga-soc/microchip-polarfire-soc/aegis/attesting-an-endpoint/a09-harden-a-running-endpoint/); `evidence/console/hardening-journal.txt` |
| C9 | Two chips, two keys | BOARD | a second STM32H573 with the same firmware, option bytes and boot loader | ML-DSA keys differ in 1,941 of 1,952 bytes; PSA identity identical (development provisioning); the second board refused under the first board's name, admitted with its own key | [lab 56](/projects/fpga-soc/microchip-polarfire-soc/aegis/attesting-an-endpoint/a10-two-chips-two-keys/); `evidence/two-boards/` |
| D1 | Red team: parsers and verifier | HOST | `tests/redteam/fuzz_host.py` | 3,000 mutated tokens: 0 accepted, 0 unexpected exceptions; 310 malformed frames: service still answers; 800 hostile replies: 0 admitted; downgrade and key replay refused | [lab 51](/projects/fpga-soc/microchip-polarfire-soc/aegis/attesting-an-endpoint/a05-quarantine-and-red-team/) |
| D2 | Red team: real devices | BOARD | `tests/redteam/fuzz_devices.py` | STM32: 76 malformed commands refused, a genuine quote still verifies; gateway: 240 malformed frames and a half-open client, quote valid in 72 ms | regression stage `device-redteam` |
| E1 | Enforcement ruleset | HOST | `tests/host/test_enforcement.sh`: three network namespaces, the real ruleset and hook | 10 of 10; the first run failed 1 of 10 (an open connection survived quarantine) | [lab 53](/projects/fpga-soc/microchip-polarfire-soc/aegis/enforcement/a07-enforcement-without-a-switch/) |
| E2 | Packet-filtering kernel | BOARD | installed and rebooted twice | boots in about 25 s; filtering, bridge and VLAN options on; regression 12 of 12 afterwards | [case study](/projects/fpga-soc/microchip-polarfire-soc/aegis/enforcement/k05-a-kernel-install-that-replaced-lib/) |
| F1 | Linux interrupt latency | BOARD | `pfdaq_lat`, 100,000 events per run at a 500 us period, five setups | default: 24 and 37 overruns, maximum 3.6 to 4.9 ms; real-time priority on a pinned core: 0 overruns, maximum 0.36 to 0.47 ms; under full load: 3 and 0 overruns, maximum 1.47 and 0.41 ms | `evidence/console/latency-runs.txt` |
| G1 | Whole system | BOARD | `tools/regression.sh --board` | 13 of 13 with design 102 (12 of 12 before the stage for the second accelerator) | `evidence/console/regression-12of12.txt`; `evidence/accel-v2/regression-design102.txt` |

## 2. Defects found by the checks

| Found by | Defect | Fixed |
|---|---|---|
| Red-team harness | A token with a changed unprotected field was accepted (no forgery; the format requires a map) | the parser rejects wrong field types |
| A 9 min 45 s harness run | One slow client stalled the quote service | threads, a 3 s timeout; [case study](/projects/fpga-soc/microchip-polarfire-soc/aegis/attesting-an-endpoint/k04-one-slow-client-stalled-the-service/) |
| Writing the negative tests | A key-exchange start ended an established session | a session is replaced only by a completed exchange; [case study](/projects/fpga-soc/microchip-polarfire-soc/aegis/attesting-an-endpoint/k03-anyone-could-end-a-session/) |
| Enforcement test | Quarantine did not cut open connections | direction-specific accept rules; [lab 53](/projects/fpga-soc/microchip-polarfire-soc/aegis/enforcement/a07-enforcement-without-a-switch/) |
| First kernel install | `/lib` replaced by a real directory | the installer extracts under `/usr`; [case study](/projects/fpga-soc/microchip-polarfire-soc/aegis/enforcement/k05-a-kernel-install-that-replaced-lib/) |
| Service reads | The chip refused signing services | the gateway key is made in software; [case study](/projects/fpga-soc/microchip-polarfire-soc/aegis/identity-and-quotes/k01-chip-is-not-an-s-device/) |
| First build of the prover | A veneer-address mismatch faulted on the first secure call | a matching pair was installed; [case study](/projects/fpga-soc/microchip-polarfire-soc/aegis/attesting-an-endpoint/k02-veneers-at-different-addresses/) |

## 3. Limits

- **No network enforcement on the real gateway.** One Ethernet port and a processor USB controller that is not routed to a connector mean a managed 802.1Q switch is needed. The rules are tested; the placement is not.
- **The gateway's key is software.** The chip is the part without the data-security block.
- **Development keys on the endpoint,** in the open product state; the attestation key of TF-M is a published one. Only the ML-DSA signature is security-relevant.
- **Trust on first use** for both enrolments.
- **Two endpoint chips,** so per-chip uniqueness of the device key is shown on two chips, not on a population.
- **Not evaluated:** side channels, fault injection, power loss during provisioning. ML-DSA signing is hedged since lab 55; that it is hedged is shown on the PC, not observable on the board (each quote's PSA token differs anyway).
- Latency figures are two runs per setup, with the gateway services running and no heavy network or SD traffic.
- Everything was measured on one set of boards.
