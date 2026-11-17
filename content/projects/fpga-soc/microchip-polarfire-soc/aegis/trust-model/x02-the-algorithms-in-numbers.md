+++
title = "ML-DSA-65 and ML-KEM-768 in numbers"
date = '2026-11-17T00:30:00+01:00'
draft = false
description = "What the two NIST post-quantum algorithms do in this project, how big their keys and messages are, what they cost on the boards, and how they were checked."
weight = 20

[params]
+++

The project uses two algorithms, each for one job. They replace the classical elliptic-curve signature and key exchange that a large quantum computer could break, and they have a visible cost in bytes and in time. This page puts the numbers in one place.

## One job each

| Algorithm | Standard | Job here | Who holds the private part |
|---|---|---|---|
| **ML-DSA-65** | FIPS 204 | Signatures: the endpoint signs its quote, the gateway signs its quote and its credentials | The secure world of the STM32, and a root-only file on the gateway |
| **ML-KEM-768** | FIPS 203 | Key establishment: the gateway and the endpoint agree a session key | A fresh decapsulation key in the endpoint's secure RAM, wiped after use |

ML-DSA proves who is speaking. ML-KEM gives the two sides a secret that only they know. The session key is then used for the heartbeats that keep an admission alive.

## Sizes

| Item | Bytes | Where it travels |
|---|---|---|
| ML-DSA-65 public key | 1,952 | enrolment, and pinned in the endpoint's secure image |
| ML-DSA-65 signature | 3,309 | in every quote, from both sides |
| ML-KEM-768 encapsulation key | 1,184 | endpoint to gateway at provisioning |
| ML-KEM-768 ciphertext | 1,088 | gateway to endpoint at provisioning |
| Shared secret | 32 | never sent |
| PSA attestation token | 515 | in every endpoint quote |

A post-quantum quote from the endpoint is the 515-byte token plus a 3,309-byte signature, 3.8 KB where a classical signature would add about 64 bytes. On the first bench, where the endpoint's answer crossed a 115,200-baud console, that took 1.06 seconds. Over Ethernet the same quote takes 0.30 s, and the request for the endpoint's public key takes 6 ms.

## Time on the gateway

Measured with liboqs 0.16.0 on one U54 core of the PolarFire (software Keccak):

| Operation | Time |
|---|---|
| ML-KEM-768 key generation | 1.219 ms |
| ML-KEM-768 encapsulation | 1.417 ms |
| ML-KEM-768 decapsulation | 1.755 ms |
| ML-DSA-65 key pair | 3.99 ms |
| ML-DSA-65 sign (mean) | 14.3 ms |
| ML-DSA-65 verify | 4.12 ms |

Verification is what the gateway does most, and at about 4 ms it is cheap. Signing is the expensive operation. The endpoint signs every quote, and the gateway signs its own quote and each credential it issues. With the fabric doing the hashing these figures are 8 to 12 percent worse, for the reasons in [lab 49](/projects/fpga-soc/microchip-polarfire-soc/aegis/post-quantum-in-fabric/a03-fabric-accelerator/).

## Where the keys come from

![How the endpoint's keys are made: the hardware-unique key, through AES-256 in the SAES peripheral, seeds the ML-DSA-65 key; a second secret seeds a fresh ML-KEM-768 pair for each exchange](/aegis/diagrams/key-derivation.svg)

The ML-DSA key is the same after every boot and after an image update, because it comes from the chip and not from the image. The ML-KEM pair is different for every exchange, so a recorded exchange cannot be replayed against a later one. Both are derived deterministically from their seeds.

## How they were checked

The NIST algorithm validation vectors (ACVP-Server v1.1.0.41) cover key generation, signing, verification, encapsulation and decapsulation. The same vectors were run on three platforms:

| Platform | Result |
|---|---|
| The PC, with liboqs | all cases pass |
| The PolarFire, with every Keccak permutation done in the fabric | digests equal the reference; 4,657,147 permutations compared with software, 0 differences |
| The STM32 Cortex-M33, with the code of the secure partition | 265 of 265 cases pass (357 seconds over the console) |

The STM32 test image was a separate temporary build that links the same source and the same configuration headers as the secure partition. It is the same code, not the same binary, and the page says so.

## What is not claimed

The endpoint signed deterministically at first, with no fresh randomness in its signatures; since [lab 55](/projects/fpga-soc/microchip-polarfire-soc/aegis/attesting-an-endpoint/a09-harden-a-running-endpoint/) it signs hedged, with 32 random bytes per signature, as FIPS 204 recommends. Side-channel resistance of these implementations on these cores was not evaluated. Passing the vectors shows the arithmetic is right; it does not show the code is constant-time.
