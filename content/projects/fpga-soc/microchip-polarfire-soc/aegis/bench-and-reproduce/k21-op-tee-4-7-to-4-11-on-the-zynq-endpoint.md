+++
title = "OP-TEE 4.7 to 4.11 on the Zynq endpoint: a new TEE measurement, the same key"
date = '2026-11-26T09:00:00+01:00'
draft = false
description = "The Zynq UltraScale+ endpoint moved from OP-TEE 4.7.0 to 4.11.0 plus three later upstream commits. The key lives in OP-TEE, so the first question was whether the board would come back with the same key. A host test answered that before any image was built. On the board, one partition of the boot image changed, the gateway quarantined the board until the new measurement was endorsed and policy version 13 pinned it, and the key was the same. Why the move, a trap in the port, what was tested on the PC, the way back, and what the result does not show."
weight = 80

[params]
+++

The two U-Boot pages in this section
([the smaller U-Boot](/projects/fpga-soc/microchip-polarfire-soc/aegis/bench-and-reproduce/k19-a-smaller-u-boot-measured-and-endorsed/)
and [the key window](/projects/fpga-soc/microchip-polarfire-soc/aegis/bench-and-reproduce/k20-u-boot-without-the-key-window/))
both say that OP-TEE did not move. That is because it had moved four days before, on 22 November 2026, from 4.7.0
to 4.11.0. This page is that step. On the bench it was called W1.

## Why

On this board
[OP-TEE holds the key](/projects/fpga-soc/microchip-polarfire-soc/aegis/zynq-ultrascale-endpoint/a15-optee-holds-the-key/)
and runs the protocol. OP-TEE 4.7.0 is older than a number of upstream fixes in two areas this build uses:

- **Registered shared memory**, which the build enables.
- **Opening and closing sessions**, with two threads.

Most of those fixes are in 4.10.0 and 4.11.0. Which ones are in the 4.11.0 tag was checked against the upstream
repository, commit by commit, not read from release notes.

## What the new image carries

- **OP-TEE 4.11.0** with the Aegis platform patch moved onto it.
- **Three upstream commits that came after 4.11.0:** the last commit of the session series, an overflow check on
  shared-memory spans, and a check on zero-size buffers. All three apply cleanly. The last two do not fix a
  memory-safety problem on this build. They were taken so that the image has every upstream fix in the two areas.

The make line is the same, and every configuration value the two versions share is the same. The raw image went
from 576,984 to 581,144 bytes. It builds reproducibly: the same bytes from the patched tree and from a clean
4.11.0 checkout with the patches applied.

## A trap in the port

Between 4.7.0 and 4.11.0 upstream renamed a platform hook, and 4.11.0 calls it only when a configuration option is
set. A platform patch that still defines the old name builds and links with no error and no warning. The old
function is then never called, and OP-TEE uses its own default.

The port renames the function, sets the option, and checks in the linked ELF that the symbol is the platform's
one. A build that succeeds does not say which of two definitions was linked.

## Host tests

The board's key is derived inside OP-TEE. If any step of that derivation had changed between the two versions, the
board would come back with another key and the gateway would refuse it. So this was tested on the PC, before any
boot image was built:

- **Key invariance.** A test builds the derivation code of each tree on the PC, feeds both the same test inputs,
  and compares 4.7.0, 4.11.0 and an independent implementation in Python. All three agree. Two negative controls,
  one flipped byte in the application's identifier and one changed constant, both fail, as they must.
- **The trusted application** builds against the 4.11.0 development kit with no warnings. Its source did not change.
- **The Linux side.** The interface that the kernel's OP-TEE driver uses has additions only. This was read from
  the source, not tested.

## On the board

Only the OP-TEE partition of the boot image changed. The image was built on the machine that holds the key and
checked on the Linux PC before the write:

| Measurement | Expected | Found |
|---|---|---|
| OP-TEE | `011989d7...` to `3566e76b...`, computed from the new file | `3566e76b...` |
| TF-A (two parts), U-Boot | unchanged | unchanged |
| PMU firmware, FSBL | changed, as in every encrypted build | changed |

The stop rule: if TF-A or U-Boot had moved, the build had the wrong inputs and nothing would be written.

The image the board was running stayed on the card under another name. The board booted the new image at the
first try, and Linux reported OP-TEE revision 4.11. The gateway quarantined the board, as designed. A new
endorsement record was enrolled and policy version 13 signed: it adds the three new values, keeps the old ones,
and pins the new record. The old record was kept as a file. The gateway then admitted the board, with trustzone
trust and the same key as before.

Later the same day the card was taken out and put back. The board came up on the same image and was admitted with
no new endorsement.

One thing was lost in the restart: the firewall on the board's Linux, which is not persistent. That is on
[the next page](/projects/fpga-soc/microchip-polarfire-soc/aegis/bench-and-reproduce/k22-host-hardening-on-the-zynq-endpoint/).

## The way back

The image from before stays on the card. Going back is that image as `BOOT.BIN`, the earlier endorsement record,
and a new signed policy that pins it, with a higher version number. If the board does not reach Linux, the card
goes into a reader on the PC, which takes ten to fifteen minutes. Neither was needed.

## What this does not show

- **The fixes were not tested on the board.** The run shows that 4.11.0 boots, keeps the key and serves the
  gateway. That the fixes are in the image is known from the source history.
- **No regression and no soak at this step.** The first full regression on this image is the one on
  [the review fixes page](/projects/fpga-soc/microchip-polarfire-soc/aegis/bench-and-reproduce/k18-the-review-fixes-on-the-bench/),
  four days later.
- **It is still a development configuration.** The image is built with `CFG_INSECURE=y`, OP-TEE's default, as
  the 4.7.0 image was. OP-TEE prints a warning at boot and allows its insecure fall-backs. Turning it off is a
  separate step with its own image, measurement and endorsement. It has not been built or tested here.
- **The kernel, the device tree and `boot.scr` are not measured.** That
  [limit](/projects/fpga-soc/microchip-polarfire-soc/aegis/zynq-ultrascale-endpoint/x11-what-the-review-fixed-and-what-stays-open/)
  is unchanged.

## Lesson

The riskiest part of this upgrade was not the boot. It was a key that could have changed without any error, and a
function that could have gone unused without any warning. Both were settled on the PC, with a test that can fail,
before the card was touched.
