+++
title = "A Zynq UltraScale+ board on the gateway: identify the chip, then attest Linux with software trust"
date = '2026-11-19T06:00:00+01:00'
draft = false
description = "Find out which chip is on a Trenz TE0807 module with read-only JTAG reads, boot Debian on it, and have the gateway attest it with the Linux prover. The verdict says software trust, because the key is a file and Linux measures itself; the next three labs replace each part."
weight = 10

[params]
  lab = 60
  board = "Trenz TE0807 (XCZU4EG) on a TEBF0808 carrier, PolarFire SoC Discovery Kit"
  core = "Cortex-A53 (Linux), U54 (Linux)"
  level = "Intermediate"
+++

After this lab a Zynq UltraScale+ board runs Debian, answers the gateway's challenge with the same protocol as the
other endpoints, receives an ML-KEM-768 credential and keeps a session alive with KMAC heartbeats. The gateway labels
the verdict `software trust`. That label is honest: the ML-DSA-65 key is a file, and Linux measures its own files. It
is the baseline that labs 61 to 63 improve, one part at a time.

The board replaces a Zynq-7010 board that ran the same Linux prover. The newer chip adds what the later labs need: a
PUF, the AES and SHA-3 engines of its configuration and security unit (CSU), and Cortex-A53 cores with TrustZone.

## Before you start

- [Lab 50](/projects/fpga-soc/microchip-polarfire-soc/aegis/attesting-an-endpoint/a04-attest-the-stm32/) working: the
  gateway's `aegis-fleet` service attests endpoints every cycle.
- The board: a Trenz **TEBF0808-04A** carrier with a **TE0807** module (XCZU4EG-1E, 4 GB DDR4) under a fan, a TE0790
  JTAG adapter on J12 (it carries the MPSoC's JTAG and its UART), a 12 V supply and a microSD card.
- A Linux PC for the root file system, and a PC with AMD's `xsdb` for the JTAG reads (here a Windows PC with Vivado
  2019.1).
- The project repository: `endpoints/zynqmp/`.

## Rules for this board

As on the other boards, nothing irreversible:

- **No eFUSE is written.** No eFUSE example is built or run, and no Vivado or `xsdb` eFUSE command is used.
- **The BBRAM key is not programmed.** It could be cleared again, but nothing needs it.
- **Never run FTDI's EEPROM tools on the TE0790 adapters.** They erase the Xilinx JTAG licence stored in the adapter.
- **12 V on one input only**: the ATX connector J20 or the 2.1 mm jack J25, never both. Revision 04A of the carrier has
  no TVS diodes on the input; revision 05 added them. Check the label before the first power-on.

Power-on is two steps: 12 V, then the button **S1**. The 12 V input alone powers only the carrier's controller.

## 1. Identify the chip

The chip is read over JTAG through the TE0790, with register reads only:

| Read | Value | Meaning |
|---|---|---|
| JTAG chain | `xczu4` (IDCODE `04721093`), `arm_dap` (`5ba00477`) | an XCZU4 device; four Cortex-A53 and two Cortex-R5 cores behind the DAP |
| CSU IDCODE, `0xFFCA0040` | `04721093` | the same |
| CSU VERSION, `0xFFCA0044` | `00000513` | |
| BOOT_MODE_USER, `0xFF5E0200` | `00000005` | boot from SD1 |
| eFUSE IPDISABLE, `0xFFCC1018` | `00000100` | bit 8 (VCU disabled) set, bit 5 (GPU disabled) clear: an **XCZU4EG**, not an EV |

TF-A and U-Boot agree later: `ATF running on XCZU4EG/silicon v4`, `Chip ID: zu4eg`. The gateway still calls the board
`zynqmp-te0808`, a name given before the module was identified; it is a TE0807 on a TEBF0808.

## 2. Debian on the network

`setup_rootfs.sh` configures a Debian 12 arm64 root file system made with debootstrap: the prover, the gateway's public
key and liboqs 0.16.0 built for aarch64. `make_sd.sh` writes the card: the boot files on a FAT partition, the root file
system on the second.

For this first step the boot files are the ones the board came with: an FSBL from 2019.2, TF-A v2.0, PMU firmware v1.1,
U-Boot 2019.01 and Linux 4.19.0-rt1. The card's earlier contents were saved as a full copy on the PC first.

The first boot found two things, both fixed in `setup_rootfs.sh`:

- systemd renames the Ethernet interface `eth0` to `end0`, so the network configuration names both.
- `random: crng init done` came **3 minutes** after boot, because this kernel uses no hardware random generator.
  sshd's start timed out, and the first quote took 17 s against the gateway's 20 s timeout. With `haveged` installed a
  quote takes 0.09 s.

## 3. The prover and the gateway

The Linux prover (`endpoints/zybo/aegis_linux_prover.py`, written for the earlier board and unchanged) runs as
`aegis-linux-prover.service` on TCP 7444. It holds an ML-DSA-65 key in a file and reports three measurements:

| Claim | What Linux hashes | Value at enrolment |
|---|---|---|
| `BOOT` | SHA-256 of `BOOT.BIN` | `e1b6ca33...` |
| `KERNEL` | SHA-256 of `image.ub` | `e6044377...` |
| `PROVER` | SHA-256 of the prover script | `69e3cc17...` |

The claims carry the profile `aegis-linux-software-v1`. On the gateway the board is an endpoint of kind
`aegis-linux`, and its key is enrolled with `fleet.py enroll-pq`, which keeps the pins of the other endpoints. The
enrolled key's SHA-256 is `f43f9ebb...`. The gateway reloads its policy every cycle:

```text
18:26:21 zynqmp-te0808 ADMITTED (software trust)  [credential: issued session 5b5f0b6e512a...]
18:26:58 zynqmp-te0808 ADMITTED (software trust)  [credential: valid, heartbeat 1 (uptime_s=529;link=1;fw=linux-0.1.0)]
18:27:34 zynqmp-te0808 ADMITTED (software trust)  [credential: valid, heartbeat 2 (uptime_s=565;link=1;fw=linux-0.1.0)]
```

## What it shows

| Check | Result |
|---|---|
| Chip | XCZU4EG, from the JTAG chain, the CSU and the eFUSE cache, confirmed by TF-A and U-Boot |
| Quote time | 17 s before `haveged`, 0.09 s after |
| Gateway | admitted with software trust, ML-KEM credential issued, KMAC heartbeats verified |

## What it does not do

The key is a file on the SD card, and the measurements are taken by the Linux they describe. A modified Linux could
report the good values and sign them with the same key. Anyone who copies the card has the key. The label
`software trust` says exactly that. The following labs change it step by step:

1. [Lab 61](/projects/fpga-soc/microchip-polarfire-soc/aegis/zynq-ultrascale-endpoint/a14-our-boot-chain-and-the-accelerator/):
   a boot chain and a kernel built here, and the Aegis accelerator in the PL.
2. [Lab 62](/projects/fpga-soc/microchip-polarfire-soc/aegis/zynq-ultrascale-endpoint/a15-optee-holds-the-key/):
   the key and the protocol move into OP-TEE; Linux only carries the lines.
3. [Lab 63](/projects/fpga-soc/microchip-polarfire-soc/aegis/zynq-ultrascale-endpoint/a16-a-key-from-the-puf/):
   the key comes from this chip's PUF, and the boot chain measures what it loads.

## Where it can go wrong

- **Nothing happens at power-on.** Press S1 after the 12 V is on.
- **The quote times out at the gateway.** Check `random: crng init done` in the kernel log; install `haveged` or use a
  kernel with a hardware random source.
- **No network after boot.** The interface is `end0`, not `eth0`.
- **Both power inputs connected.** Use one. On revision 04A there is no input protection.
