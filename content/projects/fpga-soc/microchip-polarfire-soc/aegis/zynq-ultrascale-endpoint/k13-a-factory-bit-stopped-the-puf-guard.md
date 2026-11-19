+++
title = "A factory bit stopped the PUF guard, and an eFUSE read came too early"
date = '2026-11-19T06:24:00+01:00'
draft = false
description = "The read-only eFUSE guard in front of the PUF registration refused to run: a PUF_MISC bit was set that nobody had written. It is a reserved bit set on this chip from the factory. A second check compared IPDISABLE read before the PL was up. Both guards were refined, not removed, and the registration ran with nothing written."
weight = 62

[params]
+++

Found in the first PUF registration of the Zynq UltraScale+ endpoint
([lab 63](/projects/fpga-soc/microchip-polarfire-soc/aegis/zynq-ultrascale-endpoint/a16-a-key-from-the-puf/)).

## The guard

AMD's PUF registration example can write eFUSEs, and that cannot be undone. Before it runs, `xsdb` takes a read-only
snapshot of the eFUSE cache and refuses unless the PUF's own eFUSEs are blank. After the run and a power cycle, the
snapshot is taken again and compared, to show that nothing was written.

## Symptom

The first try stopped at the guard, before the example ran. `PUF_MISC` was not blank: bit 28 was set.

## Finding it

Bit 28 of `PUF_MISC` is `XSK_ZYNQMP_EFUSEPS_PUF_MISC_RESERVED`. It was read again with Linux up, outside any
registration: set. Nothing on this bench had written to the chip's eFUSEs, so it was set from the factory on this
chip. xilskey's own access check, which decides whether registration is allowed, ignores this bit. The guard was
stricter than the library it guarded, on a bit that does not affect registration.

The bench run also showed a second problem. The snapshot had been read too soon after power-on, and included `IPDISABLE`
read before the PL was up. That register's VCU bit is valid only once the PL is configured, so a before-and-after
comparison including it can differ with no fuse changed.

## Fix

The guard was made precise, not weaker:

- It refuses if any of the bits that matter for the PUF is set: CHASH, AUX, REG_DIS, SYN_WRLK and SYN_INVLD.
  `PUF_MISC` bit 28 is logged, not refused.
- The script starts before power-on and takes the snapshot 3 s after the PSU appears to xsdb, twice, and requires both to
  match and the eFUSE cache to report that it has loaded.
- The comparison after the run leaves `IPDISABLE` out.

## Result

The registration completed. The eFUSE cache before the run and after a power cycle: 44 registers identical.

## What it means for you

- A guard in front of an irreversible step should check exactly the bits that decide it, as the library does, and log
  the rest.
- Read a chip's state when it is fully up, and know which registers are only valid after a later step.
