+++
title = "Measured boot and the attestation token"
date = '2026-11-17T00:30:00+01:00'
draft = false
description = "How the STM32's boot loader turns two firmware images into hashes, how those reach the gateway in a signed token, and how a modified image shows up."
weight = 30

[params]
+++

The state claim of [the first page of this part](/projects/fpga-soc/microchip-polarfire-soc/aegis/trust-model/x01-what-a-device-can-prove/) rests on a measurement made before the software runs. This page follows one measurement from the boot loader to the gateway's decision.

## What gets measured

The STM32H573 runs TF-M v2.3.0. Its first-stage boot loader, BL2 (MCUboot), verifies each signed image before it starts it, and records two things about each image:

- the **SHA-256 hash of the image**, taken from the signed image's hash field;
- the **signer id**, the SHA-256 of the public key that signed it.

There are two images: the **secure** image (TF-M and the Aegis partition) and the **non-secure** image (the prover application). TF-M's Initial Attestation service puts both records into every token.

`tools/image_measurement.py` prints the same two values for any signed image file, which is how the gateway's policy is written: the allowed values are the ones the tool prints for the images you built.

## The token

The token is a signed COSE structure, 515 bytes, in the PSA attestation format. What the board returned:

| Claim | Value or meaning |
|---|---|
| Challenge | the 32 bytes the gateway sent, so the token is fresh |
| Instance id | an identifier for this device |
| Implementation id | a dummy value |
| Boot seed | a dummy value |
| Lifecycle | `0x3000`, the PSA value for "secured" |
| Profile | `PSA_IOT_PROFILE_1` |
| Software components | two: secure and non-secure, each with its hash and signer id |

The implementation id and the boot seed are dummy values in this configuration. The lifecycle value does not match the chip's real state: the STM32 was read with a debugger and is in its open product state, which is what keeps the development keys usable and recovery possible, and also means its root of trust is weaker than a closed product's.

## The values on this bench

The tool run on the two images the STM32 runs. These are the exact values in the gateway's policy file:

![The measurement tool prints the image hash and signer id of the secure image and of the non-secure prover; these are the values in the gateway policy, and the two images are signed by two different keys](/aegis/diagrams/console-measurements.svg)

Two things show in the project's own build history. Every build of an image has a new hash, while its signer stays the same,
so the policy has to be updated with each release. And the secure and non-secure images are signed by different keys:

| Image | Hash (first 16 hex digits) | Signer (first 16) |
|---|---|---|
| prover 0.1.0 | `55a370e39454e694` | `82a5b443594853d4` |
| prover 0.1.0, modified for the tamper test | `b8e5a3094da5634f` | `82a5b443594853d4` |
| prover 0.2.0 (post-quantum quote) | `ccae9f5fc9082afe` | `82a5b443594853d4` |
| prover 0.3.0 (ML-KEM credential) | `56ec5b078c037317` | `82a5b443594853d4` |
| prover 0.4.0 (heartbeats) | `ae689ecbd090a33b` | `82a5b443594853d4` |
| prover 0.5.0 (MAC address from the device key), **running** on both boards | `34637a4e23d8b127` | `82a5b443594853d4` |
| prover 0.5.0, modified for the tamper test | `a605d95363214dd7` | `82a5b443594853d4` |
| TF-M v2.3.0 + partition, first | `b9186d3173278df7` | `e30466f6b8470c1f` |
| TF-M v2.3.0 + partition, with ML-KEM | `227e3c8a5c40dd66` | `e30466f6b8470c1f` |
| TF-M v2.3.0 + partition, with mutual authentication | `380513d6dea90048` | `e30466f6b8470c1f` |
| TF-M v2.3.0 + partition, with heartbeats | `1793b3fb1ff47218` | `e30466f6b8470c1f` |
| TF-M v2.3.0 + partition, hedged signing and KMAC heartbeats, **running** on both boards | `a5997cc3c61af12d` | `e30466f6b8470c1f` |

The modified prover has the same signer as the good one, because it was signed with the same published development key. Only
the hash tells them apart.

## What the gateway checks

Every cycle the gateway verifies all of the following:

1. the ML-DSA-65 signature over the token, with the key enrolled for this endpoint;
2. the challenge in the token against the one it just sent;
3. each software component against the policy file, for both the hash and the signer id.

Any difference is a quarantine, and the reason names the component and the value. In the demo the reason was:

```text
QUARANTINED component NSPE not allowed (measurement b89ee37e2add...)
```

## How a modified image shows up

![An image signed with the trusted development key passes the boot loader and boots; its measurement differs from the policy, so the gateway quarantines the endpoint and revokes its credential](/aegis/diagrams/tamper-detection.svg)

The development signing keys of TF-M are published, so anyone can produce an image that the boot loader accepts and that boots normally. What they cannot do is make it have the same hash as the original. That is why the policy lists the hash as well as the signer, and why a quarantine does not depend on the boot loader noticing anything.

The non-secure image of this project is reproducible: building it again gives the same hash, and only its signature differs. That makes a hash in a policy file a stable thing to compare against.

## What this does not cover

- **After boot.** A measurement describes what started. It does not describe what has happened since.
- **Replacement of the boot loader.** BL2 is part of the root of trust. With the device in its open product state, someone with a debugger can replace it; the project says so rather than claiming otherwise.
- **The attestation key.** The token's own signature (ES256) uses TF-M's published development key and proves nothing by itself. The security-relevant signature is the ML-DSA-65 one made by the device key, which is why the quote carries both. See [attest an STM32](/projects/fpga-soc/microchip-polarfire-soc/aegis/attesting-an-endpoint/a04-attest-the-stm32/).
