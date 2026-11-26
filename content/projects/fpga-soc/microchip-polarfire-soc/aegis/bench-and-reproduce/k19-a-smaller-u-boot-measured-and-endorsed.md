+++
title = "A smaller U-Boot: quarantined, endorsed again, then regressed"
date = '2026-11-26T04:30:00+01:00'
draft = false
description = "U-Boot on the Zynq UltraScale+ endpoint lost what its boot path never used: the memory test, the preboot step, the network stack, USB, SCSI, and a list of file-system code and loaders. One new boot image, with only the U-Boot partition changed. After the power cycle the gateway quarantined the board, as designed, until the new measurement was endorsed and a new signed policy pinned it. Then the regression passed 14 of 14 stages. What was checked before the write, how to go back, and what the pass does not say."
weight = 60

[params]
+++

The page on [the review's fixes](/projects/fpga-soc/microchip-polarfire-soc/aegis/bench-and-reproduce/k18-the-review-fixes-on-the-bench/)
ended with one line: the next step is hardening U-Boot on the Zynq UltraScale+ board, and it has not started. This
page is that step, done on 26 November 2026.

The bridge swap on the same board went unnoticed by the gateway, because the bridge is not measured. U-Boot is
one of the six measurements in the board's quote, so this change had to take the board out of the fleet first.

## What was removed

U-Boot on this board
([lab 61](/projects/fpga-soc/microchip-polarfire-soc/aegis/zynq-ultrascale-endpoint/a14-our-boot-chain-and-the-accelerator/))
does one thing: it reads `boot.scr` from the SD card and runs it, and the script loads the kernel and the device
tree. Five configuration fragments take out what that path does not use:

| Step | Removed |
|---|---|
| C1 | the memory test command |
| C2 | the preboot step, which started USB and SATA at every boot although nothing boots from them |
| C3 | the network stack: DHCP, TFTP, NFS, PXE |
| C4 | USB host and gadget (DFU, fastboot, mass storage) and the SCSI commands |
| C5 | squashfs, ext4 and FAT writing, UBI, the `fpga` and `sf` commands, the EFI loader, `go`, ELF loading, serial loaders, booting other operating systems |

The boot command is byte for byte the same, and SD, FAT reading, `source` and `booti` stay. The ELF file went
from 1,519,792 to 883,320 bytes. The result was audited on the PC first: the configuration before and after, and
every command the boot script uses against what was left.

The plan had one image per step. Each image costs a build on another machine, a power cycle, a new endorsement and
a new policy version, so the five steps went into one image. The price is attribution: had the boot failed, the
answer would have been to go back, not to know which fragment did it.

## One partition changed

The boot image is built on the Windows PC, because that is where the key is
([lab 63](/projects/fpga-soc/microchip-polarfire-soc/aegis/zynq-ultrascale-endpoint/a16-a-key-from-the-puf/)).
The inputs were the new `u-boot.elf` and the same FSBL, PMU firmware, TF-A and OP-TEE as the image the board was
running, with the same options. The Linux PC checked what came back before it went near the card:

- **The file.** SHA-256 `cfdd140f...`, 1,751,416 bytes, equal to what the Windows PC reported.
- **The measurements,** computed from the file and compared with values written down before the build:

| Measurement | Expected | Found |
|---|---|---|
| TF-A (two parts), OP-TEE | unchanged | unchanged |
| U-Boot | `d4d853fa...`, computed from the new ELF | `d4d853fa...` |
| PMU firmware, FSBL | changed | changed |

The PMU firmware and the FSBL are encrypted, and every encrypted build uses new initialisation vectors, so their
measurements change even when their inputs do not. The stop rule was about the other three: if TF-A or OP-TEE had
moved, the build had the wrong input and nothing would be written. They did not move.

## The write

The boot partition is mounted read-only. It was remounted read-write for a short time: the running image was kept
on the card under another name, the new one copied in and compared byte for byte with the PC's copy, and the
partition remounted read-only. The power cycle was done by hand.

## Quarantined, then admitted

The board booted to Linux and the gateway quarantined it. That is the endorsement design, not a fault: the
gateway admits this board only if its measurements match an endorsement record that the signed policy pins by
hash. Any changed measurement means quarantine until a new record is enrolled and a new signed policy names it.

The board reported exactly the measurements computed from the file on the PC. A new record was enrolled and
policy version 14 signed with the new pin; the board's key did not change. The gateway accepted the policy and
admitted the board seven seconds later.

## The regression

`tools/regression.sh --board --with-expiry` then ran in full.

- **First run: 13 of 14.** The red-team stage against the STM32 failed, because it was aimed at the STM32 board
  that is no longer plugged in.
- **Second run, aimed at the connected board: 14 of 14.**

The failed stage has nothing to do with U-Boot. It is here because a page with only the second run would be
tidier than the night was.

## The way back

Put the kept image back as `BOOT.BIN`, put the old endorsement record back, and sign a policy that pins it. That
policy has to be version 15: the gateway refuses a version lower than the one it holds, so the saved version 13
cannot be put back as it is. (Version 15 has since been used by the next step, so the number is now higher.)

## What the pass shows, and what it does not

- **It shows that the new boot chain is measured and endorsed, and that the fleet still works.** It does not show
  that U-Boot is free of bugs. Less code is less to get wrong; nobody tested what is left.
- **The prompt was still there.** The sixth step, C6, removes the key window before the boot command. It was
  skipped on purpose in this image: the bench still used the prompt, so anyone at the serial console could stop
  the boot. It was done later the same day, with its own image and endorsement, and is
  [described here](/projects/fpga-soc/microchip-polarfire-soc/aegis/bench-and-reproduce/k20-u-boot-without-the-key-window/).
- **The kernel, the device tree and `boot.scr` are still not signed and not measured.** Someone who can write the
  card can change them. Closing that needs verified boot in U-Boot, which is not built.
- **A changed U-Boot still runs.** The gateway detects it and quarantines the board; nothing on the board refuses
  it. That [limit](/projects/fpga-soc/microchip-polarfire-soc/aegis/zynq-ultrascale-endpoint/x11-what-the-review-fixed-and-what-stays-open/)
  is unchanged.
- **One boot.** The image has been through one power cycle and one full regression, not a soak.

## Lesson

On a measured board, a change to the boot chain is two changes: the file on the card, and the statement of what
the gateway should expect. The expected measurements were written down before the build, and the old record and
policy were saved before the new ones were signed. The quarantine in between is the system showing that it
noticed.
