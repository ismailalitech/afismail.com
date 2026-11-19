+++
title = "A gateway that hung for seven hours, and a watchdog nobody was feeding"
date = '2026-11-19T06:35:00+01:00'
draft = false
description = "The PolarFire gateway stopped overnight without an error, and stayed stopped for about seven hours until it was power-cycled. The chip has a hardware watchdog, and systemd had left it off. Now systemd drives it, a test showed the gateway resetting itself and coming back, a lock-up becomes a panic whose reason a PC records from the kernel console, and the PC checks every 2 minutes that the gateway still admits its endpoints."
weight = 20

[params]
+++

## Symptom

On the night of 18 to 19 November the gateway stopped. Its journal ends at 22:56 UTC with no error. The only unusual
line earlier was `mpfs_rtc: timed out uploading time to rtc`. For about seven hours nothing attested the endpoints. A
power cycle brought it back.

## Cause

Unknown. The journal is kept on the SD card, and it shows nothing before the stop. One hang is not enough to find it,
and the project does not claim a cause.

## What was missing

Not knowing the cause, the question became why the board did not recover by itself. The chip has a hardware
watchdog (`mpfs_wdt`, 28 s, `nowayout`: once opened it cannot be stopped). systemd can feed it and let it reset the
board when systemd itself or the kernel stops. On this image systemd had it switched off.

## Fix

A drop-in, `/etc/systemd/system.conf.d/aegis-watchdog.conf`:

```ini
[Manager]
RuntimeWatchdogSec=20s
RebootWatchdogSec=25s
```

`RuntimeWatchdogSec` makes systemd open the hardware watchdog and feed it while it runs. `RebootWatchdogSec`
limits a reboot that itself hangs to 25 s.

## Test

For one boot systemd was made to let go of the watchdog without feeding it. The gateway reset itself after 25 s and
came back with its services.

## The next hang should leave its reason

A watchdog reset brings the board back, but it leaves nothing behind: the journal of the 18 November hang ended
without a line about it, because a hung kernel writes nothing more to the SD card. Two more changes make the next one
readable.

A second file, `/etc/sysctl.d/90-aegis-lockup.conf`:

```ini
kernel.softlockup_panic = 1
kernel.panic_on_oops = 1
kernel.panic = 10
```

A soft lock-up or an oops now becomes a panic. The kernel prints the reason and its call trace on its console, ttyS1,
and reboots after 10 s. The hardware watchdog stays as the backstop for a hang that never gets as far as a panic.

The console has to be recorded somewhere that does not hang with the board. On the Discovery Kit, ttyS1 comes out on
the embedded FlashPro5's second UART, so the bench PC sees it as a USB serial port. `tools/console_logger.py` records
it: every line gets the PC's time, a new file starts each day and at 20 MB, and if the port disappears, as when the
board is unplugged, it waits and opens it again.

```sh
tools/console_logger.py /dev/ttyUSB2 logs/gateway-console
```

The port number depends on the PC. The project's evidence holds no recorded panic yet.

## Noticing a quiet gateway

The hang went unnoticed for seven hours because nothing outside the board was looking. The watchdog and the panic
settings act on the board; neither tells anyone. A last change on the PC does: `tools/bench_watch.py`.

```sh
tools/bench_watch.py --gateway <gateway>          # every 2 minutes; --once for one check
```

Every 2 minutes it makes one read-only SSH call to the gateway (`date`, `systemctl is-active`, `journalctl`) and
checks three things:

- the gateway answers;
- the `aegis-fleet` unit is active;
- each expected endpoint has an ADMITTED line in the gateway's journal in the last 10 minutes.

The 10 minutes are counted on the gateway's own clock, so a wrong clock on either machine does not matter. An item is
DOWN only after 2 failed checks in a row, and OK again after one good check. Only these changes are written, one line
each, to an events log; a status file holds the current state. While the gateway or the fleet unit is down, the
endpoints are not checked, so one failure gives one line, not one per endpoint. With `--once` it checks once, prints
the result and exits 0 only if everything is OK.

## What it does and does not cover

- It covers a hang of the kernel or of systemd itself: the watchdog is no longer fed and the board resets.
- A soft lock-up or an oops now panics and reboots after 10 s, with its reason on a console the PC keeps.
- It does not recover a service that stops working while the system runs. systemd keeps feeding the hardware watchdog
  then. A stopped `aegis-fleet`, or one that no longer admits an endpoint, is now noticed by the watcher on the PC,
  but nothing restarts it.
- It does not explain the hang of 18 November.

## Undo

Delete the drop-in and run `systemctl daemon-reexec`. Because of `nowayout`, the watchdog keeps running once it has
been opened. Delete `90-aegis-lockup.conf` and reboot.

## What it means for you

- A device that makes decisions for others should restart itself when it hangs. Check that the hardware watchdog is
  really being fed, not only that the driver is loaded.
- Test the watchdog by letting it expire once, on the bench, and watch the board come back.
- Make a hang leave evidence: turn lock-ups into panics, and record the kernel console on another machine.
- Watch the device from outside. A check every few minutes from another machine turns a silent stop of hours into a
  line in a log.
