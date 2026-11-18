+++
title = "What a device can prove, and to whom"
date = '2026-11-17T00:30:00+01:00'
draft = false
description = "Identity, firmware state and freshness are three different claims. How each one is made in Aegis, what it rests on, and what it does not cover."
weight = 10

[params]
+++

Remote attestation is easy to describe and easy to overclaim. This page separates the claims, so that every later page can say which one it is making and what it rests on.

## Three claims

| Claim | Question the verifier asks | What it rests on |
|---|---|---|
| **Identity** | Is this the same device I saw before? | A key that only this device can use, enrolled once |
| **State** | Is it running the software I allow? | A measurement made by something that ran before that software |
| **Freshness** | Is this answer for my question, now? | A nonce the verifier chose and the device signed |

A device can pass one and fail another. A cloned device with a copied key passes identity. A genuine device running modified firmware passes identity and fails state. A recorded answer replayed later passes both and fails freshness. Aegis checks all three on every cycle, and a failure of any one is a quarantine.

## Who proves what

![The system: a PC checks the gateway, the gateway reads its system controller and attests the endpoints; two STM32s and an NXP RW612 are admitted and the Arduino is quarantined](/aegis/diagrams/system-overview.svg)

There are two directions of proof.

- **The endpoint proves itself to the gateway.** The evidence is a token from the boot loader's measurements, signed by a key that lives in the secure world, over a challenge the gateway just made. This is the main path.
- **The gateway proves itself to a PC, and to the endpoint.** The PC verifier checks the gateway's quote ([lab 48](/projects/fpga-soc/microchip-polarfire-soc/aegis/identity-and-quotes/a02-gateway-identity-and-quote/)). The endpoint checks the gateway's credential against a key pinned into its secure image ([lab 50](/projects/fpga-soc/microchip-polarfire-soc/aegis/attesting-an-endpoint/a04-attest-the-stm32/)). Without this, anyone on the network could play the gateway.

## Where each claim comes from

| Claim | Endpoint (STM32) | Gateway (PolarFire) |
|---|---|---|
| Identity key | ML-DSA-65, derived inside the secure world from the hardware-unique key | ML-DSA-65, generated in software, kept in a root-only file |
| State | Boot loader measures each image; the token carries the hashes | Quote carries design digests, lock state, kernel version and a hash of the gateway's own code |
| Freshness | Challenge from the gateway, signed with the quote | Nonce from the PC verifier, signed with the quote |

The gateway's column is weaker, and the project says so. The chip is the part without the data-security block, so there is no key held in hardware for the gateway. See [the chip is not an S device](/projects/fpga-soc/microchip-polarfire-soc/aegis/identity-and-quotes/k01-chip-is-not-an-s-device/).

## Three kinds of endpoint

Not every endpoint can make the same claims, so the gateway's verdict says which kind it judged. The STM32 keeps its
key in the secure side and its boot loader measures the images. The NXP RW612
([lab 57](/projects/fpga-soc/microchip-polarfire-soc/aegis/attesting-an-endpoint/a11-a-key-from-the-chip-on-the-rw612/))
derives its key inside its EdgeLock Secure Subsystem, so the key proves the chip, but its firmware measures itself: the
verdict says `device-key trust`. With TF-M
([lab 58](/projects/fpga-soc/microchip-polarfire-soc/aegis/attesting-an-endpoint/a12-trustzone-on-the-rw612/)), the
same chip keeps the key and both measurements in a secure partition the network firmware cannot reach, and the verdict
says `trustzone trust`; the gateway pins that profile, because the chip's key is the same under either firmware. A Linux
board whose key is a file would be labelled `software trust`.

![Three kinds of endpoint: who holds the key, who measures the firmware, and the label the gateway puts on the verdict](/aegis/diagrams/endpoint-trust-levels.svg)

## What attestation does not prove

- **That the software is correct.** It proves the software is the software the policy names. A policy that allows a vulnerable image allows it.
- **That nothing happened after the measurement.** A measurement is made at boot. Software that is compromised later keeps its good measurement until the next boot.
- **That the first enrolment was honest.** Enrolment is trust on first use: whoever answers first is enrolled. It must be done on a network you control.
- **Anything about hardware attacks.** Side channels, fault injection and probing are outside what was tested.

These limits are listed again, with the evidence for each, on the [project page](/projects/fpga-soc/microchip-polarfire-soc/aegis/) and in the [results](/resources/aegis-results/).
