+++
title = "One Prover SDK on three secure worlds"
date = '2026-11-21T09:10:00+01:00'
draft = false
description = "Since 20 November 2026 every Aegis endpoint builds the same protocol source: a TF-M partition on the STM32H573 and on the RW612, and an OP-TEE trusted application on the Zynq UltraScale+. What the core does, what a device maker writes, what it costs on a Cortex-M33, what API version 1 promises, and how the SDK was held to the answers of the images before it."
weight = 10

[params]
+++

Until 20 November 2026 the STM32 partition carried about 1,100 lines of its own for the same protocol that the RW612
and the Zynq UltraScale+ ran from another file. Now every device builds one source, `sdk/src/aegis_proto.c`, the
core of the **Prover SDK** (release 1.0.0, API version 1). A device is three parts:

- **the core**: the quote, the ML-KEM-768 exchange, the credential check, the
  [transcript](/projects/fpga-soc/microchip-polarfire-soc/aegis/trust-model/x05-trust-labels-endorsement-transcript/),
  the KMAC256 heartbeat and the session's end on the device's own clock. It allocates nothing and includes nothing of
  TF-M, Zephyr, OP-TEE or a vendor HAL;
- **a platform file**: randomness, a clock, the measurements or a finished token, the identity seed, a status text. A
  function that fails makes the core refuse the request;
- **a transport**: one request in, one reply out, as a text line (what the gateway speaks) or as binary operations
  (which the STM32's PSA messages map onto one to one).

![The Prover SDK: one core with a platform file and a transport; the STM32H573 and the RW612 build it as TF-M partitions, the Zynq UltraScale+ as an OP-TEE trusted application, and a Linux port and the PC's simulated device with software trust](/aegis/diagrams/sdk-one-core.svg)

## The three secure worlds on the bench

| | STM32H573 (TF-M) | RW612 (TF-M) | Zynq UltraScale+ (OP-TEE) |
|---|---|---|---|
| Image on the bench | SPE `9de76167`; board 2 runs the same partition with the EAT option, SPE `315dcc2f` | secure image 0.3.2, SPE `c8d0f012` | trusted application 0.2.0 |
| Identity seed | AES-256 under the DHUK in SAES | ELS: HMAC over a CKDF of the die key | OP-TEE's hardware unique key, from the PUF-derived seed, per TA |
| Randomness | TF-M crypto service (the RNG) | ELS DRBG | `TEE_GenerateRandom` |
| Clock that ends a session | RTC on the LSI, made secure, 250 Hz | secure SysTick | OP-TEE system time, protection level 1000 |
| Evidence | TF-M's PSA token | SPE and NSPE, hashed before the non-secure image runs | the FSBL's hand-off, seven measurements |
| Transport | PSA messages, binary operations | lines in one PSA message | lines in one TA command |

Two more ports build the same core: `sdk/ports/linux`, a Linux prover in C, and `sdk/ports/host`, the reference port
on the PC. The [simulated device](/projects/fpga-soc/microchip-polarfire-soc/aegis/standards-and-releases/a20-attest-a-device-without-hardware/)
is one C file on top of the library.

## The same answers as before

The STM32 port had to stay byte-compatible with the image the boards ran (SPE `3183f74a`): the same messages, sizes,
PSA statuses, signatures, keys and tags. `tools/sdk_golden.py` builds the harnesses of the commit before the SDK,
records every byte they answer for a fixed random generator, and holds the new code to those traces. On the build
PC: 31 of 31 STM32 traces and 18 of 18 line-protocol traces equal, and the fuzzers' corpora run through the old and
the new code gave 714 and 309 inputs with no answer changed
([`evidence/sdk-core/summary.txt`](https://github.com/ismailalitech/aegis/blob/main/evidence/sdk-core/summary.txt)).

What the core refuses now and the images before did not, none of it reachable with a working device and a valid
request: an exchange key drawn as 32 equal bytes or equal to the draw before it, a seed of zeros at start, and
evidence longer than its room. A contract test changes the core in 15 ways a careless edit could (hashing the
caller's buffer instead of the copy, a length not held to its room); all 15 are caught.

The RW612's secure RAM went from 176,924 to 161,828 bytes of 192 KB, because the core no longer copies the
credential, the claims and the gateway's key.

## What it costs on a Cortex-M33

From the [porting guide](https://github.com/ismailalitech/aegis/blob/main/docs/sdk-porting-guide.md), GCC 14.2 at
`-Os`:

| | Size |
|---|---|
| Code, the library's five objects | 32.8 KB (34.5 KB with the EAT option): core 8.0, ML-DSA-65 13.0, ML-KEM-768 9.7, KMAC 1.3, SHA-256 0.8 |
| Context, `struct aegis_prover` | 13,232 bytes of RAM |
| Work buffer | 1,234 bytes at least; 2,854 for every credential the protocol allows with small evidence; 1,962 with the EAT option |
| Stack, quote or exchange start (ML-DSA-65 signing) | 18.7 KB, an estimate from GCC's stack usage and the call graph |
| Stack, heartbeat | 0.7 KB |

The estimates are not bounds: on the STM32 the measured high-water mark was 168 bytes above them. The guide asks for
24 KB of stack or more and a measurement on the device; the TF-M ports report theirs in every heartbeat
(`sstack=18872/26624` on the STM32s, `stack=19176/32768` on the RW612 during the
[soak](/projects/fpga-soc/microchip-polarfire-soc/aegis/bench-and-reproduce/k16-a-soak-that-failed-its-own-clock-estimate/)).

## What API version 1 promises

[`docs/sdk-versioning.md`](https://github.com/ismailalitech/aegis/blob/main/docs/sdk-versioning.md):

- functions keep their names, parameters and contracts across 1.x; new ones may be added;
- `struct aegis_platform` and the other public structures keep their members, so a port written for 1.0.0 builds
  and behaves the same with every 1.x. A new platform function means API version 2;
- `struct aegis_prover` is opaque. `aegis_prover_init` is given its size and the API version, and refuses a caller
  compiled against another layout (`AEGIS_ERR_VERSION`) instead of writing past its storage;
- for the same inputs and random bytes the replies are the same bytes. `tools/sdk_golden.py check` with 0
  differences is a release condition; a change of output is a new protocol label, never a silent one.

The SDK ships as source and a static library with a CMake package and two public headers. There is no shared
library and no ABI promise across releases beyond the run-time check at `aegis_prover_init`.

## Porting it to another device

The [porting guide](https://github.com/ismailalitech/aegis/blob/main/docs/sdk-porting-guide.md) has ten steps,
from where the core runs (a TF-M partition, a trusted application, or the whole firmware on a device without a
secure world) to checking the port, and the platform file is about 150 lines. Its last section is the list to go
through before shipping, among them:

- the context, the work buffer, the stack and the verifier key live in secure memory;
- requests are copied into secure memory before the core reads them;
- `random` is a TRNG or a DRBG seeded from one, and `clock` cannot be set or stopped from outside the secure world;
- measurements are taken by code the measured code cannot change;
- the reported profile is the one that is true of the device.

Every declaration is in
[`docs/sdk-api-reference.md`](https://github.com/ismailalitech/aegis/blob/main/docs/sdk-api-reference.md),
generated from the header and checked by the host tests.

## What the SDK does not change

The protocol, the limits of the transcript (an image that holds the key and lies), and the trust each endpoint
claims. The STM32 keeps two habits behind compatibility flags of the core: its heartbeat counter runs from boot
across sessions, and it does not require the credential to name the device key. Standard evidence is an option of
the core, off by default; built without it, the core compiles to the same object code as before
([standard evidence](/projects/fpga-soc/microchip-polarfire-soc/aegis/standards-and-releases/x07-standard-evidence/)).
