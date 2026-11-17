+++
title = "The chip is not an S device"
date = '2026-11-17T00:30:00+01:00'
draft = false
description = "Two system services refused every request, the tools printed a name ending in S, and the plan for a hardware-held gateway key had to change."
weight = 20

[params]
+++

The first plan for the gateway's identity was to sign with a key held inside the chip. The chip refused. This page records how that was found, why the first reading was wrong, and what the design uses instead.

## Symptom

The gateway reads the PolarFire's system services through a read-only whitelist. Most of them answered. Two did not:

| Service | Result |
|---|---|
| PUF emulation | status 255, three different challenges |
| Signature with the chip's key | status 255, in both the raw and the DER variants |

The request layout was identical to Microchip's own Linux example, and the other services, which use the same layout, worked. Status 255 is the low byte of a 16-bit status register and is not among the codes the documentation lists for these services.

## A misleading first reading

The programming tool prints `MPFS095TS` as the product, and the device certificate's subject says the same. A name ending in S is the data-security variant, so the first conclusion was that the chip *is* an S part and something was wrong with the requests.

That conclusion was checked against the documents, and it did not hold:

- The kit's user guide, the quick-start guide and the distributors all give the device as **MPFS095T-1FCSG325E**, with no S.
- Microchip's documentation ties the dedicated cryptoprocessor, and the DPA pass-through licence, to devices ordered with the S suffix.
- The two refused services are consistent with services that depend on that hardware; the documentation does not say which code a part without it returns.

The refusals agree with the ordering code, not with the printed name. The design was changed to treat the board as the part without the data-security block.

## What the chip does give

| Available | Not available |
|---|---|
| Device serial number | Signature with a key the chip holds |
| A certificate signed by Microchip for that serial number and a P-384 public key | PUF emulation for software |
| Design information and digests | The user cryptoprocessor (AES, SHA, ECC in hardware) |
| Security lock state | |
| A hardware random nonce (from the SRAM start-up states) | |

## What changed in the design

- The gateway's ML-DSA-65 identity key is **generated in software** from the kernel's random pool and stored in a file readable only by root. The documents say so wherever they describe the gateway.
- The gateway's strength as a root of trust is correspondingly lower than the endpoint's. Anyone with root on the gateway can use its key. This is listed as a limit, not hidden.
- The chip-derived facts are still useful, but as **measurements** in the gateway's quote (design digests, lock state), not as the identity.

## What is still open

- Why the chip prints a name ending in S is not explained. It may be a family-level name in the tools; that was not confirmed.
- The certificate's chain could not be verified on a PC, because the issuing certificate is not published in the documents. It would have to be requested from Microchip.

## What it means for you

Check the ordering code, not the tool's printout, before you plan around hardware crypto on a PolarFire. If you need a hardware-held gateway key, use a part with the S suffix; the PolarFire SoC video kit, for example, carries one.
