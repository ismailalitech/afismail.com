+++
title = "Seven policy versions for one board: the signed-policy trail, 9 to 15"
date = '2026-11-26T09:55:00+01:00'
draft = false
description = "Between 21 and 26 November 2026 the signed policy for the Zynq UltraScale+ endpoint went from version 9 to version 15. Every change to the boot image changed a measurement, every changed measurement quarantined the board, and every quarantine ended with a new endorsement record and a new, higher signed policy that pins it. One table with what each version added, why an entry pins only one record, where the old records went, and why going back means signing upward."
weight = 100

[params]
+++

The pages on the Zynq UltraScale+ endpoint in this section each end the same way: quarantined, endorsed again,
admitted. Each of those endings used up one version of the signed policy. This page puts the versions in one
place, 9 to 15, all for one board.

## The mechanism, once

The gateway admits this board on two conditions, and a signed policy carries both:

- **An allow-list.** Every measurement in the board's quote must be a value the policy lists for that component.
- **One pin.** The quote must match an endorsement record, and the policy names that record by its hash.

A new boot image changes at least one measurement. After the restart the board fails one of the two conditions
and the gateway quarantines it. That is the design, not a fault. The way out has the same steps every time:

1. The board's quote is appraised against a reference written down before the build.
2. A new endorsement record is enrolled.
3. A new policy is signed, with a higher version, the new values in the allow-list and the new pin.
4. The gateway accepts the policy and admits the board at its next cycle. At versions 14 and 15 that was about
   seven seconds later.

The board's key did not change in any of these steps.

## The trail

| Version | Step | What the version added |
|---|---|---|
| 9 | Boot-chain hardening, stage 1, before the write | The new PMU firmware, FSBL and TF-A values in the allow-list, next to the old ones. The pin still named the old record. |
| 10 | Stage 1, after the first boot | The pin for the stage 1 record. |
| 11 | Stage 2: a second hardening patch set in TF-A, and the bitstream taken out of the boot image | New PMU firmware, FSBL and TF-A values. The quote went from seven measurements to six. A new pin. |
| 12 | Stage 3a: a third patch set in TF-A | New PMU firmware, FSBL and TF-A values. A new pin. |
| 13 | W1: [OP-TEE 4.7 to 4.11](/projects/fpga-soc/microchip-polarfire-soc/aegis/bench-and-reproduce/k21-op-tee-4-7-to-4-11-on-the-zynq-endpoint/) | New OP-TEE, PMU firmware and FSBL values. A new pin. |
| 14 | C1 to C5: [the smaller U-Boot](/projects/fpga-soc/microchip-polarfire-soc/aegis/bench-and-reproduce/k19-a-smaller-u-boot-measured-and-endorsed/) | New U-Boot, PMU firmware and FSBL values. A new pin. |
| 15 | C6: [U-Boot without the key window](/projects/fpga-soc/microchip-polarfire-soc/aegis/bench-and-reproduce/k20-u-boot-without-the-key-window/) | New U-Boot, PMU firmware and FSBL values. A new pin. |

Versions 9 to 13 were signed over 21 and 22 November 2026 (the early stages), versions 14 and 15 on 26 November.

The PMU firmware and the FSBL are in every row. They are encrypted, and every encrypted build uses new
initialisation vectors, so their measurements change even when their inputs do not.

Stage 1 is the only step that took two versions. Version 9 put the new values in the allow-list before the image
was written, with the old pin kept. The board then booted, was quarantined because its quote no longer matched the
pinned record, and version 10 moved the pin. For the latest steps (versions 14 and 15), one version carried both the values and the pin, and
it was signed after the first boot on the new image.

## One pin per entry

The allow-list grows. Every version kept all the older values next to the new ones.

The pin does not grow. An entry names one endorsement record, as a single hash, so a new pin replaces the old
one. The old records are not in the policy any more. They are kept as backup files, each named after
the step it belonged to. The policy files of each earlier version are kept the same way.

So an older image is in a mixed state. Its measurements are still in the allow-list, but its record is not pinned.
If it boots, the gateway quarantines it.

## Going back means signing upward

The gateway refuses a policy with a version lower than the one it holds. The saved policy of an earlier version
cannot be put back as it is.

Going back one step is therefore four things: the kept image back as `BOOT.BIN`, the kept record back in place,
the pin in the policy set back to that record, and the policy signed again with a new version. After version 15 a
return to any earlier image would be version 16 or higher. A rollback costs a version number, like a step forward.

None of the seven steps needed its way back.

## Limits

- **The allow-list has not been pruned.** Values of images that no longer run are still listed. The pin keeps
  those images out, so the list alone decides nothing here, but it is longer than it needs to be.
- **Every step is done by hand.** Appraising, enrolling, signing and copying the policy to the gateway are
  commands typed by one operator. Seven versions in six days is cheap on a bench with one such board. It is not
  a process for a fleet.
- **The quarantine window is real downtime.** Between the restart and the new policy the board is out of the
  fleet. Here that was minutes, with the operator waiting for it.
- **Versions 9 to 12 have no page of their own.** The stages behind them are named here only by what changed in
  the measurements. The table comes from the bench notes, not from a published log.
- **The policy pins what is measured.** The kernel, the device tree and `boot.scr` are
  [not measured](/projects/fpga-soc/microchip-polarfire-soc/aegis/zynq-ultrascale-endpoint/x11-what-the-review-fixed-and-what-stays-open/),
  so no version in this table says anything about them.

## Lesson

A version number in this policy is a count of how often the boot chain changed. Seven changes, seven quarantines,
seven signatures. The single pin is what makes that strict: the gateway does not admit a board on any image it
has ever known, only on the one that was endorsed last.
