+++
title = "A key from the PUF without fuses: the Zynq UltraScale+ endpoint with trustzone trust"
date = '2026-11-19T06:15:00+01:00'
draft = false
description = "Register the chip's PUF in boot-header mode, so nothing is written to eFUSEs; encrypt the FSBL under a key only this chip can recover; derive the attestation key from it in the FSBL and hand it, with seven boot measurements, to OP-TEE. The gateway now says trustzone trust. What that does and does not prove, stated in full."
weight = 40

[params]
  lab = 63
  board = "Trenz TE0807 (XCZU4EG) on a TEBF0808 carrier, PolarFire SoC Discovery Kit"
  core = "PMU, CSU, Cortex-A53 (FSBL, TF-A, OP-TEE, Linux), U54 (Linux)"
  level = "Advanced"
+++

After [lab 62](/projects/fpga-soc/microchip-polarfire-soc/aegis/zynq-ultrascale-endpoint/a15-optee-holds-the-key/) the
key lives in OP-TEE, but it comes from a development value that every chip shares. After this lab it comes from a key
that only this chip's PUF can recover, and the quote carries seven measurements that the boot chain took before Linux
ran. This is phase B of the project's design (`docs/zynqmp-key-design.md`). No eFUSE and no BBRAM key is written.

## Before you start

- Lab 62 done: OP-TEE with the Aegis TA, admitted with trustzone-devkey trust.
- The Windows PC with Vitis 2025.2, `xsdb` and the TE0790 on J12, and bootgen 2019.1 for signing (see
  [bootgen 2025.2 and RSA keys](/projects/fpga-soc/microchip-polarfire-soc/aegis/zynq-ultrascale-endpoint/k14-bootgen-2025-2-fails-on-rsa-keys/)).
- A microSD reader on a PC: after a secure boot JTAG is off, and a failed boot is recovered by changing the card.
- The project repository: `endpoints/zynqmp/fsbl/`, `handoff/`, `optee/os-patches/` and `windows/puf/`.

## What the chip and AMD's software allow

What follows was checked in AMD's 2025.2 sources:

1. **The PUF in boot-header mode.** AMD's registration example (xilskey) can print the PUF's helper data and a
   "black key": a 256-bit key we choose (the red key), encrypted under the PUF's key-encryption key. bootgen puts both
   in the boot header. At power-on the boot ROM regenerates the PUF key from the header and decrypts the black key into
   the AES engine's **device key**. Another chip regenerates another PUF key, so the same boot image gives it a wrong
   key, and its encrypted FSBL does not decrypt.
2. **The PUF cannot be regenerated later from boot-header data.** xilskey refuses without helper data in eFUSEs, and
   OP-TEE's ZynqMP HUK driver regenerates from eFUSEs only. Without authentication fused on, OP-TEE's own HUK falls
   back to a SHA-256 of the device DNA, which Linux can read. So the key has to be used **during boot, by the FSBL**.
3. **The FSBL decrypts partitions with the device key** (`XSECURE_CSU_AES_KEY_SRC_DEV`). With the black key in the
   header that is our red key, so a hook in the FSBL can run one more AES-GCM operation under it.

## The design

In order, from power-on:

1. **Boot ROM:** regenerates the PUF key from the helper data in the boot header, decrypts the black key into the
   device key, and decrypts the FSBL and the PMU firmware with it.
2. **FSBL:** loads the PMU firmware, the bitstream, TF-A, OP-TEE and U-Boot. When the last one is loaded, it reads every
   partition back from the card and hashes it with the CSU's SHA3-384. Before the hand-off it computes the seed:
   AES-256-GCM, under the device key, of a fixed label. It writes the seed and the measurement list to a hand-off page
   at the end of OP-TEE's secure memory (`0x6FFF_F000`), with a SHA3-384 over the page, then clears the AES and KUP key
   registers and wipes its copy of the seed.
3. **OP-TEE:** a platform patch reads the page once, wipes it, and uses the 32-byte seed as the root of every key it
   derives (its hardware unique key). It does so only if the page is valid and the flags say the seed was made under
   the black key; otherwise it keeps its development HUK and the TA stays on the lab 62 profile.
4. **The Aegis TA:** derives its ML-DSA-65 key exactly as in lab 62, now from a chip-bound root, reports the
   measurement list, and names the profile `aegis-zynqmp-optee-v1`.
5. **Linux:** the same bridge as before. It holds no key and takes no measurement.

The FSBL's line on the console says which case it was in: `flags=0x7` means a seed made under the black key with the
key registers cleared. `0x5` means a seed, but not under the black key, which is what an unencrypted image gives.

## Run it

### 1. Register the PUF, writing nothing

The red key and its IV are generated on the Windows build PC and kept there, in an owner-only folder. The registration
runs AMD's example over JTAG from RAM, and many things stand between it and the fuses:

- the example's switches checked in the compiled header: only `XSK_PUF_INFO_ON_UART` is `TRUE`;
- the eFUSE write functions made uncallable at compile time;
- a call-graph check of the final ELF: the writers are linked, but nothing reaches them;
- a read-only eFUSE snapshot before the run, which refuses unless CHASH, AUX, REG_DIS, SYN_WRLK and SYN_INVLD are
  blank.

The first try stopped at that last guard, on a bit nobody had written; see
[a factory bit stopped the PUF guard](/projects/fpga-soc/microchip-polarfire-soc/aegis/zynq-ultrascale-endpoint/k13-a-factory-bit-stopped-the-puf-guard/).
With the guard refined, the example printed `PUF Registration Completed`, the syndrome (3,088 hex characters), AUX,
CHASH, the black key (64 hex characters) and its IV (24). The line that would print the red key was removed from the
example first. The parser gave 1,544 bytes of helper data, a 32-byte black key and a 12-byte IV.

The red key passes through the board once, in RAM and in the AES engine, because the PUF can only encrypt a key it is
given. A power cycle follows. The eFUSE cache read before the run and after that power cycle: **44 registers
identical**.

### 2. Build the encrypted, authenticated image

The boot header names the black key as the key source (`0xA35C7C53` at offset `0x28`) and carries the PUF helper data
(attributes `0x0003C8C0`: helper data in the header, 4K mode, boot-header RSA authentication). The FSBL and the PMU
firmware are encrypted; the rest is plain. The red key is not in the image. AMD's documents say PUF regeneration needs
authentication, so the image is signed with an RSA-4096 key held in the boot header, not in fuses. `bootgen -verify`
checks the header and FSBL signatures.

The image is built on the Windows PC, because that is where the red key is. Its partitions (TF-A, OP-TEE, U-Boot, the
bitstream) are copied there, never the other way round. The previous `BOOT.BIN` stays on the card as
`boot-2025.2-optee.bin`.

### 3. The first secure boot

Captured passively on the console, with no JTAG attached:

![The serial console of the first secure boot: the FSBL reports the hand-off with flags 0x7, seven measurements and the black key named in the boot header; TF-A and OP-TEE start and OP-TEE takes its keys from the device seed; U-Boot reports an authenticated, encrypted boot; the Aegis TA has its key on the profile aegis-zynqmp-optee-v1](/aegis/diagrams/console-zynqmp-secure-boot.svg)

### 4. Check the measurements on the PC

Each value is the first 32 bytes of the CSU's SHA3-384 over the partition as stored in `BOOT.BIN`. The PC computes the
same from the same file, so the gateway's policy can be written from the build output alone:

| Label | Bytes | Value | Equal to the PC |
|---|---|---|---|
| `PMUFW` | 129,888 | `43988623...` | yes |
| `FSBL` | 148,000 | `1119b5b5...` | yes |
| `PL` | 7,797,692 | `8e976350...` | yes |
| `TFA` | 40,960 | `4cd0185e...` | yes |
| `TFA.1` | 13,540 | `f468f8d7...` | yes |
| `TEE` | 572,888 | `53352832...` | yes |
| `UBOOT` | 1,453,680 | `5f0a2ef0...` | yes |

`PMUFW` and `FSBL` are hashed as stored, that is encrypted. `TFA.1` is the second load segment of `bl31.elf`. The
values are measurements of what is on the card, read a second time by the FSBL, not of the bytes it loaded.

### 5. The gateway

The new key's SHA-256 is `c02f156d...`; the lab 62 key was `5aefce9c...`. While the gateway still pinned the old key,
it refused the quote: `ML-DSA-65 quote signature invalid`. The entry then pins the new key, the profile
`aegis-zynqmp-optee-v1` and the seven values above:

```text
06:30:35 zynqmp-te0808 ADMITTED (trustzone trust)  [credential: issued session bcfee3cea812...]
06:31:09 zynqmp-te0808 ADMITTED (trustzone trust)  [credential: valid, heartbeat 1 (requests=7;fw=zynqmp-optee-0.1.0)]
```

After a full power cycle the board came back with the same key, `c02f156d...`.

## What it shows

| Check | Result |
|---|---|
| PUF registration in boot-header mode | completed; eFUSE cache identical before and after (44 registers) |
| Boot image | FSBL and PMU firmware encrypted under the black key, boot header authenticated, verified by bootgen |
| First secure boot | `flags=0x7`, 7 measurements; OP-TEE: keys from the device seed; U-Boot: authenticated, encrypted |
| Measurements | all seven equal to the PC's computation from the same `BOOT.BIN` |
| Gateway | the new key refused under the old pin; admitted with trustzone trust once pinned |
| Same image, same chip, power cycle | the same key |

## What it does not do

Every claim above holds within these limits. The project's threat model lists the result as **partly tested**.

- **The red key is on the build PC.** Anyone with that file can compute the seed and the key without the board. It
  stays off the board and out of the repository, and it is the same class of limit as the STM32's published TF-M
  development keys and the RW612's unfused boot.
- **Without the RSA_EN fuse, the boot ROM does not check who signed the image.** The RSA key in the boot header proves
  nothing against someone who rewrites the card. Without the red key such a person cannot make an FSBL that the
  device key decrypts. Whether the boot ROM loads the device key for an unencrypted FSBL whose header names the black
  key is not documented, and has not been tested yet.
- **Linux is not yet kept away from the device key.** The PMU firmware offers AES with the device key to Linux by
  default, and no documented control clears the device key after boot. Making those PMU firmware services secure-only,
  guarding the CSU and OP-TEE's memory with the XPPU and XMPU, `CONFIG_STRICT_DEVMEM`, and probes from Linux that test
  each of these are phase C. Phase C is prepared in the repository, with a test plan of one change per image, but
  it is not on the board yet.
- **The kernel is not measured.** OP-TEE takes and wipes the hand-off page before U-Boot loads the kernel.
- **The hand-off page is not authenticated.** Until the XMPU guards it, root on Linux could plant a page before a warm
  reset. The FSBL always overwrites it, and a planted seed would give a key the gateway's pin refuses.
- **OP-TEE's random numbers come from a software generator seeded from a timer**; no hardware random source is used
  on this platform. They feed ML-KEM key generation and the hedged ML-DSA signatures. A better seed is phase C.
- **No tamper test with these measurements yet.** A modified kernel, bitstream or U-Boot quarantined on its new
  measurement is planned, as is the fuzz harness against the TA's protocol code. The protocol code itself is the
  RW612's, which is fuzzed in CI.
- **JTAG is disabled after a secure boot.** Recovery from a bad image is by the SD card only.

## Where it can go wrong

- **Writing a fuse by accident.** Keep every eFUSE and secure-bit switch of the example `FALSE`, and let the guards run.
  Registration in boot-header mode writes nothing when the switches are as listed.
- **The red key in the wrong place.** It belongs on one PC, in one owner-only folder. Do not copy it to the board, the
  repository or the Linux PC.
- **A secure boot that fails.** JTAG cannot reach the chip any more. Put the card in a reader and copy the previous
  `BOOT.BIN` back.
- **`flags=0x5` instead of `0x7`.** The image is not encrypted under the black key; OP-TEE then keeps its development
  HUK and the TA reports the lab 62 profile.
- **bootgen 2025.2 on Windows and RSA keys.** It fails on every key; sign with an older bootgen.
