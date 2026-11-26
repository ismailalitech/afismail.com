+++
title = "U-Boot without the key window: one line, a new measurement, endorsed again"
date = '2026-11-26T08:30:00+01:00'
draft = false
description = "The smaller U-Boot on the Zynq UltraScale+ endpoint still waited two seconds for a key before it booted. Step C6 removes that wait with one configuration line. One line is still a new U-Boot measurement, so the gateway quarantined the board until the new image was endorsed and a new signed policy pinned it. The regression then passed 14 of 14 stages on the first run. What the line closes, what it leaves open, and what this run did not capture."
weight = 70

[params]
+++

The page on [the smaller U-Boot](/projects/fpga-soc/microchip-polarfire-soc/aegis/bench-and-reproduce/k19-a-smaller-u-boot-measured-and-endorsed/)
listed one step as skipped on purpose: C6, which removes the key window before the boot command. The bench still
used the prompt, so it stayed. Later the same day, 26 November 2026, the step was done. This page is that step.

## One line

U-Boot counts down before it runs its boot command, and a key pressed in that time stops the boot and gives a
prompt. On this board the countdown was two seconds. Anyone at the serial console could use it.

C6 is the same configuration as steps C1 to C5 plus one line, `CONFIG_BOOTDELAY=-2`. With that value U-Boot runs
the boot command at once and does not check for a key.

| | C1 to C5 | C6 |
|---|---|---|
| Removed code | memory test, preboot, network, USB, SCSI, extra file systems and loaders | the same |
| Wait before the boot command | 2 seconds | none |
| A key press during the wait | stops the boot, gives the prompt | not checked |
| Boot command | unchanged | unchanged |
| ELF size | 883,320 bytes | 883,320 bytes |
| U-Boot measurement | `d4d853fa...` | `2556978e...` |

The configuration of the new build was compared with the one before it: that single line is the whole
difference. The ELF has the same size, and a different content.

## The image

The boot image was built the same way as the last one, on the machine that holds the key, from the new
`u-boot.elf` and the same FSBL, PMU firmware, TF-A and OP-TEE. It was checked on the Linux PC before it went near
the card:

- **The file.** SHA-256 `93d4d35a...`, 1,751,416 bytes, the same size as the image before it.
- **The measurements.** TF-A and OP-TEE unchanged. U-Boot changed, to `2556978e...`. The PMU firmware and the
  FSBL changed, as they do in every encrypted build, because each build uses new initialisation vectors.

The stop rule was the same as before: had TF-A or OP-TEE moved, nothing would have been written.

## The write, the quarantine, the regression

The new image went onto the SD card's boot partition, and the image the board was running stayed on the card
under another name. Then the board was restarted.

It booted to Linux and the gateway showed it as QUARANTINED. One changed line in U-Boot is a changed measurement,
and the gateway admits this board only on measurements that a signed policy pins. A new endorsement record was
enrolled and policy version 15 signed. The board was ADMITTED about seven seconds after the policy went live.

The full regression then ran: 14 of 14 stages, on the first run.

## What it closes, and what it does not

- **It closes the key press.** On a boot that works, there is no window in which a key stops U-Boot.
- **It does not remove the prompt.** If the boot command fails, for example because the boot script or the
  kernel is missing from the card, U-Boot still ends at its prompt. Someone who can make the boot fail can still
  get there. Closing that needs more than this line.
- **The kernel, the device tree and `boot.scr` are still not signed and not measured.** That
  [limit](/projects/fpga-soc/microchip-polarfire-soc/aegis/zynq-ultrascale-endpoint/x11-what-the-review-fixed-and-what-stays-open/)
  is unchanged.
- **It costs the bench something.** Typing other boot arguments at the prompt for a test no longer works on a
  good boot. A test that needs them now needs a change on the card, or the earlier image.

## What was not captured

No serial log of this boot was captured. So there is no capture that shows the countdown line missing, and no
recording of a key press being ignored. The evidence is the configuration of the build and a clean boot: the
board reached Linux, was admitted on the new U-Boot measurement, and passed the regression.

It is also one boot. The image has been through one restart and one full regression, not a soak.

## The way back

Going back does not depend on the prompt. The card comes out and goes into a reader on the PC, the kept image
goes back as `BOOT.BIN`, the earlier endorsement record goes back, and a new policy pins it. That policy needs a
version higher than 15, because the gateway refuses a version lower than the one it holds.

## Lesson

A small change is not a small event on a measured board. One configuration line produced a new measurement, a
quarantine, a new record and a new policy version, the same as five fragments did earlier the same day. That is the
cost of the gateway noticing everything, and the reason to decide what a hardening step closes before paying it:
this one closes a key press, and the page says so instead of saying the console is closed.
