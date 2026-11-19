+++
title = "The STM32 from the non-secure side: probe its TrustZone, measure the partition's stack, upgrade board 1"
date = '2026-11-19T06:30:00+01:00'
draft = false
description = "Test from the non-secure side what the STM32's TrustZone set-up claims: the hardware-unique key in SAES refuses non-secure code, and secure memory and peripherals fault or read as zero, each against a control. Then measure how deep the Aegis partition's stack goes, and move board 1 to the fixed secure image with a backup and the gateway watching."
weight = 38

[params]
  lab = 64
  board = "Two STM32H573I-DK, PolarFire SoC Discovery Kit"
  core = "Cortex-M33 (TF-M secure + non-secure prover), U54 (Linux)"
  level = "Advanced"
+++

The STM32 endpoint's key is derived from the chip's hardware-unique key (DHUK) in the SAES unit
([lab 50](/projects/fpga-soc/microchip-polarfire-soc/aegis/attesting-an-endpoint/a04-attest-the-stm32/)), and the
non-secure prover is not supposed to reach it. On the RW612 each such rule was tested on the chip
([lab 58](/projects/fpga-soc/microchip-polarfire-soc/aegis/attesting-an-endpoint/a12-trustzone-on-the-rw612/)). This lab
does the same for the STM32H573, measures the margin on the Aegis partition's stack, and brings board 1 to the secure
image with the fix from
[a refused key exchange that left half of one behind](/projects/fpga-soc/microchip-polarfire-soc/aegis/attesting-an-endpoint/k09-a-refused-key-exchange-left-half-of-one/).

## Before you start

- Two STM32H573I-DK set up as in
  [lab 56](/projects/fpga-soc/microchip-polarfire-soc/aegis/attesting-an-endpoint/a10-two-chips-two-keys/), the gateway
  attesting both.
- STM32CubeProgrammer, and `STM32_SN` set to the ST-LINK serial of the board under test, in every command.
- The project repository: `endpoints/stm32h573/probe.sh` and `upgrade_secure.sh`.

## How a probe works

`probe.sh` builds the non-secure prover with one extra action at start-up, writes it to the non-secure slot, resets the
board and records the console for 40 s. Before that it reads the real value at the same address over SWD: in the
product state Open the debugger sees the secure view, so a zero from the non-secure side can be told apart from real
contents. After each run it reads the GTZC's illegal-access flags (TZIC1 SR1 to SR4) in the secure view. Each result
is one of three:

- **fault:** the read never returns. TF-M resets the chip, and the prover boots and probes again: 23 times in 40 s.
- **read as zero:** the GTZC returns zero for a secure block and sets that block's flag.
- **read allowed:** the non-secure side got the real value. For a secure address that is a failure.

When the probes are done the script writes the normal prover back (NSPE `34637a4e...`) and resets the board twice: once
it was seen not to come back on the network after a single reset.

## 1. Can non-secure code use the DHUK?

`probe.sh --saes` builds a test image of the non-secure prover that runs the partition's own key derivation: AES-256-ECB
under the DHUK in SAES, on the label that seeds the ML-DSA key. If it worked, the non-secure side would hold the
endpoint's seed. The console keeps only a status line, never an output. On board 2:

```text
SAES-DHUK: refused (aegis-saes: init=0 encrypt=1 sr=0x00000000); TZIC SR1-4: 00000000 00000000 00080000 00000004
```

The encryption failed, and SR3 bit 19, SAES's illegal-access flag, is set. The GTZC configuration read in the secure
view says why: `SECCFGR3 = 0x000C0000`, so RNG (bit 18) and SAES (bit 19) are secure, and `PRIVCFGR3 = 0x00040000`. The
HASH, PKA and AES units are left non-secure. The secure side does not use them: its cryptography is in software.

## 2. Secure memory and peripherals

![probe.sh on STM32 board 2: the DHUK derivation from the non-secure side is refused; reads of secure flash and SRAM fault; reads of secure SRAM, SAES and RNG through non-secure aliases return zero and set their flags; a word of the non-secure code reads as expected](/aegis/diagrams/console-stm32-tz-probes.svg)

| Probe | Address | Result |
|---|---|---|
| Non-secure slot header | `0x08088000` | fault |
| Secure flash, secure alias | `0x0C038000` | fault |
| Secure flash, non-secure alias | `0x08038000` | fault |
| Secure SRAM, secure alias | `0x30032E00` | fault |
| Secure SRAM, non-secure alias | `0x20032E00` | read as zero (real value `0x30032E09`); SR4 bit 24, SRAM1 |
| SAES | `0x420C0C00` | read as zero; SR3 bit 19 |
| RNG | `0x420C0800` | read as zero; SR3 bit 18 |
| Control: non-secure code | `0x08088400` | read: `0x20022800`, the same word as over SWD |

Reading the table:

- The secure aliases, and the secure part of the flash through its non-secure alias, fault. Blocks the GTZC makes
  secure read as zero and leave a flag. The real word in SRAM1 is `0x30032E09` (`attest_key_hash`); the non-secure
  side saw zero.
- The FLASH flag, SR4 bit 2, is set on every boot, the control's included, so it does not come from the probes. After
  a fault the flags read zero, because the reset clears them.
- The start of the non-secure slot, `0x08088000`, faults too. That word is the MCUboot header, and the SAU's
  non-secure code region starts after it. So the control is a word of the non-secure code, `0x08088400`, its initial
  stack pointer.

## 3. How deep the partition's stack goes

ML-DSA signing uses a lot of stack. The Aegis partition's stack, `tfm_sp_aegis_pq_stack`, is 26,624 bytes at
`0x30041780`. It is zero at reset and grows down, so after an attestation, an ML-KEM provisioning and a heartbeat it
was read over SWD and searched for the lowest non-zero byte:

```text
first non-zero byte at offset 7536: at least 19088 of 26624 bytes used (72%)
```

At least 19,088 bytes, 72 %, with 7,536 bytes to spare. TF-M's stack limit register faults before an overflow reaches other
memory. The RW612's partition, which reports its own high-water mark, used 19,368 of 32,768 bytes.

## 4. Board 1 on the fixed image

Board 2 got the secure image with the `KEM_INIT` fix on 18 November. Board 1 was not connected then and kept the
previous one. `upgrade_secure.sh` does the whole change with the gateway in the loop:

1. Check the new image: SPE `3cacd9d0...`, the same version and signer as the running one (`a5997cc3...`).
2. Back up the board under reset.
3. Allow the new SPE in the gateway's policy next to the old one, with a backup of the policy.
4. Write the secure slot, verify, reset.
5. Wait for the gateway to admit the board, then remove the old SPE from the policy.

```text
06:52:32 stm32h573-dk ADMITTED  [credential: issued session 1b4a508f3cc7...]
allowed for stm32h573-dk: [('NSPE', '34637a4e23d8'), ('SPE', '3cacd9d03cdd')]
06:53:07 stm32h573-dk ADMITTED  [credential: valid, heartbeat 1 (uptime_s=45;link=1;fw=0.5.0)]
06:53:41 stm32h573-dk ADMITTED  [credential: valid, heartbeat 2 (uptime_s=79;link=1;fw=0.5.0)]
```

Admitted with only the new value allowed, so the board runs the new image. The key did not change: it comes from the
chip's DHUK, not from the image. Both STM32 boards now run the fixed secure image.

## What it shows

| Check | Result |
|---|---|
| DHUK key derivation from the non-secure side | refused; SAES flag set |
| Secure flash and SRAM, secure aliases | fault, 23 attempts each |
| Secure SRAM, SAES and RNG through non-secure aliases | read as zero, flag set |
| Control | the non-secure code word reads correctly |
| Aegis partition stack | at least 19,088 of 26,624 bytes used |
| Board 1 | admitted on SPE `3cacd9d0...`, old value removed; both boards on the fix |

## What it does not do

- **The board is in the product state Open with TF-M's published development keys.** Anyone with the debugger or
  those keys can replace the secure image, and any secure code can use the DHUK. The probes show the non-secure side
  is kept out, not that the secure side is.
- **TF-M runs at isolation level 1 here**, so there is no isolation between secure partitions.
- **Each probe reads one word at one address.** It tests the rule for that region, not every address in it.

## Where it can go wrong

- **The wrong board.** Set `STM32_SN`; a probe image written to the wrong board replaces its prover.
- **A control at the start of the slot.** The MCUboot header is outside the SAU's non-secure code region. Use a word
  of the code.
- **Reading a flag as a result.** The FLASH flag is set on every boot. Compare with the control's flags.
- **A board that does not come back after the probes.** Reset it a second time; the script does.
