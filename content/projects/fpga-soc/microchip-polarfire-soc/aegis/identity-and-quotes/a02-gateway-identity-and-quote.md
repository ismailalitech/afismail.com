+++
title = "What the gateway can prove about itself"
date = '2026-11-17T00:30:00+01:00'
draft = false
description = "Read the PolarFire system controller's identity services from Linux, find which ones this chip refuses, and check the gateway's own post-quantum quote from a PC."
weight = 10

[params]
  lab = 48
  board = "PolarFire SoC Discovery Kit"
  core = "U54 (Linux)"
  level = "Intermediate"
+++

After this lab you know which identity facts the PolarFire's system controller gives to software on this chip, which it
refuses, how the gateway proves its own identity to a PC with an ML-DSA-65 signature, and why the PC rejected that proof
once for a good reason.

## Before you start

- The gateway services are installed and the gateway is enrolled
  ([reproduce the bench](/projects/fpga-soc/microchip-polarfire-soc/aegis/bench-and-reproduce/a01-reproduce-the-bench/)).
- You can SSH into the gateway as root with a key.

## The idea

A device can prove two different things. It can prove **who it is**: a name that nobody else can claim. And it can prove
**what it is running**: that its software is the software you expect. The gateway needs both, and on this chip it gets
them from different places.

The PolarFire has a *system controller*, a small hard block that starts before the processors and answers requests
called system services. Linux reaches it through a mailbox and a device file. The services give the board a serial
number, design information, security digests and a random nonce. On the larger parts with a data-security block they also
sign with a key held by the chip. This one is not such a part.

## What the services return

The gateway's tool is a read-only whitelist over the device file, so a mistake cannot ask the controller to change
anything. Results on the board:

| Service | Result |
|---|---|
| serial number | 16 bytes, equal to the programmer's reading, reversed |
| design information | design name and a design version number |
| security status | 36 bytes |
| nonce | 32 bytes from the chip's SRAM start-up states |
| device certificate | a 976-byte X.509 certificate, ECDSA with SHA-384, carrying a P-384 public key |
| PUF emulation | **refused**, status 255 |
| signature with the chip's key | **refused**, status 255 |

The last two are the finding. The kit's documentation and the distributors list the chip as the part without the
data-security block. The programming tool and the certificate both print a name ending in `S`, which at first made me
believe the opposite; the documents were checked and the board was treated as the non-`S` part from then on. The
consequence is that **the gateway cannot sign with a key the chip holds**. Its identity key is made in software and kept in
a file readable only by root, and the project's documents say so.

What the chip does give is a serial number, a certificate that Microchip signed for that serial number, design digests and a
hardware random nonce. The certificate chain could not be verified on the PC, because the issuing certificate is not
published in the documents; asking Microchip for it is an open item.

## The gateway's own quote

The gateway offers a quote on TCP 7443. A quote is a signed statement that contains the verifier's fresh nonce and a set of
measurements: the design information, the user code, the security lock state, the chip's design digests, the kernel version, a hash of the gateway's own code and a boot identifier. The PC accepts it
only if all of these hold:

1. the ML-DSA-65 signature verifies with the key stored at enrolment;
2. the nonce is the one just sent;
3. the identity hash matches the enrolled record;
4. the answer arrived within the time limit;
5. every measurement equals the reference, except the boot identifier, which changes at every boot.

```sh
.venv/bin/python host/aegis_verify.py enroll <gateway>    # once, on a bench you control
.venv/bin/python host/aegis_verify.py quote  <gateway>    # every time
```

Enrolment is trust on first use: it is as trustworthy as the network at that moment.

![The PC verifier asks the gateway for a quote and prints accepted, with the 3,309-byte ML-DSA-65 signature](/aegis/diagrams/console-quote.svg)

The chip's refusal of the two signing services, and what it meant for the design, is a case study:
[the chip is not an S device](/projects/fpga-soc/microchip-polarfire-soc/aegis/identity-and-quotes/k01-chip-is-not-an-s-device/).

## A good refusal

After the gateway's fabric was reprogrammed with the accelerator ([lab 49](/projects/fpga-soc/microchip-polarfire-soc/aegis/post-quantum-in-fabric/a03-fabric-accelerator/)),
the PC refused the next quote:

```text
measurement changed: design_digests_sha256, design_info
```

The signature and the identity were unchanged. The design had really changed, so the refusal was correct. The reference was
re-enrolled on purpose, and the old enrolment kept. The same thing happened later when a fix changed the gateway's own code
hash. This is the property you want: a quote that is valid but describes something different is not accepted silently.

## What to check

- All the whitelisted services return data, and the two refused services return status 255 on this chip.
- `quote` ends with an accepted verdict; run it twice and the signatures differ, because the nonce does.
- Change anything the quote measures and confirm that the PC names the measurement that changed.

## Where it can go wrong

- **Never unload the `mpfs-generic-service` module.** It registers its device in probe and has no remove path, so after
  `rmmod` the device stays registered while the module's memory is freed, and the board stopped answering SSH. The module is
  loaded once and left; reboot to remove it.
- Expecting a hardware-held signing key on this chip. There is none; see the limits on the
  [project page](/projects/fpga-soc/microchip-polarfire-soc/aegis/).
- Enrolling over a network you do not control.
