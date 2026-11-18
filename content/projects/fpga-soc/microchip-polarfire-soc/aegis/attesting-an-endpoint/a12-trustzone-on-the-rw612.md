+++
title = "TrustZone on the RW612: the key and the measurements move into a TF-M secure partition"
date = '2026-11-18T07:50:00+01:00'
draft = false
description = "Move the RW612 prover into a TF-M secure partition so the network firmware never holds the key or reports its own measurement, close the peripherals NXP's defaults leave open to it, prove each closure on the chip, and have the result attacked by independent reviewers."
weight = 37

[params]
  lab = 58
  board = "NXP FRDM-RW612, PolarFire SoC Discovery Kit"
  core = "Cortex-M33 (TF-M secure + bare-metal non-secure), U54 (Linux)"
  level = "Advanced"
+++

[Lab 57](/projects/fpga-soc/microchip-polarfire-soc/aegis/attesting-an-endpoint/a11-a-key-from-the-chip-on-the-rw612/)
left the RW612 with a key from the chip and a measurement from the firmware itself: the gateway labelled it
"device-key trust". After this lab the key, the measurements and every proof live in the TrustZone secure side under
NXP's TF-M, the network firmware is a pipe that cannot touch any of them, and the gateway's verdict says
"trustzone trust". On the way, the lab closes peripherals that NXP's defaults leave open to non-secure code, and checks
on the chip that each one is really closed.

## Before you start

- Lab 57 done: the board on the network, the gateway attesting it.
- The MCUXpresso SDK for this board: `west init -m https://github.com/nxp-mcuxpresso/mcuxsdk-manifests.git`, then
  `west update_board --set board frdmrw612` (58 repositories, about 5 GB).
- CMake 3.30 or newer and Ninja 1.12 (from pip, inside the west environment) and the Arm GNU toolchain 14.2.
- The project repository: `endpoints/rw612/tfm/`.

## Two rules first

**No fuse is written.** NXP's TF-M keeps its anti-rollback counters in one-time fuses unless the board port defines
`OCOTP_NV_COUNTERS_RAM_EMULATION=1`; the secure build here always includes that port, and NXP's code stops the build
with an `#error` without it. The SDK's `tfm_secureboot` example is not used at all: its first step burns the secure-boot
keys into the chip, and it can close the lifecycle, both for good.

**No SDK file is changed.** Everything below is done from the project's own CMake.

## The design

![The RW612 with TrustZone: the gateway talks to the non-secure prover over Ethernet; the prover passes each line to the Aegis partition with psa_call; the partition uses ELS (secure only) and the two measurements; TF-M core sets ELS up; the flash holds both partitions](/aegis/diagrams/rw612-tz-architecture.svg)

- **The Aegis secure partition** (PSA-RoT, one stateless service) runs the same protocol code as the Zephyr prover and
  the PC tests (`aegis_proto.c`). It derives the ML-DSA-65 key in ELS, which TF-M makes reachable by secure privileged
  code only, and reports two measurements: `SPE` and `NSPE`, the SHA-256 of the whole secure and non-secure flash
  partitions.
- **The non-secure prover** runs Ethernet, lwIP and a TCP server on port 7444. It hands every request line to the
  partition with `psa_call` and sends the reply back. It holds no key, no seed and no session key.

The order of events matters: the measurements are taken before any non-secure code runs.

![From reset: the boot ROM loads the die key into ELS, TF-M sets the TrustZone and peripheral rules, the Aegis partition sets up the Ethernet clocks and pins and hashes both partitions, the non-secure prover starts, and the key is derived in ELS at the first request](/aegis/diagrams/rw612-tz-boot.svg)

The key is derived at the first request, not at start-up, because TF-M's crypto partition sets ELS up during its own
start-up. The first build derived it earlier and the chip kept resetting a moment later; see
[ELS used before TF-M had set it up](/projects/fpga-soc/microchip-polarfire-soc/aegis/attesting-an-endpoint/k07-els-before-tf-m-set-it-up/).

## Run it

### 1. Check TF-M itself on this board

Build NXP's regression suite and run it before adding anything:

```sh
west build -p always --sysbuild examples/tfm_examples/tfm_regression_ns --toolchain armgcc --config release \
    -b frdmrw612 -d build/regression
```

Flashed with the chip halted under reset (a running TF-M blocks J-Link's flash loader), it passed **164 of 164 tests in
16 of 16 suites**.

### 2. Build the Aegis images

```sh
west build -p always --sysbuild ~/aegis/endpoints/rw612/tfm/prover_ns --toolchain armgcc --config release \
    -b frdmrw612 -d build/aegis
```

Two things in the secure project are worth knowing:

- **Secure RAM.** TF-M and the partition together needed 204,584 bytes of the 196,608 available. The RW612 target
  config sets TF-M's crypto scratch buffer to 33,000 bytes with `#undef`/`#define`, so no compiler flag can lower it. A
  generated `config_tfm_target.h` in the build directory, which comes first in the include path, includes NXP's file and
  then lowers that one buffer to 12,288 bytes. Nothing in this image sends TF-M crypto a larger request.
- **The partition files** (load data, stack, SID and PID headers) are generated with NXP's own manifest tool, with an
  unused stateless index, and live in the project.

### 3. Flash both partitions whole

```sh
~/aegis/endpoints/rw612/tfm/flash.sh build/aegis/aegis_s/aegis_s.bin build/aegis/prover_ns/prover_ns.bin
```

The partition hashes whole partitions, not image lengths, so nothing can hide after the end of an image. The flash must
then be exactly each image followed by `0xFF`, and the script writes each partition whole. A plain range erase was not
enough; see
[a range erase that left an old image behind](/projects/fpga-soc/microchip-polarfire-soc/aegis/attesting-an-endpoint/k08-a-range-erase-that-left-an-old-image/).

![The board console with TrustZone: TF-M boots, the partition measures both partitions, the non-secure prover starts, the key is derived in ELS at the first request, and the network comes up](/aegis/diagrams/console-rw612-tz-boot.svg)

### 4. Predict the measurements on the PC

```sh
tools/rw612_tfm_reference.py build/aegis/aegis_s/aegis_s.bin build/aegis/prover_ns/prover_ns.bin
```

This computes `SPE` and `NSPE` from the two files. The quote's values equal them, so the gateway's policy can be written
from the build outputs alone.

### 5. Gateway: a new profile, pinned

The partition's claims carry the profile `aegis-rw612-tfm-v1`, and the gateway labels that verdict "trustzone trust".
The policy entry **pins the profile**:

```json
{"name": "frdm-rw612", "kind": "aegis-device", "profile": "aegis-rw612-tfm-v1",
 "allowed": [{"type": "SPE", "measurement_value": "<from step 4>"},
             {"type": "NSPE", "measurement_value": "<from step 4>"}]}
```

The pin is needed because the chip derives **the same key** under either firmware: without it, someone could flash
lab 57's single-image prover, whose key is identical, and pass as the TrustZone one. A PC test shows exactly that:
a valid signature, refused only by the pin.

### 6. Change the non-secure image

The recording shows a non-secure image changed by one byte after the build (a letter of its banner), at four times the
real speed:

{{< clip src="/aegis/rw612/rw612-tz-demo.mp4" poster="/aegis/rw612/rw612-tz-demo-poster.webp" width="1600" height="830" label="Screen recording of the RW612 TrustZone tamper demo" caption="Screen recording (4x speed, 74 s, no sound): the good images are admitted with trustzone trust; the non-secure image changed by one byte boots, the secure partition reports its new NSPE and the gateway quarantines it, credential revoked; the good image is admitted again with a new session." >}}

[![A real screenshot: the modified non-secure image runs (its banner reads PROWER); the gateway quarantines it because NSPE is not allowed](/aegis/rw612/rw612-tz-demo-quarantined.png)](/aegis/rw612/rw612-tz-demo-quarantined.png "Open the screenshot at full size")

![The gateway journal: admitted with trustzone trust and heartbeats; unreachable while the modified image is flashed, then quarantined because NSPE is not allowed; admitted again with a new session](/aegis/diagrams/console-rw612-tz-gateway.svg)

The non-secure image did nothing to report its own hash: the secure partition hashed it before it ran.

## Close what NXP leaves open

NXP's `target_cfg.c` lets non-secure code reach peripherals that would undo all of this: the fuse controller, the flash
controller (it could rewrite the secure image), the flash caches, the reset and clock controllers that hold ELS's own
reset and clock, the pin mux, the power management unit and more. The project builds its own copy of that file with
those rules changed to secure-privileged, and leaves out NXP's loader service, which lets a non-secure caller make
secure code process an update file and write memory.

![Under NXP's defaults, OCOTP, FlexSPI, the flash caches, TRNG, ROM control, the debug mailbox, RSTCTL0, CLKCTL0, SYSCTL0, SYSCTL2, the pin mux, PMU and SOC_TOP are non-secure; under the Aegis rules they are secure only, and only ENET, GPIO, the console UART and what they need stay non-secure](/aegis/diagrams/rw612-tz-hardening.svg)

Closing the reset, clock and pin blocks takes the Ethernet set-up away from the non-secure prover, so the secure
partition does it before the prover runs: the Ethernet clocks, its reset and its pins. The prover's drivers are built
without clock control, and its clock frequencies are constants (the console's 20 MHz was measured on the board with the
debugger before the clock block was closed).

### Prove each closure on the chip

A rule in a configuration file is a claim. `probe.sh` tests it: it builds the non-secure prover with one extra register
read at start-up, flashes it, and records the console. A secure-only peripheral must fault, so the chip restarts and the
read never returns; a peripheral the prover needs must still read.

![Non-secure reads: under NXP rules OCOTP and FlexSPI read fine; under the Aegis rules OCOTP, FlexSPI, the flash cache, TRNG, RSTCTL0, CLKCTL0, SYSCTL0, the pin mux, SOCCTRL, the SoC OTP controller, PMU and SYSCTL2 fault on every attempt; the ENET register still reads](/aegis/diagrams/console-rw612-tz-probes.svg)

The first control probe read ENET at offset 0 and hung: that word is reserved on this controller. The control moved to
the first real register (`EIR`, offset 4). A control that fails for its own reason would have made every "fault" mean
nothing.

## Have it attacked

The secure code and the hardening then went to four independent reviewers, one angle each (memory safety; cryptography
and protocol; isolation; the verifier side), and each finding to a skeptic who tried to refute it from the code or with
a test on the PC. Seven findings survived; five were rejected with reasons. The full list is in the repository
(`docs/rw612-security-review.md`).

- **Critical: the pin mux was still non-secure.** Non-secure code could switch the external flash's pins to plain GPIO
  and drive the flash by hand, rewriting the secure image without ever touching the flash controller. Fixed: the pin
  mux is secure-only, and the secure partition sets the Ethernet pins. The probe confirms it.
- **SOC_TOP** (PLLs, trims, pads, the SoC OTP controller), **the PMU** (core voltage and brown-out: a glitch path while
  the secure side signs) and **SYSCTL2**: secure-only now, each probed.
- **The gateway's enrolment** re-fetched every key over the network and overwrote existing pins; it now keeps them.
- **The credential** did not name the pending ML-KEM key, so an old exchange replayed after a new one replaced a working
  session. It does now, and the device checks it; the STM32 endpoints accept the longer credential unchanged.

The memory-safety reviewer found no defect in the partition's request handling or in the protocol code running on
non-secure input.

## What it shows

| Check | Result |
|---|---|
| NXP's TF-M regression on this board | 164 of 164 |
| Quote: signature, profile, measurements | valid, `aegis-rw612-tfm-v1`, `SPE` and `NSPE` equal to the PC's prediction |
| Gateway, good images | admitted (trustzone trust), credential issued through the secure partition, KMAC heartbeats |
| Non-secure image changed by one byte | quarantined: `NSPE not allowed`, the predicted hash, credential revoked |
| Single-image prover with the same key, profile pinned | refused (PC test) |
| Non-secure reads of the 12 protected blocks probed | a fault every time; ENET still reads |
| Security review | 1 critical, 3 medium and 3 low findings confirmed and fixed; 5 rejected with reasons |
| Host tests | 62 passed |

## What it does not do

The key belongs to the chip, not to the firmware. Someone who reflashes the **secure** image with a debugger can still
use it, as on the STM32 with TF-M's development keys. Closing that needs secure boot fused on, which writes the chip for
good and is not done on this bench. TF-M here runs at isolation level 2, so the Aegis partition shares privileged memory
with TF-M's other PSA-RoT services; NXP's SDK does not set up level 3 for this board.

## Where it can go wrong

- **Burning fuses by accident.** Keep the board port in the secure build (`OCOTP_NV_COUNTERS_RAM_EMULATION=1`), and
  never run `tfm_secureboot/scripts`.
- **J-Link with TF-M running.** Halt the chip under reset before flashing. Even then the flash loader timed out on the
  first attempt in most runs here ("RAMCode did not respond"); the second always worked, and `flash.sh` retries once.
- **Measurements that do not match.** Write both partitions whole; an erase command can leave blocks of an older,
  larger image behind.
- **The non-secure prover faults at start-up after hardening.** Anything that reads a closed block faults: the device's
  default `SystemInit` (it reads the flash cache), clock queries, pin muxing, driver clock control.
