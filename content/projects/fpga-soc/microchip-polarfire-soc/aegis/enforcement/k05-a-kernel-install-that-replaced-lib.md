+++
title = "A kernel install that replaced /lib"
date = '2026-11-17T00:30:00+01:00'
draft = false
description = "Installing a kernel with packet filtering replaced the root file system's /lib symlink with a real directory. Nothing running broke, because of where the loader lives. How it was repaired before the reboot, and what the installer does now."
weight = 20

[params]
+++

Turning the gateway's decisions into blocked traffic needs a kernel with packet filtering, a bridge and 802.1Q support, and the running kernel had none of them. A new kernel was built and installed on the board. The install script made a mistake that could have made the board unbootable. It was caught before the reboot.

## What was installed

| Item | Where |
|---|---|
| The new kernel image (with the unchanged device tree and boot script) | the boot partition of the SD card |
| The in-tree modules | `/lib/modules` |
| Two out-of-tree modules, rebuilt for this kernel | the same tree |

The script keeps the proven kernel image untouched, saves the running one as a second file, and saves the module tree as an archive. A rollback script restores both. The notes say to install only with someone at the board: if the new kernel does not boot, recovery means putting the SD card in a PC.

## What went wrong

On this root file system `/lib` is a symlink to `usr/lib` (a merged `/usr`). The script unpacked the module archive with `tar xzf modules.tgz -C /`. The archive contains a `lib/` directory entry, and GNU tar's default is to **replace the symlink with a real directory** for such an entry. The new `/lib` held only the new modules. The script then stopped at its next step.

## Why nothing broke at once

The old modules were still in `/usr/lib/modules`, untouched. Running programs were unaffected, because the dynamic loader and the libraries live in `/usr/lib`, which was never touched. The damage was latent: a program started afterwards that looked for something under `/lib` would have found a nearly empty directory, and the next boot's module loading would have looked in the same place.

## Repair, before the reboot

1. One Python process renamed the stray `/lib` and recreated the symlink, so there was no instant without a `/lib`.
2. The modules were extracted under `/usr`, where the symlink points.
3. The out-of-tree modules were copied, `depmod` was run, and the stray tree was removed after checking that it matched.

The boot partition and the module backup were correct throughout: the new kernel image was in place, the previous one was saved as `fitImage.pre-aegis`, and the proven one as `fitImage.good`. The old module tree was archived (111 files).

## Result

The board booted in about 25 seconds with the new kernel. The packet-filter, bridge and VLAN options were on, the `nft` tool worked, the remote core attached, all modules loaded, and the kernel printed no warnings. After a second reboot the STM32 was still admitted with its session, and the full board regression passed 12 of 12.

The installer now extracts under `/usr` when `/lib` is a symlink.

## What it means for you

- On a merged-`/usr` system, never extract an archive that contains a `lib/` entry over `/`. Extract under `/usr`, or check with `ls -ld /lib` first.
- Keep the old kernel and modules as files you can restore from, and keep the installer's undo as a script, not as a note.
- Make the first install with someone at the board. A kernel that fails to boot cannot be fixed over the network.

## It happened again, on the Zynq

The same tar default later caught the Zynq UltraScale+ endpoint, when its own kernel's modules were unpacked
into `/` on Debian. This time no new program could start, because the loader is found through `/lib`. It was repaired
from the serial console by running `mv` and `ln` through the loader itself, and the modules now go in with
`tar --keep-directory-symlink`
([lab 61](/projects/fpga-soc/microchip-polarfire-soc/aegis/zynq-ultrascale-endpoint/a14-our-boot-chain-and-the-accelerator/)).
