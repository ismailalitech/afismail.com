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
