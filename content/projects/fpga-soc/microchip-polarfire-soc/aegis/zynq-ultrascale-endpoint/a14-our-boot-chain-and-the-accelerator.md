+++
title = "Our own boot chain and kernel on the Zynq UltraScale+, and the Aegis accelerator in the PL"
date = '2026-11-19T06:05:00+01:00'
draft = false
description = "Replace every boot file the board came with by one built here: FSBL and PMU firmware from Vitis 2025.2 with the module's hooks ported, TF-A, U-Boot and a 6.12 kernel. Try each new boot image over JTAG in RAM before it goes on the card, then put the PolarFire's second accelerator in the PL and run its self-test."
weight = 20

[params]
  lab = 61
  board = "Trenz TE0807 (XCZU4EG) on a TEBF0808 carrier, PolarFire SoC Discovery Kit"
  core = "Cortex-A53 (FSBL, TF-A, U-Boot, Linux), PL"
  level = "Advanced"
+++

[Lab 60](/projects/fpga-soc/microchip-polarfire-soc/aegis/zynq-ultrascale-endpoint/a13-a-linux-board-with-software-trust/)
ran on the boot files the board came with. Nothing in them was built here, and the later steps need to change the FSBL,
TF-A and the device tree. After this lab every file on the boot partition comes from sources in the repository, the
kernel is linux-xlnx 6.12, and the PL holds the Aegis accelerator from
[lab 54](/projects/fpga-soc/microchip-polarfire-soc/aegis/post-quantum-in-fabric/a08-sponge-accelerator/).

## Before you start

- Lab 60 done: the board on the network, admitted with software trust.
- AMD Vivado and Vitis 2025.2 (here on a Windows PC), and Trenz's public TE0807 StarterKit for 2022.2, which supplies
  the board files and the FSBL hook sources. The expected archive and its SHA-256 are in
  `endpoints/zynqmp/windows/README.txt`.
- On the Linux PC: TF-A, U-Boot and the kernel from AMD's `xilinx-v2025.2` tags, and an aarch64 cross-compiler.

## The boot chain

| Part | Built from | Notes |
|---|---|---|
| `fsbl.elf` | Vitis 2025.2 `zynqmp_fsbl`, with Trenz's TE0807 hooks ported from their 2022.2 StarterKit | the hooks set the carrier's I2C switches and the Si5345 clock generator |
| `pmufw.elf` | Vitis 2025.2 `zynqmp_pmufw` | |
| `system.bit` | Vivado 2025.2, board part `te0807_4eg_1e_tebf0808` rev 4.0 | first an empty PL; the accelerator comes in step 4 |
| `bl31.elf` | TF-A xilinx-v2025.2 (v2.12), `PLAT=zynqmp RESET_TO_BL31=1` | |
| `u-boot.elf` | u-boot-xlnx xilinx-v2025.2, `xilinx_zynqmp_virt_defconfig` plus `u-boot-aegis.config` | no environment, eMMC and QSPI disabled: it can write neither |
| `boot.scr` | `boot.cmd` | loads the kernel and device tree from the SD card |

bootgen packs the first five into `BOOT.BIN` from `boot.bif`.

Porting the hooks (`patch_fsbl_te.ps1`) needed more than copying files. In 2025.2 the drivers are looked up by base
address, and the generated `psu_init.c` differs, so the patch exports the tail of `psu_init()` (SERDES, peripherals,
power-down, AFI and QoS set-up) and the hook calls it after the clock generator is set. It also fixes a bug: a failing `psu_init` step returned 0, which the FSBL reads as success. The patch stops with
`PATCH FAILED` if any anchor in AMD's sources has moved.

## Run it

### 1. Try the new image over JTAG first

`windows/jtag_boot.tcl` sets `BOOT_MODE_USER` to JTAG, a volatile register that power-on reset clears, so the boot ROM
does not run the card's FSBL. It then loads the PMU firmware, FSBL, TF-A and U-Boot into RAM. On the first attempt the
chain reached Linux and Debian. It showed two things to fix: a random MAC address, and a detour through JTAG and PXE
in U-Boot's default boot order. The device tree now gives a fixed `local-mac-address`, and `bootcmd` runs `boot.scr`
from the SD card.

After a JTAG test a warm reboot does not boot from the card. Power-cycle the board (S1 twice). A JTAG test also has
to start from power-on, not from a running Linux; see
[a JTAG boot after Linux stalled in init_serdes](/projects/fpga-soc/microchip-polarfire-soc/aegis/zynq-ultrascale-endpoint/k12-a-jtag-boot-after-linux-stalled/).

### 2. Then on the card, with the old one kept

The new `BOOT.BIN` goes on the card, and the one the board came with stays next to it as `boot-2019.bin`. Each later
image is kept the same way, so going back is a file copy. The console from a power-on reset (an excerpt):

```text
Zynq MP First Stage Boot Loader (TE0807 hooks, Aegis 2025.2)
Release 2025.2   Nov 18 2026  -  20:27:58
NOTICE:  BL31: v2.12.0(release):xilinx-v2025.2
U-Boot 2025.01-gdf4ec3c8da27-dirty (Nov 18 2026 - 20:35:45 +0100)
Model: Trenz TE0807 (XCZU4EG) on TEBF0808, Aegis endpoint
Secure Boot:    not authenticated, not encrypted
Loading Environment from nowhere... OK
```

The gateway's policy got the new `BOOT` and `KERNEL` values, and the old ones were removed. One cycle with
`boot.scr` changed by one added `echo` line checks the policy still bites:

![The gateway journal for the Zynq UltraScale+ board in three stages: software trust with a tamper test quarantined on KERNEL, then trustzone-devkey trust with OP-TEE, then trustzone trust with the key from the PUF](/aegis/diagrams/console-zynqmp-gateway.svg)

The first block is this lab: admitted with heartbeats, quarantined on `KERNEL not allowed` when the boot script
changes, admitted again with a new session when it is put back. The other two blocks are labs 62 and 63.

### 3. Our kernel

linux-xlnx xilinx-v2025.2 (6.12.0), `make ARCH=arm64 xilinx_defconfig` plus `CONFIG_TEE` and `CONFIG_OPTEE`, with the
project's device tree `zynqmp-te0807-aegis.dts`. `Image` and the `.dtb` go on the FAT partition; `boot.cmd` boots them,
and falls back to the card's original `image.ub` if either file is missing. The tree enables only the SD card, so the
root is `/dev/mmcblk0p2`. sshd listens 8 s after boot. The prover measures `Image`, the device tree and `boot.scr`,
and the gateway admits the board on the new `KERNEL` value.

The kernel's modules go in with:

```sh
tar xzf modules.tgz --keep-directory-symlink --no-same-owner -C /
```

The first install did it without `--keep-directory-symlink`. The archive's paths start with `lib/`, and tar replaced
Debian's `/lib -> usr/lib` link with a directory that held only the new modules. The dynamic loader is found through
`/lib`, so no new program could start, not even `mv` or `ln`. It was repaired without a reboot, from the root shell
already open on the serial console: the loader itself, `/usr/lib/aarch64-linux-gnu/ld-linux-aarch64.so.1`, can be run
with a program as its argument, and that is how `mv` moved the stray directory aside and `ln` put the link back.

The same tar default had already caught the PolarFire gateway once; see
[a kernel install that replaced /lib](/projects/fpga-soc/microchip-polarfire-soc/aegis/enforcement/k05-a-kernel-install-that-replaced-lib/).

### 4. The accelerator in the PL

The accelerator is the PolarFire's second one (`hw/rtl/aegis_pqc2`): the Keccak sponge with a DMA squeeze and the
FIPS 203/204 NTT. On this chip it sits behind an AXI-to-APB bridge on `M_AXI_HPM0_LPD`, with its registers at
`0x8000_0000`, and its DMA master on `S_AXI_HP0_FPD` reaches DDR only. `windows/build_hw_pqc.tcl` builds it:

| Item | Result |
|---|---|
| Clock | `pl_clk0`, 100 MHz |
| Timing | WNS +3.159 ns, WHS +0.033 ns, TNS and THS 0; 0 errors, 0 critical warnings |
| Whole design | 8,156 CLB LUTs (9.3 %), 2,970 flip-flops (1.7 %), 1 RAMB36 and 1 RAMB18, 15 DSP |
| The core alone | 7,514 LUTs, 2,183 flip-flops, the same RAMs and DSPs |

The new XSA changes the PS configuration (the HP0 port, the PL clock), so the FSBL and the PMU firmware are rebuilt
from it. `boot.cmd` passes `clk_ignore_unused`, so that the kernel does not switch off `pl_clk0`, which the device
tree does not describe.

In the JTAG test, `xsdb` must also remove the PS-PL isolation and release the PL reset after loading the bitstream
(`psu_ps_pl_isolation_removal`, `psu_ps_pl_reset_config`). Without it the first register read timed out. On an SD
boot the FSBL does this itself. Then the ID register read `0xAE150002`, before U-Boot and under Linux.

The self-test (`gateway/pqc/pqc_selftest`, cross-built for aarch64) reaches the registers through `/dev/mem` with
`AEGIS_PQC_DEVMEM=0x80000000`, and compares every operation with a software reference, 500 times each:

| Operation | Mismatches | Core cycles | Wall time, PL | Wall time, software |
|---|---|---|---|---|
| Keccak | 0 | 1,002 | 20.4 us | 20.6 us |
| ML-KEM NTT | 0 | 904 | 107.7 us | 51.9 us |
| ML-KEM inverse NTT | 0 | 904 | 107.7 us | 59.1 us |
| ML-DSA NTT | 0 | 1,032 | 109.0 us | 94.0 us |
| ML-DSA inverse NTT | 0 | 1,032 | 109.0 us | 102.6 us |

Correct, and not faster than the Cortex-A53 in software. Each operation spends about 10 us in the core at 100 MHz;
the rest of the wall time is 32-bit register transfers through the APB bridge. That is the limit the first PolarFire
accelerator showed in [lab 49](/projects/fpga-soc/microchip-polarfire-soc/aegis/post-quantum-in-fabric/a03-fabric-accelerator/):
moving the data over a register bus costs more than the computation. The bitstream is inside `BOOT.BIN`, so a changed bitstream changes the `BOOT`
measurement; the gateway admits the board on the new value.

## What it shows

| Check | Result |
|---|---|
| Boot chain built here, JTAG RAM boot | FSBL, TF-A, U-Boot, Linux and Debian on the first attempt |
| The same chain from the card | boots; admitted on the new values, old values removed |
| `boot.scr` with one added line | quarantined: `KERNEL not allowed`, credential revoked |
| Kernel 6.12 | boots, sshd after 8 s, admitted on the new `KERNEL` value |
| Accelerator in the PL | timing met at 100 MHz; 0 mismatches in 500 runs of each operation |

## What it does not do

The trust is still `software trust`: the same key file, and Linux still hashes the files it booted from. The tamper
test shows the policy works, not that a modified Linux would report itself. The accelerator is a performance block
here as on the PolarFire, and the services do not use it.

## Where it can go wrong

- **Reading the accelerator with an empty PL.** With a bitstream that does not contain it, a read at `0x8000_0000` is
  never answered: no AXI slave sits there, and the CPU hangs until a power cycle. Only read it with this bitstream
  loaded; the driver's comment says so too.
- **A JTAG test that cannot reach the PL.** Remove the PS-PL isolation and release the PL reset after `fpga`.
- **No boot from the card after a JTAG test.** `BOOT_MODE_USER` still says JTAG; power-cycle the board.
- **Modules that replace `/lib`.** Use `--keep-directory-symlink`, and check `ls -ld /lib` afterwards.
- **A new XSA with the old FSBL.** Rebuild the FSBL and the PMU firmware from every XSA that changes the PS.
