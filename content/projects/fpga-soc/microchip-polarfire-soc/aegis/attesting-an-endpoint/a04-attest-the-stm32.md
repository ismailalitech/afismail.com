+++
title = "Attest an STM32 with a post-quantum key from its hardware-unique key"
date = '2026-11-17T00:30:00+01:00'
draft = false
description = "TF-M measures the firmware, a secure partition signs the evidence with an ML-DSA-65 key derived from the chip's hardware-unique key, and the gateway admits the device and gives it an ML-KEM session."
weight = 10

[params]
  lab = 50
  board = "STM32H573I-DK and PolarFire SoC Discovery Kit"
  core = "Cortex-M33 (Secure and Non-Secure) and U54 (Linux)"
  level = "Advanced"
+++

After this lab you can follow one decision cycle from the evidence the STM32's secure world produces to the gateway's verdict,
you know which key signs what and where it comes from, and you know which parts of the chain are real and which still use
development keys.

## Before you start

- The bench from [reproduce the bench](/projects/fpga-soc/microchip-polarfire-soc/aegis/bench-and-reproduce/a01-reproduce-the-bench/):
  the gateway running, the endpoint flashed, the policy written.
- **Level 3.** Know what a TrustZone secure and non-secure world are, and what a measured boot records.

## The idea

TF-M's boot loader (MCUboot, BL2) verifies each signed image and **measures** it: it records the image's hash and the id of the
key that signed it. TF-M's Initial Attestation service puts those records into a signed token (a COSE structure) together
with a challenge it was given. The token says: this is what I booted, and I answered this question.

That token alone is not post-quantum, and on this bench its signing key is TF-M's published development key, so anyone could
forge it. So the endpoint adds a second signature: an **ML-DSA-65** signature over the token, made by a key that never leaves
the secure world and is derived from the chip's *hardware-unique key* (DHUK). The gateway checks both the measurements in the
token and the signature over it.

| Piece | Where | Real or development |
|---|---|---|
| Image measurements and signer ids | BL2 and the attestation service | real measurements, **published development signing keys** |
| Token signature (ES256) | TF-M attestation key | **development key**, published |
| Quote signature (ML-DSA-65) | the Aegis secure partition | real: derived from the DHUK, never leaves the secure side |
| Session and credentials (ML-KEM-768) | the same partition | real |

Only the ML-DSA signature carries security. The development keys are listed on the
[project page](/projects/fpga-soc/microchip-polarfire-soc/aegis/) among the limits.

## The device key

At partition start-up the secure world encrypts a fixed 32-byte label with AES-256 under the hardware-unique key (the SAES
peripheral with the key selected from hardware) and uses the result as the seed for ML-DSA-65 key generation
(mldsa-native, deterministic). The seed is wiped after key generation.

Checks done on the board: the same public key on three boots; a key that differs from the ones an all-zero, an all-ones or a
label-only seed would give, which is consistent with the hidden key being used; and the same key before and after an image
update, because it comes from the chip and not from the image. **Per-chip uniqueness is not shown**, because there is only one
chip.

## One cycle

The gateway talks to the prover's TCP port with a line protocol:

```text
CHAL   <64 hex digits>   ->  TOKEN   <length> <hex> END                    classic TF-M token only
PQKEY                    ->  PQKEY   <length> <hex> END                    the device's ML-DSA-65 public key
PQCHAL <64 hex digits>   ->  PQTOKEN <token length> <hex> <signature length> <hex> END
```

The Aegis gateway uses `PQKEY` once to enrol and `PQCHAL` every cycle. `CHAL` returns the classic token without the
post-quantum signature and is kept for comparison.

1. **Challenge.** The gateway sends 32 fresh random bytes with `PQCHAL`.
2. **Quote.** The secure partition returns the PSA token (515 bytes) and an ML-DSA-65 signature of 3,309 bytes over the string
   `aegis-endpoint-quote-v1` followed by the token. Over Ethernet the whole quote takes 0.30 s; the public-key request takes
   6 ms. (Over the earlier serial relay it took 1.06 s, because the 7.7 KB crossed a 115,200-baud console.)
3. **Checks.** The gateway verifies the signature with the key it enrolled the first time, the challenge in the token, and
   every software component's measurement and signer id against the policy. The first time, the key is accepted by *trust on
   first use*; after that a different key is a failure.
4. **Verdict.** All checks pass: **ADMITTED**. Any failure: **QUARANTINED**, with the reasons.

## Provisioning and a session

After an admission with no valid credential, the gateway runs an ML-KEM-768 exchange:

1. The endpoint derives a fresh ML-KEM key pair (from a second secret derived from the hardware-unique key, the gateway's nonce
   and a counter) and signs the nonce and the public key with its ML-DSA-65 key.
2. The gateway verifies that signature, encapsulates, and sends the ciphertext with a *credential*: endpoint name, key hash,
   measurements, a hash of the ciphertext, an issue time and an expiry one hour later, signed with the gateway's own ML-DSA-65
   key.
3. The endpoint verifies the credential against the gateway key **pinned into its secure image at build time** and checks that
   it names this exchange's ciphertext. A credential signed by another key, or by the real key but for another ciphertext, is
   refused with error -149 and no session is created.
4. It decapsulates, wipes the decapsulation key, and keeps the session key in secure RAM. It returns a confirmation tag, and
   the gateway checks it.

Heartbeats follow every cycle: a counter and a hash over the session key, a fresh nonce, the counter and a short status string
(uptime, link, firmware version). The gateway uses them to check that the endpoint still holds the session; if one fails, it
provisions again. After a reboot the endpoint has lost its session in secure RAM, so the next heartbeat fails and a new session is
issued.

## What to check

- `PQKEY` returns the same key on every call and after a reboot.
- A quote is accepted; change one byte of the signature or send a different challenge and it is refused.
- The gateway journal shows `ADMITTED [credential: valid, heartbeat N ...]` with N rising each cycle.
- The session identifier reported by the endpoint's secure side equals the gateway's.

## Where it can go wrong

- **A new secure image changes the veneer addresses.** The installed secure image (from another build) could not be reproduced
  locally: its secure-gateway veneers were at different addresses, and a Non-Secure app linked against the local build faulted
  on its first secure call. The matching pair was installed instead. Always build the Non-Secure image against the secure
  image you flash.
- **The signing step does not rerun on incremental builds.** The prover's build script always builds from clean and checks that
  the banner is inside the signed image.
- **The policy file goes stale after an image update.** Update the allowed measurements; the service reloads the file every
  cycle.
- **Closing the device.** Do not. The open product state and development keys are what allow recovery, and closing is
  irreversible.

## Limits

Development keys on the endpoint and the attestation key; trust on first use; no isolation between secure partitions
(TF-M isolation level 1); deterministic ML-DSA signing; no side-channel testing. The details are in the project's
[threat model](https://github.com/ismailalitech/aegis/blob/main/docs/threat-model.md).
