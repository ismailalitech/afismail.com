+++
title = "An ELS key in the last slot reset the chip"
date = '2026-11-18T00:40:00+01:00'
draft = false
description = "The first RW612 prover printed nothing at all, not even Zephyr's boot banner, and the debugger showed a kernel clock standing still. The cause was a 256-bit key asked for in ELS slot 19, which has no partner slot. Found by bisecting the build, fixed by choosing an even slot with a free pair."
weight = 65

[params]
+++

The first build of the RW612 prover ([lab 57](/projects/fpga-soc/microchip-polarfire-soc/aegis/attesting-an-endpoint/a11-a-key-from-the-chip-on-the-rw612/))
flashed without an error and then showed nothing. The same board ran Zephyr's DHCP sample a minute earlier.

## Symptom

- The console stayed empty after a reset: no `*** Booting Zephyr ***` line, which Zephyr prints before `main()`.
- Through the debugger the CPU sat in Zephyr's idle loop, the main thread slept in the Ethernet PHY driver's 500 ms
  start-up delay, and the kernel tick count was 0. The OS timer's interrupt was enabled and pending; its handler ran,
  but no tick was ever counted.

That looks like a broken system timer, and the first hours went there. It was not: the chip was resetting about once a
second, and those readings were taken on a system that kept starting over. Why the tick count read 0 at each halt was
not worked out further once the real cause was found.

## Finding it

One change at a time, each built and flashed:

| Build | Result |
|---|---|
| The prover's configuration with a trivial `main()` | boots, ticks |
| The same plus a 150 KB buffer (the prover's RAM use) | boots, ticks |
| The prover's sources linked but not called | boots, ticks |
| The same plus a 64 KB thread stack | boots, ticks |
| The prover with the ELS calls replaced by fixed seeds | boots, derives a key, gets an address, listens |
| The prover with ELS, and `CONFIG_LOG_MODE_IMMEDIATE=y` | **resets in a loop** |

The last line explains the silence. Zephyr's default logging is deferred: messages wait in a buffer for a logging
thread. The board reset before that thread ever ran, so even the boot banner, already queued, never reached the
console. With immediate logging, every line appears as it is written, and the console showed the prover starting over
and over. A trace before each ELS call put the reset in the key derivation, after all twenty key slots had been read
without trouble.

## Cause

On ELS a 256-bit key takes **two consecutive slots**: a base slot and the next one. The die master key itself is slots
0 and 1 (`0x60010161`, `0x60010121`: the second has no base flag). The prover looked for a free slot from the top and
found slot 19, the last, as the base for its 256-bit temporary key. There is no slot 20. ELS treats that as a fault,
and an ELS fault resets the chip.

![The twenty ELS key slots: the die key in 0 and 1, ROM keys in 2, 3, 6 and 7; the first version used base slot 19, which has no partner, and the chip reset; the fix uses an even base slot with a free partner, 18 and 19](/aegis/diagrams/els-slots.svg)

## Fix

Look for an even base slot whose partner is also empty, from the top: slots 18 and 19. The temporary key is deleted
after the two HMAC values, so the slots are free again for the next start.

```c
for (int s = MCUXCLELS_KEY_SLOTS - 2; s >= 2; s -= 2) {
	if (empty(s) && empty(s + 1)) {
		return s;   /* base slot of a 256-bit key */
	}
}
```

The prover also stopped calling `mcuxClEls_Enable_Async()`: the boot ROM has already switched ELS on, and that call
writes the whole control register. Removing it alone did not stop the resets.

## Result

The board boots, derives the same key on every start (`sha256 219414c5...`), and has been attested and provisioned by
the gateway since. Two lessons outlast this board: a fault that resets the chip early can look exactly like a hang
when logging is deferred, and when the debugger shows something that cannot be (a timer that never moves), the
symptom may be one step removed from the cause.
