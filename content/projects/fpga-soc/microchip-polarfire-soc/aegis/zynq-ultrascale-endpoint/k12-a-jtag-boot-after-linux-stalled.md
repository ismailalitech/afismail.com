+++
title = "A JTAG boot after Linux stalled in init_serdes: start from power-on"
date = '2026-11-19T06:22:00+01:00'
draft = false
description = "A JTAG RAM boot of the Zynq UltraScale+ that worked from power-on stalled in the FSBL's init_serdes when Linux had run before it. Linux 6.12 powers down the PM domains it does not use, and a JTAG system reset does not power them up again."
weight = 61

[params]
+++

Found while testing phase A of the Zynq UltraScale+ endpoint
([lab 62](/projects/fpga-soc/microchip-polarfire-soc/aegis/zynq-ultrascale-endpoint/a15-optee-holds-the-key/)).
Every new boot image is first tried over JTAG into RAM, before it goes on the card
([lab 61](/projects/fpga-soc/microchip-polarfire-soc/aegis/zynq-ultrascale-endpoint/a14-our-boot-chain-and-the-accelerator/)).

## Symptom

The JTAG script (`windows/jtag_boot.tcl`) sets the boot mode to JTAG, runs `rst -system`, then loads the PMU firmware
and the FSBL. Started while the board was running Linux 6.12 from the card, the FSBL stalled in `init_serdes`, part
of the PS set-up it runs from `psu_init`. Started after a power-on, the same script and the same files booted.

## Cause

Linux 6.12 powers down the power-management domains it does not use. Those domains stay off across a JTAG
`rst -system`, and the FSBL's SERDES set-up then stalls.

## Fix

A JTAG test starts from power-on: 12 V on, S1, then the script. The project's evidence records the rule with the phase A results. After
a JTAG test the board needs another power cycle to boot from the card, because the JTAG boot mode stays set until
power-on reset (S1 twice).

## What it means for you

- `rst -system` over JTAG is not a power-on. What the last running software powered down can stay down.
- When a JTAG boot behaves differently from the previous one, compare what ran before it.
