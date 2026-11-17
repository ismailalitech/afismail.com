+++
title = "Two chips, two keys: show the endpoint key belongs to the chip"
date = '2026-11-17T12:00:00+01:00'
draft = false
description = "Set up a second STM32H573 exactly like the first, same firmware, option bytes and boot loader, and show that its ML-DSA key is different, that its standard PSA identity is not, and that it is refused when it presents itself under the first board's name."
weight = 35

[params]
  lab = 56
  board = "Two STM32H573I-DK, PolarFire SoC Discovery Kit"
  core = "Cortex-M33 (TF-M), U54 (Linux)"
  level = "Advanced"
+++

After this lab you have a second attested endpoint built from scratch, and evidence for a claim that one board could not
support: the endpoint's ML-DSA-65 key is bound to the chip. You will also see why the standard PSA attestation identity
of a development build does not tell two boards apart.

## Before you start

- [Lab 50](/projects/fpga-soc/microchip-polarfire-soc/aegis/attesting-an-endpoint/a04-attest-the-stm32/) working on the
  first board, and a backup of it taken under reset (as in
  [lab 55](/projects/fpga-soc/microchip-polarfire-soc/aegis/attesting-an-endpoint/a09-harden-a-running-endpoint/)).
- A second STM32H573I-DK. It does not need a network cable: everything here also works over its USB console.
- STM32CubeProgrammer, and the serial numbers of both ST-LINKs.

## The idea

The endpoint derives its ML-DSA-65 key at start-up by encrypting a fixed label with the chip's hardware-unique key
(DHUK) in the SAES peripheral. Lab 50 showed the key survives reboots and image updates, and that it is not the key an
all-zero or all-ones seed would give. What one board cannot show is that a second chip gets a different key. So build a
second endpoint that differs from the first in nothing but the chip.

![Two chips with the same firmware, option bytes and boot loader: each derives its ML-DSA key from its own hardware-unique key, so the keys differ; the PSA identity comes from TF-M's development provisioning and is the same on both](/aegis/diagrams/two-chips.svg)

## Run it

### 1. Back up the second board as it came

Read both flash views and the option bytes with the core held in reset, as for the first board. The board used here had
TrustZone enabled, all of flash secure, and a small program in its first three sectors.

### 2. Make its option bytes equal to the first board's

Compare the two option-byte listings field by field. Four fields differed: the secure area of bank 1 (sectors 0 to 0x43
on the first board), the secure area of bank 2 (none), and the hide-protected area that covers the boot loader (sectors 0
to 0x13). Erase the board, set them, and compare again:

```sh
STM32_Programmer_CLI -c port=SWD sn=<board 2> mode=UR -e all
STM32_Programmer_CLI -c port=SWD sn=<board 2> mode=UR -ob SECWM1_END=0x43 SECWM2_STRT=0x7F SECWM2_END=0x0 HDP1_STRT=0x0 HDP1_END=0x13
STM32_Programmer_CLI -c port=SWD sn=<board 2> mode=UR -ob displ
```

All 34 fields are then equal to the first board's.

### 3. Write the boot loader and the two images

```sh
# TF-M's boot loader, copied from the first board's backup: 0x0C010000, 96 KiB
STM32_Programmer_CLI -c port=SWD sn=<board 2> mode=UR -w bl2.bin 0x0C010000 -v
STM32_Programmer_CLI -c port=SWD sn=<board 2> mode=UR -w tfm-s-v2.3.0-aegis-pq-hb-hedged-kmac.hex -v
STM32_Programmer_CLI -c port=SWD sn=<board 2> mode=UR -w prover-ns-0.4.0-hb.hex -v
STM32_Programmer_CLI -c port=SWD sn=<board 2> mode=HOTPLUG -hardRst
```

Copy only code. The other regions below the secure image (the boot loader's counters, TF-M's provisioning data, its
counters and its encrypted storage) stay erased, so the new chip provisions itself on its first boot. Storage encrypted
on one chip would be unreadable on another. On the console, the boot loader provisions the board, checks both images and
starts them, and the prover reports `AEGIS-PROVER 0.4.0 ready`.

### 4. Compare the two boards

Ask both for their ML-DSA key (`PQKEY`) and for a standard PSA token on the same challenge (`CHAL`), over their USB
consoles. Then put the second board in front of the gateway's checker twice: once under the first board's name, with the
first board's pinned key, and once with its own. With no network cable, `host/serial_bridge.py` relays its console to a
TCP port.

![Two boards with the same firmware: different ML-DSA-65 keys, 1,941 of 1,952 bytes differing; the same PSA instance and implementation IDs; the second board refused under the first board's name and admitted with its own key](/aegis/diagrams/console-two-boards.svg)

## What it shows

- **The ML-DSA keys differ** in 1,941 of 1,952 bytes. About 8 equal bytes are expected by chance.
- **The PSA identity is the same on both.** TF-M's development provisioning writes the same fixed attestation key on every
  board. A verifier that trusted PSA tokens alone could not tell these two boards apart.
- **Impersonation is refused.** With identical firmware and identical PSA identity, the second board's quote under the
  first board's name fails with `ML-DSA-65 quote signature invalid`. With its own key it is admitted.

This closes threat T14 of the project's threat model on two chips. It is not a statement about every chip: it rests on
ST's statement that the DHUK is unique per device, and on two samples.

## What to check

- The option-byte listings of the two boards are identical.
- The second board prints `AEGIS-PROVER 0.4.0 ready` after its first boot.
- The two `PQKEY` answers differ; the two PSA instance IDs are equal; the impersonation check refuses.

## Where it can go wrong

- **The wrong board.** Name the probe with `sn=` in every command; an erase on the wrong board is not undone by a reset.
- **Reading the boot loader while it runs.** The hide protection makes that area unreadable once the boot loader has
  handed over; read it under reset, as the backup does.
- **Copying the first board's storage.** Its protected and internal storage are encrypted with the first chip's keys. Leave
  them erased and let the second chip provision its own.
- **Write protection.** On its first boot the boot loader switches on write protection for its own area; it prints a line
  about it. A later rewrite of the boot loader needs that lifted first.
