+++
title = "OP-TEE holds the key: the Aegis protocol as a trusted application on the Zynq UltraScale+"
date = '2026-11-19T06:10:00+01:00'
draft = false
description = "Move the key, the ML-KEM exchange and the session out of Linux into an OP-TEE trusted application that runs the same protocol code as the RW612's secure partition. Linux becomes a pipe. The key still comes from OP-TEE's fixed development key, and the gateway's verdict says so: trustzone-devkey."
weight = 30

[params]
  lab = 62
  board = "Trenz TE0807 (XCZU4EG) on a TEBF0808 carrier, PolarFire SoC Discovery Kit"
  core = "Cortex-A53 (TF-A, OP-TEE, Linux), U54 (Linux)"
  level = "Advanced"
+++

After [lab 61](/projects/fpga-soc/microchip-polarfire-soc/aegis/zynq-ultrascale-endpoint/a14-our-boot-chain-and-the-accelerator/)
the boot chain is ours, but Linux still holds the key. This lab is phase A of the project's design for this board
(`docs/zynqmp-key-design.md`): the ML-DSA-65 key, the quotes, the ML-KEM exchange and the KMAC session move into the
TrustZone secure world, and Linux only carries request lines to it. The key itself does not yet belong to the chip;
that is [lab 63](/projects/fpga-soc/microchip-polarfire-soc/aegis/zynq-ultrascale-endpoint/a16-a-key-from-the-puf/).

## Before you start

- Lab 61 done: the board boots our `BOOT.BIN` and kernel from the card.
- OP-TEE 4.7, built for `PLATFORM=zynqmp-zcu102` (UART0, 4 GiB, secure memory at `0x6000_0000`), its TA dev kit,
  mldsa-native and mlkem-native v2.0.0.
- The project repository: `endpoints/zynqmp/optee/`.

## The design

The Zynq follows the split of the RW612 with TF-M, with other parts:

| RW612 with TF-M ([lab 58](/projects/fpga-soc/microchip-polarfire-soc/aegis/attesting-an-endpoint/a12-trustzone-on-the-rw612/)) | Zynq UltraScale+ |
|---|---|
| TF-M on the Cortex-M33's secure side | TF-A (BL31, `SPD=opteed`) and OP-TEE 4.7 on the Cortex-A53s |
| the Aegis secure partition | the Aegis trusted application (TA), built into OP-TEE |
| the non-secure prover: lwIP, TCP 7444, `psa_call` | `aegis_tee_bridge` on Linux: TCP 7444, `/dev/tee0` |
| the key from ELS | the key from OP-TEE's hardware unique key (HUK) |

- **The TA** runs `aegis_proto.c`, the protocol code of the RW612's partition, with the STM32 partition's KMAC and
  ML-KEM units. Its seed comes from OP-TEE's system PTA, which derives a key unique to this TA from the HUK and the
  TA's UUID. It is built into OP-TEE as an early TA (`EARLY_TA_PATHS`), so it is part of `BOOT.BIN` and Linux never
  loads it. The gateway's public key is compiled into it, to check the gateway's credentials.
- **The bridge** reads one request line per connection, passes it unchanged to the TA and sends back the reply. It
  holds no key, no seed and no session, and takes no measurement.

## Run it

### 1. Build

`build_ta.sh` stages the shared sources and a `gateway_pk.h` made from the gateway's identity record, then builds the
TA. OP-TEE takes it in with `EARLY_TA_PATHS`. TF-A is rebuilt with `SPD=opteed`. The device tree reserves
`0x6000_0000`-`0x7FFF_FFFF` (`no-map`) so that neither U-Boot nor Linux touches OP-TEE's memory.

OP-TEE goes into `BOOT.BIN` as `tee-raw.bin`, loaded and started at `0x6000_0000`:

```text
[destination_cpu=a53-0, exception_level=el-1, trustzone, load=0x60000000, startup=0x60000000] tee-raw.bin
```

Not `tee.elf`: OP-TEE loaded from the ELF took an alignment fault at start-up. See [tee.elf without its init data](/projects/fpga-soc/microchip-polarfire-soc/aegis/zynq-ultrascale-endpoint/k11-tee-elf-without-its-init-data/).

### 2. Boot over JTAG, then from the card

As in lab 61, the new image first runs from RAM over JTAG, then goes on the card with the previous one kept. The JTAG
test must start from a power-on; see
[a JTAG boot after Linux stalled in init_serdes](/projects/fpga-soc/microchip-polarfire-soc/aegis/zynq-ultrascale-endpoint/k12-a-jtag-boot-after-linux-stalled/).
From the card:

```text
NOTICE:  BL31: Secure code at 0x60000000
NOTICE:  BL31: v2.12.0(release):xilinx-v2025.2
I/TC: OP-TEE version: 4.7.0 (gcc version 13.3.0 ...) aarch64
I/TC: Primary CPU switching to normal world boot
OF: reserved mem: 0x0000000060000000..0x000000006fffffff (262144 KiB) nomap non-reusable optee_core@60000000
optee: revision 4.7 (86846f4fdf14f25b)
optee: initialized driver
AEGIS-TEE-BRIDGE ready on 7444
```

The Linux prover of lab 60 is disabled; `aegis-tee-bridge.service` takes port 7444.

### 3. From the PC

`PQKEY` returns the key, and `PQCHAL` a quote in 0.03 s with a valid ML-DSA-65 signature. The claims say what this
step is:

| Field | Value |
|---|---|
| Key | ML-DSA-65, SHA-256 `5aefce9c...` |
| Profile | `aegis-zynqmp-optee-devhuk-v1` |
| Instance ID | `0x02` followed by the key hash |
| Components | one: `BOOTCHAIN`, value 0, described as `not measured (phase A: no boot hand-off)` |

A zero value with a description is deliberate: no verifier can mistake it for a measurement.

### 4. The gateway

The gateway gets a new kind, `aegis-tee`, with two profiles: `aegis-zynqmp-optee-devhuk-v1` is labelled
`trustzone-devkey`, and `aegis-zynqmp-optee-v1` (lab 63) `trustzone`. The entry pins the `-devhuk` profile and the
new key, and allows `BOOTCHAIN` 0 for this phase only:

![The gateway journal for the Zynq UltraScale+ board in three stages: software trust with a tamper test quarantined on KERNEL, then trustzone-devkey trust with OP-TEE, then trustzone trust with the key from the PUF](/aegis/diagrams/console-zynqmp-gateway.svg)

The second block is this lab. The `QUARANTINED` line is the power-on reset. After it the board came back with the same
key, so the pin held across the reboot, and the TA issued, kept and proved its session with heartbeats. The
accelerator self-test still passes on this boot (`pqc_selftest 100`: 0 mismatches).

## What it shows

| Check | Result |
|---|---|
| OP-TEE 4.7 with the Aegis TA, from the card | boots; Linux's `optee` driver finds revision 4.7 |
| Quote through the bridge | 0.03 s, valid signature, profile `aegis-zynqmp-optee-devhuk-v1` |
| Gateway | admitted (trustzone-devkey trust), credential issued to the TA, KMAC heartbeats |
| Power-on reset | the same key afterwards; the pin holds |
| Where the key, the exchange and the session live | in the secure world; Linux holds none of them |

## What it does not do

- **The key does not belong to the chip.** It comes from OP-TEE's default HUK, a fixed value that is the same on
  every chip. Every board with this image has the same key. That is why the label is `trustzone-devkey`.
- **Nothing is measured.** `BOOTCHAIN` 0 says so.
- **OP-TEE's memory is withheld from Linux by the device tree only.** Against root on Linux that holds only once the
  DDR's XMPU guards it and `/dev/mem` is restricted (`CONFIG_STRICT_DEVMEM`). Both are phase C of the design, not done
  yet.

## Where it can go wrong

- **OP-TEE as `tee.elf`.** An alignment fault at start-up. Use `tee-raw.bin`.
- **A JTAG test after Linux ran.** The FSBL stalls in `init_serdes`. Start every JTAG test from a power-on.
- **No TA line on the console.** The card's build logs with `IMSG`, which the TA dev kit's default log level compiles
  out. A JTAG build that used `EMSG` printed `Aegis TA: key ready`; the card's build prints nothing, and works.
- **The kernel's `optee` driver says `api uid mismatch`.** OP-TEE is not loaded: the card still has the `BOOT.BIN` of
  lab 61.
